// server/config.js — every knob for the Interlock identity service in one place.
// Mirrors the backend convention (../src/config.js): no magic numbers in code,
// no secrets in code, everything overridable by environment variable.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { DEFAULT_DATA_DIR } from './paths.js';

const trimSlashes = (url) => String(url).replace(/\/+$/, '');

export const NODE_ENV = process.env.NODE_ENV || 'development';
export const IS_PRODUCTION = NODE_ENV === 'production';

// Bind address. 8787 keeps the identity service clear of the Vite dev server
// (3000) and of the live-interrupt WebSocket backend (8080).
export const PORT = Number(process.env.AUTH_PORT || 8787);
export const HOST = process.env.AUTH_HOST || '0.0.0.0';

// Public base URL of THIS service — used to build the provider `redirect_uri`
// that must be registered with Google / GitHub, e.g.
//   http://localhost:8787/api/auth/google/callback
export const PUBLIC_URL = trimSlashes(process.env.AUTH_PUBLIC_URL || `http://localhost:${PORT}`);

// Where the browser lands after the OAuth round-trip: the Vite app.
export const CLIENT_URL = trimSlashes(process.env.APP_URL || process.env.CLIENT_URL || 'http://localhost:3000');

export const DATA_DIR = process.env.AUTH_DATA_DIR || DEFAULT_DATA_DIR;
export const USERS_FILE = process.env.AUTH_USERS_FILE || path.join(DATA_DIR, 'users.json');
export const SESSION_SECRET_FILE = process.env.AUTH_SESSION_SECRET_FILE || path.join(DATA_DIR, 'session-secret');

// Express `trust proxy`. Leave unset locally; set to 1 (or a CIDR list) when the
// service runs behind a load balancer so req.ip — and rate limiting — is honest.
export const TRUST_PROXY = process.env.TRUST_PROXY || '';

// Serve the built SPA (dist/) from this process when it exists — that is the
// single-process deploy shape. AUTH_SERVE_STATIC=off keeps API-only mode.
export const SERVE_STATIC = process.env.AUTH_SERVE_STATIC !== 'off';

export const SESSION_TTL_MS = Number(process.env.SESSION_TTL_MS || 12 * 60 * 60 * 1000); // 12 h
export const STATE_TTL_MS = Number(process.env.STATE_TTL_MS || 10 * 60 * 1000); // OAuth round-trip budget

export const SESSION_COOKIE = process.env.SESSION_COOKIE_NAME || 'il_session';
export const STATE_COOKIE = 'il_oauth_state';

// Cookies are scoped to a host, not a port — so a cookie set by localhost:8787
// is also sent to localhost:3000. That is what makes the Vite dev proxy work.
export const COOKIE_SECURE = /^(1|true)$/i.test(process.env.COOKIE_SECURE || '') || IS_PRODUCTION;

export const LOG_LEVEL = process.env.LOG_LEVEL || 'info';
export const LOG_JSON = process.env.LOG_JSON === '1';

// Per-IP budget for the auth endpoints (fixed window). Generous by design — a
// human signing in never comes close; a script brute-forcing callbacks does.
export const RATE_MAX = Number(process.env.AUTH_RATE_MAX || 120);
export const RATE_WINDOW_MS = Number(process.env.AUTH_RATE_WINDOW_MS || 5 * 60 * 1000);

/**
 * Session signing key. Production refuses to boot without an explicit secret;
 * development generates one once and reuses it from disk, so restarting the
 * server does not silently invalidate live sessions.
 */
export function resolveSessionSecret({
  secret = process.env.SESSION_SECRET,
  filePath = SESSION_SECRET_FILE,
  production = IS_PRODUCTION,
  logger = console,
} = {}) {
  if (secret && secret.length >= 32) return secret;
  if (secret) {
    if (production) {
      throw new Error('SESSION_SECRET must be at least 32 characters when NODE_ENV=production');
    }
    logger.warn?.('[auth] SESSION_SECRET is shorter than 32 characters — fine for local dev only');
    return secret;
  }
  if (production) {
    throw new Error('SESSION_SECRET is required when NODE_ENV=production (openssl rand -hex 32)');
  }
  try {
    const existing = fs.readFileSync(filePath, 'utf8').trim();
    if (existing.length >= 32) return existing;
  } catch {
    /* first boot — generate below */
  }
  const generated = crypto.randomBytes(32).toString('hex');
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${generated}\n`, { encoding: 'utf8', mode: 0o600 });
  logger.log?.(`[auth] generated a development session secret → ${filePath} (git-ignored)`);
  return generated;
}

/** Snapshot of the non-secret configuration, handed to the Express app factory. */
export function loadConfig(overrides = {}) {
  return {
    env: NODE_ENV,
    production: IS_PRODUCTION,
    port: PORT,
    host: HOST,
    publicUrl: PUBLIC_URL,
    clientUrl: CLIENT_URL,
    dataDir: DATA_DIR,
    usersFile: USERS_FILE,
    sessionSecretFile: SESSION_SECRET_FILE,
    trustProxy: TRUST_PROXY,
    serveStatic: SERVE_STATIC,
    sessionTtlMs: SESSION_TTL_MS,
    stateTtlMs: STATE_TTL_MS,
    sessionCookie: SESSION_COOKIE,
    stateCookie: STATE_COOKIE,
    cookieSecure: COOKIE_SECURE,
    logLevel: LOG_LEVEL,
    logJson: LOG_JSON,
    rateMax: RATE_MAX,
    rateWindowMs: RATE_WINDOW_MS,
    ...overrides,
  };
}
