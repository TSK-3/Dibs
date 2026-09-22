// server/pairing.js — agent-pairing tokens: the credential that lets a real
// coding agent (Cursor, Claude Code…) post work-intent claims AS a user.
//
// Same philosophy as the identity directory (users.js) and the workspace
// directory (workspaces.js): an in-memory Map with an atomic JSON snapshot,
// no database. One token exists per {user_id, team_id} pair.
//
// Threat model: this token IS the user as far as the MCP server is concerned —
// so it is generated from 32 cryptographically random bytes (never a short or
// predictable format like the 6-digit invite code, which only guards joining).
// On disk the plaintext is sealed with the same AES-256-GCM secretbox used for
// provider tokens (secretbox.js); the Map is keyed by the token's sha256 so
// lookups never need the plaintext, and only the hash + sealed value persist.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { encryptSecret, decryptSecret, isSealed } from './secretbox.js';

export const PAIRING_TOKEN_PREFIX = 'ilp_';
export const PAIRING_TOKEN_BYTES = 32; // → ~43 base64url chars + prefix

/** 43+ chars of cryptographic randomness — treat like an API key. */
export function generatePairingToken() {
  return PAIRING_TOKEN_PREFIX + crypto.randomBytes(PAIRING_TOKEN_BYTES).toString('base64url');
}

/** Lookup key: only the hash is ever stored in plaintext. */
export function hashPairingToken(token) {
  return crypto.createHash('sha256').update(`interlock-pairing:${String(token ?? '')}`).digest('hex');
}

export function pairingTokensMatch(storedHash, candidateToken) {
  const candidate = Buffer.from(hashPairingToken(candidateToken), 'hex');
  const stored = Buffer.from(String(storedHash ?? ''), 'hex');
  if (candidate.length !== stored.length) return false;
  return crypto.timingSafeEqual(candidate, stored);
}

export class PairingStore {
  constructor({ filePath, logger = console, encryptionKey = null, initialSnapshot = null, remoteSave = null } = {}) {
    this.filePath = filePath;
    this.log = logger;
    // Sealing uses the session-secret-derived key (same as provider tokens).
    this.encryptionKey = encryptionKey;
    // Durable remote storage (serverless deploys, see server/cloudStore.js):
    // hydrate from a snapshot at boot and mirror every mutation back.
    this.remoteSave = remoteSave;
    this.pendingSave = Promise.resolve();
    this.pairings = new Map(); // tokenHash → record { user_id, team_id, sealedToken, … }
    if (initialSnapshot) {
      const count = this.hydrate(initialSnapshot);
      this.log.log?.(`[pairing] restored ${count} pairing token(s) from remote snapshot`);
    } else {
      this.restore();
    }
  }

  /** Tokens never touch disk in plaintext when an encryption key is present. */
  sealToken(token) {
    return this.encryptionKey ? encryptSecret(token, this.encryptionKey) : token;
  }

  openToken(sealed) {
    if (typeof sealed !== 'string') return null;
    if (isSealed(sealed) && this.encryptionKey) return decryptSecret(sealed, this.encryptionKey);
    return this.encryptionKey ? null : sealed; // plaintext only readable in keyless (test) mode
  }

  /**
   * Issue (or rotate) the token for a {user_id, team_id} pair. Issuing is the
   * regenerate path too: any previous token for the pair is deleted first, so
   * rotation invalidates the old credential immediately.
   */
  issue(userId, teamId, { now = Date.now() } = {}) {
    const iso = new Date(now).toISOString();
    // A user has at most one token per team — drop every predecessor.
    for (const [hash, record] of [...this.pairings]) {
      if (record.user_id === userId && record.team_id === teamId) this.pairings.delete(hash);
    }
    const token = generatePairingToken();
    const record = {
      user_id: userId,
      team_id: teamId,
      sealedToken: this.sealToken(token),
      createdAt: iso,
      rotatedAt: null,
      lastUsedAt: null,
    };
    this.pairings.set(hashPairingToken(token), record);
    this.save();
    return { token, record };
  }


  /**
   * Resolve a Bearer token to its {user_id, team_id}. Returns null for unknown,
   * revoked (rotated away), or malformed tokens — the MCP middleware turns a
   * null into an immediate 401.
   *
   * NOTE: lastUsedAt is bumped in memory only and deliberately NOT persisted.
   * Persisting it would mean every agent tool call writes this instance's full
   * snapshot back to remote storage — and on serverless (last-write-wins) a
   * stale instance could clobber a concurrent rotation, resurrecting a revoked
   * token. Durability only ever flows through explicit user mutations.
   */
  resolve(token) {
    if (typeof token !== 'string' || !token.startsWith(PAIRING_TOKEN_PREFIX)) return null;
    const tokenHash = hashPairingToken(token);
    const record = this.pairings.get(tokenHash);
    if (!record) return null;
    // Defense in depth: the hash matched, still compare constant-time and
    // confirm the sealed plaintext round-trips under the current key.
    if (!pairingTokensMatch(tokenHash, token)) return null;
    if (!this.openToken(record.sealedToken)) return null;
    record.lastUsedAt = new Date().toISOString();
    return { user_id: record.user_id, team_id: record.team_id, record };
  }

  /** The plaintext token for display, or null when absent/unreadable. */
  reveal(userId, teamId) {
    for (const record of this.pairings.values()) {
      if (record.user_id === userId && record.team_id === teamId) return this.openToken(record.sealedToken);
    }
    return null;
  }

  /** Metadata (never the token itself) for API responses. */
  describe(userId, teamId) {
    for (const record of this.pairings.values()) {
      if (record.user_id === userId && record.team_id === teamId) {
        return { createdAt: record.createdAt, rotatedAt: record.rotatedAt, lastUsedAt: record.lastUsedAt };
      }
    }
    return null;
  }

  /** Regenerate: new token, old one invalid immediately. */
  rotate(userId, teamId, { now = Date.now() } = {}) {
    const previous = this.describe(userId, teamId);
    const { token } = this.issue(userId, teamId, { now });
    return { token, previous, rotatedAt: new Date(now).toISOString() };
  }

  count() {
    return this.pairings.size;
  }

  serialize() {
    return {
      version: 1,
      savedAt: new Date().toISOString(),
      pairings: Object.fromEntries(this.pairings),
    };
  }

  save() {
    const snapshot = this.serialize();
    if (this.remoteSave) {
      // Queue writes so mutations cannot overtake one another. API handlers
      // await waitForPersistence before acknowledging a durable mutation.
      this.pendingSave = this.pendingSave
        .catch(() => {})
        .then(() => this.remoteSave(snapshot))
        .catch((err) => {
          this.log.error?.(`[pairing] remote save failed: ${err?.message ?? err}`);
        });
    }

    if (!this.filePath) return;
    const data = JSON.stringify(snapshot, null, 2);
    try {
      fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
      const tmp = `${this.filePath}.${process.pid}.tmp`;
      fs.writeFileSync(tmp, data, 'utf8');
      try {
        fs.renameSync(tmp, this.filePath); // atomic-ish swap
      } catch {
        // Windows can briefly lock the destination — fall back to a direct write.
        fs.writeFileSync(this.filePath, data, 'utf8');
        try {
          fs.unlinkSync(tmp);
        } catch {
          /* best effort */
        }
      }
    } catch (err) {
      // Serverless filesystems are read-only — the remoteSave above is the
      // durability path there; this is best-effort for single-process deploys.
      this.log.error?.(`[pairing] snapshot write failed: ${err.message}`);
    }
  }

  /** Wait until the latest mutation has been mirrored to durable storage. */
  async waitForPersistence() {
    await this.pendingSave;
  }

  hydrate(snapshot) {
    let count = 0;
    for (const [hash, record] of Object.entries(snapshot?.pairings ?? {})) {
      if (
        record && typeof record === 'object' &&
        typeof record.user_id === 'string' && typeof record.team_id === 'string' &&
        typeof record.sealedToken === 'string'
      ) {
        this.pairings.set(hash, record);
        count += 1;
      }
    }
    return count;
  }

  restore() {
    if (!this.filePath || !fs.existsSync(this.filePath)) return;
    let raw;
    try {
      raw = fs.readFileSync(this.filePath, 'utf8');
    } catch (err) {
      this.log.warn?.(`[pairing] cannot read snapshot: ${err.message}`);
      return;
    }
    try {
      const snapshot = JSON.parse(raw);
      const count = this.hydrate(snapshot);
      this.log.log?.(`[pairing] restored ${count} pairing token(s) from ${this.filePath}`);
    } catch (err) {
      const corrupt = `${this.filePath}.corrupt-${Date.now()}`;
      try {
        fs.renameSync(this.filePath, corrupt);
      } catch {
        /* ignore */
      }
      this.log.warn?.(`[pairing] snapshot unreadable (${err.message}) — backed up to ${corrupt}, starting empty`);
    }
  }
}
