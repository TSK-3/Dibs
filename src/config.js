// src/config.js — every knob in one place. Change here, not in code.
import path from 'node:path';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// ── Scope enum (PRD §3.3) ─────────────────────────────────────────────────
// CLOSED enum — MUST match the module list Surya's on-device model is
// constrained to. Replace DEFAULT_SCOPES with Surya's list before the demo.
// Override without touching code:  SCOPES="auth,payments,ml"   (env var)
//                              or  SCOPES_FILE=./scopes.json  ({"scopes": [...]})
const DEFAULT_SCOPES = [
  'auth', 'payments', 'database', 'api', 'ui', 'networking',
  'notifications', 'settings', 'infra', 'ml', 'search', 'storage',
];

function loadScopes() {
  const parse = (arr) => [...new Set(arr.map((s) => String(s).trim()).filter(Boolean))];
  try {
    if (process.env.SCOPES_FILE) {
      const parsed = JSON.parse(readFileSync(process.env.SCOPES_FILE, 'utf8'));
      const list = Array.isArray(parsed) ? parsed : parsed.scopes;
      const scopes = parse(list ?? []);
      if (scopes.length) return scopes;
    }
  } catch (err) {
    console.warn(`[config] could not load SCOPES_FILE (${err.message}) — falling back`);
  }
  if (process.env.SCOPES) {
    const scopes = parse(process.env.SCOPES.split(','));
    if (scopes.length) return scopes;
  }
  return DEFAULT_SCOPES;
}

export const SCOPES = loadScopes();
export const SCOPE_SET = new Set(SCOPES);

export const PORT = Number(process.env.PORT || 8080);
// 0.0.0.0 so phone clients on venue wifi can reach the server during the demo.
export const HOST = process.env.HOST || '0.0.0.0';
export const WS_PATH = process.env.WS_PATH || '/ws';

// Snapshot persistence (PRD §3.2) — written on every mutation, restored on boot.
export const SNAPSHOT_PATH =
  process.env.SNAPSHOT_PATH || path.join(ROOT_DIR, 'snapshots', 'claims-snapshot.json');

// Claims auto-expire after this long. 0 = never expire (strict PRD behaviour).
// Set CLAIM_TTL_MS=1800000 (30 min) if you want stale demo claims to self-clear.
export const CLAIM_TTL_MS = Number(process.env.CLAIM_TTL_MS || 0);

export const MAX_MESSAGE_BYTES = 64 * 1024;
export const PING_INTERVAL_MS = Number(process.env.PING_INTERVAL_MS || 30_000);

// ── Hardening (production-grade additions; all overridable, safe defaults) ──
export const LOG_LEVEL = process.env.LOG_LEVEL || 'info';
export const LOG_JSON = process.env.LOG_JSON === '1';

// Per-connection rate limit (token bucket): burst of 30 messages, refills
// at 10/sec — a human narrating intents or an MCP agent can never hit it.
export const RATE_CAPACITY = Number(process.env.RATE_CAPACITY || 30);
export const RATE_REFILL_PER_SEC = Number(process.env.RATE_REFILL_PER_SEC || 10);
// Refuse new sockets beyond this many (accidental fork-bomb / bad client loop).
export const MAX_CLIENTS = Number(process.env.MAX_CLIENTS || 500);
// Optional shared-secret: clients pass ?token=… (or hello.token). Empty = open.
export const AUTH_TOKEN = process.env.AUTH_TOKEN || '';

// Identity hygiene — safe as object keys, log lines, and snapshot JSON.
export const ID_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,63}$/;
export const MAX_FIELD_LENGTH = 512; // summary/rationale chars

