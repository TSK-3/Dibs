// server/users.js — the identity directory.
// Same philosophy as the live-interrupt claim store (../src/store.js): an
// in-memory Map with an atomic JSON snapshot, no database, no ORM, no lock-in.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export const USER_ID_PREFIX = 'usr_';

/**
 * Deterministic, provider-scoped, non-reversible id. Same provider account ⇒
 * same id on every machine and every restart, with no lookup first.
 */
export function userIdFor(provider, providerId) {
  return (
    USER_ID_PREFIX +
    crypto.createHash('sha256').update(`${provider}:${providerId}`).digest('hex').slice(0, 16)
  );
}

export class UserStore {
  constructor({ filePath, logger = console } = {}) {
    this.filePath = filePath;
    this.log = logger;
    this.users = new Map(); // user_id → record
    this.restore();
  }

  get(userId) {
    return this.users.get(userId) ?? null;
  }

  findByProvider(provider, providerId) {
    for (const user of this.users.values()) {
      if (user.provider === provider && user.providerId === providerId) return user;
    }
    return null;
  }

  /**
   * Idempotent sign-in write. First sign-in creates the record; later ones
   * refresh the fields the provider owns (display name, avatar, email) and bump
   * the login counters. `createdAt` is never moved.
   */
  upsertFromProfile(profile, { now = Date.now() } = {}) {
    const id = userIdFor(profile.provider, profile.providerId);
    const existing = this.users.get(id);
    const iso = new Date(now).toISOString();
    const record = {
      id,
      provider: profile.provider,
      providerLabel: profile.providerLabel ?? profile.provider,
      providerId: String(profile.providerId),
      name: profile.name ?? 'Unknown user',
      username: profile.username ?? null,
      email: profile.email ?? null,
      emailVerified: profile.emailVerified === true,
      avatarUrl: profile.avatarUrl ?? null,
      createdAt: existing?.createdAt ?? iso,
      lastLoginAt: iso,
      loginCount: (existing?.loginCount ?? 0) + 1,
    };
    this.users.set(id, record);
    this.save();
    return record;
  }

  count() {
    return this.users.size;
  }

  serialize() {
    return {
      version: 1,
      savedAt: new Date().toISOString(),
      users: Object.fromEntries(this.users),
    };
  }

  save() {
    if (!this.filePath) return;
    const data = JSON.stringify(this.serialize(), null, 2);
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
      this.log.error?.(`[users] snapshot write failed: ${err.message}`);
    }
  }

  restore() {
    if (!this.filePath || !fs.existsSync(this.filePath)) return;
    let raw;
    try {
      raw = fs.readFileSync(this.filePath, 'utf8');
    } catch (err) {
      this.log.warn?.(`[users] cannot read directory: ${err.message}`);
      return;
    }
    try {
      const snapshot = JSON.parse(raw);
      for (const [id, user] of Object.entries(snapshot?.users ?? {})) {
        if (user && typeof user === 'object' && user.provider && user.providerId) {
          this.users.set(id, user);
        }
      }
      this.log.log?.(`[users] restored ${this.users.size} identity record(s) from ${this.filePath}`);
    } catch (err) {
      // Never let a corrupt directory brick sign-in — back it up, start empty.
      const corrupt = `${this.filePath}.corrupt-${Date.now()}`;
      try {
        fs.renameSync(this.filePath, corrupt);
      } catch {
        /* ignore */
      }
      this.log.warn?.(`[users] directory unreadable (${err.message}) — backed up to ${corrupt}, starting empty`);
    }
  }
}
