// server/workspaces.js — the workspace directory for the web console.
//
// Same philosophy as the identity directory (users.js): an in-memory Map with
// an atomic JSON snapshot, no database. A workspace binds a human-readable
// name to a GitHub repository, an owner, members, and a 6-digit invite code.
// The code is stored as a sha256 hash only — it is shown exactly once (at
// creation or regeneration) and verified with a timing-safe compare after that.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export const WORKSPACE_ID_PREFIX = 'wsp_';
export const INVITE_CODE_LENGTH = 6;

const REPO_FULL_NAME_PATTERN = /^[\w.-]+\/[\w.-]{1,100}$/;

export function workspaceId() {
  return WORKSPACE_ID_PREFIX + crypto.randomBytes(6).toString('hex');
}

/** 6-digit code with leading zeros preserved; only its hash is ever stored. */
export function generateInviteCode() {
  return String(crypto.randomInt(0, 10 ** INVITE_CODE_LENGTH)).padStart(INVITE_CODE_LENGTH, '0');
}

export function hashInviteCode(code) {
  return crypto.createHash('sha256').update(`interlock-invite:${code}`).digest('hex');
}

export function inviteCodesMatch(storedHash, candidateCode) {
  const candidate = hashInviteCode(String(candidateCode ?? ''));
  const a = Buffer.from(storedHash, 'hex');
  const b = Buffer.from(candidate, 'hex');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

/** Validate + normalize the POST /api/workspaces body. */
export function validateWorkspaceInput(body) {
  const name = typeof body?.name === 'string' ? body.name.trim() : '';
  if (name.length < 1 || name.length > 64) {
    return { ok: false, detail: 'name must be 1-64 characters' };
  }
  const repoInput = body?.repo ?? {};
  const fullName = typeof repoInput.fullName === 'string' ? repoInput.fullName.trim() : '';
  if (!REPO_FULL_NAME_PATTERN.test(fullName)) {
    return { ok: false, detail: 'repo.fullName must look like "owner/repo"' };
  }
  const str = (value, max) => (typeof value === 'string' && value.trim() ? value.trim().slice(0, max) : null);
  const repo = {
    fullName,
    private: repoInput.private === true,
    defaultBranch: str(repoInput.defaultBranch, 120),
    htmlUrl: str(repoInput.htmlUrl, 300),
  };
  if (repo.htmlUrl && !/^https:\/\/[\w.-]+(\/[\w.\-/?=&%#]*)?$/.test(repo.htmlUrl)) repo.htmlUrl = null;
  return { ok: true, name, repo };
}

/** The member shape stored in a workspace record (public profile fields only). */
export function publicMember(user) {
  return {
    userId: user.id,
    name: user.name,
    username: user.username ?? null,
    avatarUrl: user.avatarUrl ?? null,
    provider: user.provider,
  };
}

/** API responses never include the invite-code hash. */
export function publicWorkspace(record) {
  const { inviteCodeHash, ...rest } = record;
  return rest;
}

export class WorkspaceStore {
  constructor({ filePath, logger = console } = {}) {
    this.filePath = filePath;
    this.log = logger;
    this.workspaces = new Map(); // id → record
    this.restore();
  }

  get(id) {
    return this.workspaces.get(id) ?? null;
  }

  isMember(record, userId) {
    if (!record) return false;
    return record.ownerUserId === userId || record.members.some((m) => m.userId === userId);
  }

  listForUser(userId) {
    return [...this.workspaces.values()].filter((w) => this.isMember(w, userId));
  }

  /**
   * Creates a workspace owned by `owner` and returns the plaintext invite code
   * exactly once — it is the only moment the code is ever available again.
   */
  create({ owner, name, repo }, { now = Date.now() } = {}) {
    const id = workspaceId();
    const inviteCode = generateInviteCode();
    const iso = new Date(now).toISOString();
    const record = {
      id,
      name,
      repo: { ...repo },
      ownerUserId: owner.id,
      members: [publicMember(owner)],
      inviteCodeHash: hashInviteCode(inviteCode),
      createdAt: iso,
      updatedAt: iso,
    };
    this.workspaces.set(id, record);
    this.save();
    return { workspace: record, inviteCode };
  }

  findByCode(code) {
    const candidate = hashInviteCode(String(code ?? ''));
    for (const record of this.workspaces.values()) {
      if (record.inviteCodeHash.length === candidate.length && inviteCodesMatch(record.inviteCodeHash, code)) {
        return record;
      }
    }
    return null;
  }

  /** Idempotent join: an existing member joining again is a no-op success. */
  join(code, user, { now = Date.now() } = {}) {
    const record = this.findByCode(code);
    if (!record) return { ok: false, error: 'invalid_code' };
    if (!this.isMember(record, user.id)) {
      record.members.push(publicMember(user));
      record.updatedAt = new Date(now).toISOString();
      this.save();
    }
    return { ok: true, workspace: record };
  }

  /* CONTINUED-2 */

  /** Only the owner may rotate the invite code; old codes stop working. */
  regenerateCode(id, userId, { now = Date.now() } = {}) {
    const record = this.workspaces.get(id);
    if (!record) return { ok: false, error: 'not_found' };
    if (record.ownerUserId !== userId) return { ok: false, error: 'forbidden' };
    const inviteCode = generateInviteCode();
    record.inviteCodeHash = hashInviteCode(inviteCode);
    record.updatedAt = new Date(now).toISOString();
    this.save();
    return { ok: true, inviteCode };
  }

  /** Only the owner may delete the workspace (v1 has no per-member removal). */
  remove(id, userId) {
    const record = this.workspaces.get(id);
    if (!record) return { ok: false, error: 'not_found' };
    if (record.ownerUserId !== userId) return { ok: false, error: 'forbidden' };
    this.workspaces.delete(id);
    this.save();
    return { ok: true };
  }

  serialize() {
    return {
      version: 1,
      savedAt: new Date().toISOString(),
      workspaces: Object.fromEntries(this.workspaces),
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
      this.log.error?.(`[workspaces] snapshot write failed: ${err.message}`);
    }
  }

  restore() {
    if (!this.filePath || !fs.existsSync(this.filePath)) return;
    let raw;
    try {
      raw = fs.readFileSync(this.filePath, 'utf8');
    } catch (err) {
      this.log.warn?.(`[workspaces] cannot read snapshot: ${err.message}`);
      return;
    }
    try {
      const snapshot = JSON.parse(raw);
      for (const [id, record] of Object.entries(snapshot?.workspaces ?? {})) {
        if (
          record && typeof record === 'object' && typeof record.id === 'string' &&
          typeof record.name === 'string' && record.repo && typeof record.inviteCodeHash === 'string'
        ) {
          this.workspaces.set(id, record);
        }
      }
      this.log.log?.(`[workspaces] restored ${this.workspaces.size} workspace(s) from ${this.filePath}`);
    } catch (err) {
      const corrupt = `${this.filePath}.corrupt-${Date.now()}`;
      try {
        fs.renameSync(this.filePath, corrupt);
      } catch {
        /* ignore */
      }
      this.log.warn?.(`[workspaces] snapshot unreadable (${err.message}) — backed up to ${corrupt}, starting empty`);
    }
  }
}
