// src/store.js — in-memory claim store with JSON snapshot persistence (PRD §3.2).
// No database, by design: single-process demo; snapshot written on EVERY
// mutation (cheap insurance against a crash mid-demo) and restored on boot.
import fs from 'node:fs';
import path from 'node:path';

export class ClaimStore {
  constructor({ snapshotPath, logger = console }) {
    this.snapshotPath = snapshotPath;
    this.log = logger;
    // teams → scopes → (user_id → claim)
    // claim = { scope, user_id, summary, rationale, timestamp, received_at }
    this.teams = new Map();
    this.restore();
  }

  // ── reads ───────────────────────────────────────────────────────────────
  getHolders(teamId, scope) {
    const holders = this.teams.get(teamId)?.get(scope);
    if (!holders) return [];
    return [...holders.entries()].map(([user_id, claim]) => ({ user_id, claim }));
  }

  getUserClaims(teamId, userId) {
    const out = [];
    for (const [scope, holders] of this.teams.get(teamId) ?? []) {
      const claim = holders.get(userId);
      if (claim) out.push({ scope, claim });
    }
    return out;
  }

  getTeamClaims(teamId) {
    const out = [];
    for (const [scope, holders] of this.teams.get(teamId) ?? []) {
      for (const [user_id, claim] of holders) out.push({ scope, user_id, claim });
    }
    return out;
  }

  claimCount() {
    let n = 0;
    for (const scopes of this.teams.values()) for (const holders of scopes.values()) n += holders.size;
    return n;
  }

  // ── writes (each one snapshots to disk) ─────────────────────────────────
  setClaim(teamId, userId, claim) {
    let scopes = this.teams.get(teamId);
    if (!scopes) {
      scopes = new Map();
      this.teams.set(teamId, scopes);
    }
    let holders = scopes.get(claim.scope);
    if (!holders) {
      holders = new Map();
      scopes.set(claim.scope, holders);
    }
    holders.set(userId, claim);
    this.save();
  }

  removeClaim(teamId, userId, scope) {
    const scopes = this.teams.get(teamId);
    if (!scopes) return false;
    const holders = scopes.get(scope);
    if (!holders) return false;
    const removed = holders.delete(userId);
    if (removed) {
      if (holders.size === 0) scopes.delete(scope);
      if (scopes.size === 0) this.teams.delete(teamId);
      this.save();
    }
    return removed;
  }

  // Returns [{ teamId, user_id, scope, expiredAt }] for claims older than ttlMs.
  pruneExpired(ttlMs, nowTs = Date.now()) {
    const expired = [];
    for (const [teamId, scopes] of this.teams) {
      for (const [scope, holders] of scopes) {
        for (const [user_id, claim] of holders) {
          if (nowTs - (claim.received_at ?? 0) > ttlMs) {
            expired.push({ teamId, user_id, scope, expiredAt: nowTs });
          }
        }
      }
    }
    for (const e of expired) this.removeClaim(e.teamId, e.user_id, e.scope);
    return expired;
  }

  // ── snapshot ────────────────────────────────────────────────────────────
  serialize() {
    const teams = {};
    for (const [teamId, scopes] of this.teams) {
      teams[teamId] = {};
      for (const [scope, holders] of scopes) {
        teams[teamId][scope] = Object.fromEntries(holders);
      }
    }
    return { version: 1, savedAt: new Date().toISOString(), teams };
  }

  save() {
    const data = JSON.stringify(this.serialize(), null, 2);
    try {
      fs.mkdirSync(path.dirname(this.snapshotPath), { recursive: true });
      const tmp = `${this.snapshotPath}.${process.pid}.tmp`;
      fs.writeFileSync(tmp, data, 'utf8');
      try {
        fs.renameSync(tmp, this.snapshotPath); // atomic-ish swap
      } catch {
        // Windows can briefly lock the destination — fall back to a direct write.
        fs.writeFileSync(this.snapshotPath, data, 'utf8');
        try {
          fs.unlinkSync(tmp);
        } catch {
          /* best effort */
        }
      }
    } catch (err) {
      this.log.error?.('[store] snapshot write failed:', err.message);
    }
  }

  restore() {
    if (!fs.existsSync(this.snapshotPath)) return;
    let raw;
    try {
      raw = fs.readFileSync(this.snapshotPath, 'utf8');
    } catch (err) {
      this.log.warn?.(`[store] cannot read snapshot: ${err.message}`);
      return;
    }
    try {
      const snap = JSON.parse(raw);
      const teams = snap?.teams ?? {};
      for (const [teamId, scopes] of Object.entries(teams)) {
        const scopesMap = new Map();
        for (const [scope, holders] of Object.entries(scopes ?? {})) {
          const holdersMap = new Map();
          for (const [userId, claim] of Object.entries(holders ?? {})) {
            if (claim && typeof claim === 'object' && claim.summary != null) {
              holdersMap.set(userId, claim);
            }
          }
          if (holdersMap.size) scopesMap.set(scope, holdersMap);
        }
        if (scopesMap.size) this.teams.set(teamId, scopesMap);
      }
      this.log.log?.(`[store] restored ${this.claimCount()} claim(s) from ${this.snapshotPath}`);
    } catch (err) {
      // Never let a corrupt snapshot brick the server — back it up, start empty.
      const corrupt = `${this.snapshotPath}.corrupt-${Date.now()}`;
      try {
        fs.renameSync(this.snapshotPath, corrupt);
      } catch {
        /* ignore */
      }
      this.log.warn?.(`[store] snapshot unreadable (${err.message}) — backed up to ${corrupt}, starting empty`);
    }
  }
}
