// server/session.js — dependency-free signed session tokens + cookie plumbing.
//
// Token format:  v1.<base64url(payload json)>.<base64url(hmac-sha256)>
// Signed, not encrypted: the payload is readable by whoever holds the token, so
// it carries identity claims only — never provider access tokens or secrets.
import crypto from 'node:crypto';

const VERSION = 'v1';

const b64url = {
  encode: (value) => Buffer.from(value).toString('base64url'),
  decode: (value) => Buffer.from(value, 'base64url'),
};

const hmac = (secret, data) => crypto.createHmac('sha256', secret).update(data).digest();

export function createSessionCodec({ secret, ttlMs, issuer = 'interlock-identity', clock = Date.now } = {}) {
  if (!secret) throw new Error('createSessionCodec requires a secret');

  const signatureFor = (body) => b64url.encode(hmac(secret, body));

  return {
    ttlMs,

    /** Mint a token. `claims` should stay small: e.g. { sub, sid }. */
    issue(claims = {}) {
      const issuedAt = clock();
      const payload = { v: 1, iss: issuer, iat: issuedAt, exp: issuedAt + ttlMs, ...claims };
      const body = `${VERSION}.${b64url.encode(JSON.stringify(payload))}`;
      return { token: `${body}.${signatureFor(body)}`, payload };
    },

    /** Verify signature + expiry. Returns the payload, or null for anything fishy. */
    read(token, now = clock()) {
      if (typeof token !== 'string') return null;
      const parts = token.split('.');
      if (parts.length !== 3 || parts[0] !== VERSION) return null;
      const [, encoded, signature] = parts;

      const expected = Buffer.from(signatureFor(`${VERSION}.${encoded}`));
      const actual = Buffer.from(signature);
      if (actual.length !== expected.length || !crypto.timingSafeEqual(actual, expected)) return null;

      let payload;
      try {
        payload = JSON.parse(b64url.decode(encoded).toString('utf8'));
      } catch {
        return null;
      }
      if (!payload || payload.v !== 1 || typeof payload.exp !== 'number') return null;
      if (payload.exp <= now) return null; // expired
      return payload;
    },
  };
}

// ── cookies ────────────────────────────────────────────────────────────────

/**
 * RFC 6265 cookie serialization. HttpOnly + SameSite=Lax by default: Lax still
 * sends the cookie on the provider's top-level redirect back to /callback,
 * while blocking it on cross-site sub-requests.
 */
export function serializeCookie(name, value, {
  maxAgeMs,
  path: cookiePath = '/',
  secure = false,
  sameSite = 'Lax',
  httpOnly = true,
} = {}) {
  const parts = [`${name}=${value ?? ''}`, `Path=${cookiePath}`];
  if (httpOnly) parts.push('HttpOnly');
  parts.push(`SameSite=${sameSite}`);
  if (secure) parts.push('Secure');
  if (typeof maxAgeMs === 'number') {
    const seconds = Math.max(0, Math.floor(maxAgeMs / 1000));
    parts.push(`Max-Age=${seconds}`);
    parts.push(`Expires=${new Date(Date.now() + seconds * 1000).toUTCString()}`);
  }
  return parts.join('; ');
}

export function clearCookie(name, options = {}) {
  return serializeCookie(name, '', { ...options, maxAgeMs: 0 });
}

/** Minimal `Cookie:` header parser — avoids the cookie-parser dependency. */
export function parseCookies(header) {
  const out = {};
  if (!header || typeof header !== 'string') return out;
  for (const chunk of header.split(';')) {
    const eq = chunk.indexOf('=');
    if (eq < 0) continue;
    const key = chunk.slice(0, eq).trim();
    if (!key) continue;
    const raw = chunk.slice(eq + 1).trim();
    try {
      out[key] = decodeURIComponent(raw);
    } catch {
      out[key] = raw;
    }
  }
  return out;
}
