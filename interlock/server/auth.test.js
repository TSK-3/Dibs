// server/auth.test.js — end-to-end coverage for the Interlock sign-in service.
// `npm test` (node --test). The provider's HTTP API is stubbed, everything else
// is real: Express routing, state/PKCE checks, the user directory, the signed
// session cookie and the redirects back into the SPA.
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createApp, createFixedWindowLimiter, safeReturnTo } from './app.js';
import { resolveSessionSecret } from './config.js';
import { createLogger } from './logger.js';
import { PROVIDERS } from './providers.js';
import { clearCookie, createSessionCodec, parseCookies, serializeCookie } from './session.js';
import { UserStore, userIdFor } from './users.js';

const SILENT = createLogger({ level: 'error', sink: { log() {}, info() {}, warn() {}, error() {} } });
const SESSION_SECRET = 'test-secret'.padEnd(48, 'x');

const base64url = (value) => Buffer.from(value).toString('base64url');
const jsonResponse = (body, status = 200) => ({
  ok: status < 400,
  status,
  text: async () => JSON.stringify(body),
});

const setCookies = (response) =>
  typeof response.headers.getSetCookie === 'function'
    ? response.headers.getSetCookie()
    : [response.headers.get('set-cookie') ?? ''];

const cookieValue = (response, name) => {
  for (const header of setCookies(response)) {
    const parsed = parseCookies(header.split(';')[0]);
    if (parsed[name] !== undefined) return parsed[name];
  }
  return null;
};

async function harness({ env = {}, config = {}, fetchImpl } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'interlock-auth-'));
  const app = createApp({
    config: {
      publicUrl: 'http://localhost:8787',
      clientUrl: 'http://localhost:3000',
      usersFile: path.join(dir, 'users.json'),
      sessionSecretFile: path.join(dir, 'session-secret'),
      cookieSecure: false,
      rateMax: 10_000,
      ...config,
    },
    env,
    sessionSecret: SESSION_SECRET,
    fetchImpl: fetchImpl ?? (() => assert.fail('the provider API must not be called in this test')),
    logger: SILENT,
  });

  const server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;

  return {
    app,
    base,
    dir,
    usersFile: path.join(dir, 'users.json'),
    get: (url, init) => fetch(`${base}${url}`, { redirect: 'manual', ...init }),
    close: () =>
      new Promise((resolve) => {
        // fetch() keeps sockets alive; without this, server.close() would wait
        // for a connection that is never going to close on its own.
        server.closeAllConnections?.();
        server.close(() => resolve());
      }),
  };
}

/** Stubbed Google + GitHub APIs, with assertions on what we actually send. */
function stubProviders() {
  const seen = { codeVerifier: null, requests: [] };
  const fetchImpl = async (url, init = {}) => {
    const target = typeof url === 'string' ? url : url.toString();
    seen.requests.push(target);

    if (target === PROVIDERS.google.tokenUrl) {
      const body = new URLSearchParams(init.body);
      assert.equal(body.get('grant_type'), 'authorization_code');
      assert.equal(body.get('code'), 'test-code');
      assert.equal(body.get('client_id'), 'google-client-id');
      assert.equal(body.get('redirect_uri'), 'http://localhost:8787/api/auth/google/callback');
      seen.codeVerifier = body.get('code_verifier');
      return jsonResponse({ access_token: 'google-access-token', token_type: 'Bearer', expires_in: 3599 });
    }
    if (target === 'https://openidconnect.googleapis.com/v1/userinfo') {
      assert.equal(init.headers.Authorization, 'Bearer google-access-token');
      return jsonResponse({
        sub: '110248495921238986420',
        name: 'Ada Lovelace',
        email: 'ada@example.com',
        email_verified: true,
        picture: 'https://lh3.googleusercontent.com/ada.png',
      });
    }
    if (target === PROVIDERS.github.tokenUrl) {
      const body = new URLSearchParams(init.body);
      assert.equal(body.get('client_id'), 'github-client-id');
      assert.equal(body.get('code_verifier'), null, 'GitHub uses the confidential-client flow');
      return jsonResponse({ access_token: 'github-access-token', token_type: 'bearer', scope: 'read:user,user:email' });
    }
    if (target === 'https://api.github.com/user') {
      assert.equal(init.headers.Authorization, 'Bearer github-access-token');
      // Private email on purpose: exercises the /user/emails fallback.
      return jsonResponse({ id: 583231, login: 'octocat', name: 'The Octocat', email: null, avatar_url: 'https://avatars.githubusercontent.com/u/583231' });
    }
    if (target === 'https://api.github.com/user/emails') {
      return jsonResponse([
        { email: 'octocat@github.com', primary: false, verified: true },
        { email: 'mona@example.com', primary: true, verified: true },
      ]);
    }
    throw new Error(`unexpected provider request: ${target}`);
  };
  return { fetchImpl, seen };
}

const googleEnv = { GOOGLE_CLIENT_ID: 'google-client-id', GOOGLE_CLIENT_SECRET: 'google-client-secret' };
const githubEnv = { GITHUB_CLIENT_ID: 'github-client-id', GITHUB_CLIENT_SECRET: 'github-client-secret' };

/** Reads the signed (not encrypted) state cookie without the server's codec. */
const readStatePayload = (token) => JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'));

// ── units ───────────────────────────────────────────────────────────────────

test('session codec: round-trip works, tampering and expiry are rejected', () => {
  let now = 1_000_000;
  const codec = createSessionCodec({ secret: 'secret'.padEnd(32, 's'), ttlMs: 1000, clock: () => now });
  const { token, payload } = codec.issue({ sub: 'usr_abc', sid: 'sid-1' });
  assert.equal(payload.sub, 'usr_abc');
  assert.equal(codec.read(token).sid, 'sid-1');

  const [version, body, signature] = token.split('.');
  assert.equal(codec.read(`${version}.${body}.${signature.slice(0, -2)}zz`), null, 'tampered signature');
  const forged = base64url(JSON.stringify({ v: 1, iss: 'interlock-identity', iat: 0, exp: now + 60_000, sub: 'usr_admin' }));
  assert.equal(codec.read(`${version}.${forged}.${signature}`), null, 'swapped payload');
  assert.equal(codec.read('not-a-token'), null);

  now += 2000;
  assert.equal(codec.read(token), null, 'expired');
});

test('cookie helpers serialize, parse and clear', () => {
  const header = serializeCookie('il_session', 'a.b.c', { maxAgeMs: 3_600_000, secure: true });
  assert.match(header, /^il_session=a\.b\.c; Path=\/; HttpOnly; SameSite=Lax; Secure; Max-Age=3600;/);
  assert.deepEqual(parseCookies('a=1; il_session=x%20y; empty='), { a: '1', il_session: 'x y', empty: '' });
  assert.deepEqual(parseCookies(undefined), {});
  assert.match(clearCookie('il_session'), /^il_session=; Path=\/; HttpOnly; SameSite=Lax; Max-Age=0;/);
});

test('safeReturnTo refuses every open-redirect shape', () => {
  assert.equal(safeReturnTo('/dashboard?tab=2#top'), '/dashboard?tab=2#top');
  assert.equal(safeReturnTo('//evil.example/pwn'), '/');
  assert.equal(safeReturnTo('https://evil.example/pwn'), '/');
  assert.equal(safeReturnTo('javascript:alert(1)'), '/');
  assert.equal(safeReturnTo(`/${'a'.repeat(600)}`), '/');
  assert.equal(safeReturnTo(undefined, '/fallback'), '/fallback');
});

test('fixed-window limiter counts down per key and resets', () => {
  let now = 0;
  const limiter = createFixedWindowLimiter({ max: 2, windowMs: 1000, clock: () => now });
  assert.equal(limiter.check('1.2.3.4').allowed, true);
  assert.equal(limiter.check('1.2.3.4').allowed, true);
  const blocked = limiter.check('1.2.3.4');
  assert.equal(blocked.allowed, false);
  assert.equal(blocked.retryAfterMs, 1000);
  assert.equal(limiter.check('5.6.7.8').allowed, true, 'other clients are unaffected');
  now = 1001;
  assert.equal(limiter.check('1.2.3.4').allowed, true);
  limiter.sweep();
  assert.equal(limiter.size(), 1);
});

test('user directory: deterministic ids, upsert only bumps login fields, survives restart', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'interlock-users-'));
  const file = path.join(dir, 'users.json');
  const store = new UserStore({ filePath: file, logger: SILENT });
  const profile = {
    provider: 'github', providerLabel: 'GitHub', providerId: '583231',
    name: 'Octocat', email: 'o@example.com', emailVerified: true, avatarUrl: null,
  };

  const first = store.upsertFromProfile(profile, { now: Date.parse('2026-01-01T00:00:00Z') });
  assert.equal(first.id, userIdFor('github', '583231'));
  assert.equal(first.loginCount, 1);

  const second = store.upsertFromProfile({ ...profile, name: 'Octocat Renamed' }, { now: Date.parse('2026-01-02T00:00:00Z') });
  assert.equal(second.id, first.id, 'same provider account ⇒ same id');
  assert.equal(second.loginCount, 2);
  assert.equal(second.name, 'Octocat Renamed');
  assert.equal(second.createdAt, first.createdAt, 'first-seen timestamp never moves');

  const restored = new UserStore({ filePath: file, logger: SILENT });
  assert.equal(restored.count(), 1);
  assert.equal(restored.get(first.id).loginCount, 2);
  assert.equal(restored.findByProvider('github', '583231').id, first.id);
  assert.equal(restored.get('usr_missing'), null);
});

test('provider profiles normalize to one shape (Google + GitHub)', async () => {
  const { fetchImpl } = stubProviders();

  const google = await PROVIDERS.google.fetchProfile({ accessToken: 'google-access-token', fetchImpl });
  assert.deepEqual(google, {
    provider: 'google',
    providerLabel: 'Google',
    providerId: '110248495921238986420',
    name: 'Ada Lovelace',
    username: 'ada',
    email: 'ada@example.com',
    emailVerified: true,
    avatarUrl: 'https://lh3.googleusercontent.com/ada.png',
  });

  const github = await PROVIDERS.github.fetchProfile({ accessToken: 'github-access-token', fetchImpl });
  assert.equal(github.providerId, '583231');
  assert.equal(github.username, 'octocat');
  assert.equal(github.email, 'mona@example.com', 'private email falls back to the primary verified one');
  assert.equal(github.emailVerified, true);
});

test('production refuses to boot without a strong session secret', () => {
  assert.throws(() => resolveSessionSecret({ secret: undefined, production: true, logger: SILENT }), /SESSION_SECRET is required/);
  assert.throws(() => resolveSessionSecret({ secret: 'too-short', production: true, logger: SILENT }), /at least 32 characters/);

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'interlock-secret-'));
  const filePath = path.join(dir, 'session-secret');
  const generated = resolveSessionSecret({ production: false, filePath, logger: SILENT });
  assert.equal(generated.length, 64);
  assert.equal(resolveSessionSecret({ production: false, filePath, logger: SILENT }), generated, 'reused across restarts');
});

// ── full flows over HTTP ────────────────────────────────────────────────────

test('Google sign-in: start → callback → session → me → logout', async () => {
  const { fetchImpl } = stubProviders();
  const h = await harness({ env: googleEnv, fetchImpl });
  try {
    // 1. /start bounces to Google with state + a PKCE challenge, and pins state.
    const start = await h.get('/api/auth/google/start?returnTo=/fleet');
    assert.equal(start.status, 302);
    const authorize = new URL(start.headers.get('location'));
    assert.equal(authorize.origin + authorize.pathname, 'https://accounts.google.com/o/oauth2/v2/auth');
    assert.equal(authorize.searchParams.get('client_id'), 'google-client-id');
    assert.equal(authorize.searchParams.get('redirect_uri'), 'http://localhost:8787/api/auth/google/callback');
    assert.equal(authorize.searchParams.get('response_type'), 'code');
    assert.equal(authorize.searchParams.get('scope'), 'openid email profile');
    assert.equal(authorize.searchParams.get('code_challenge_method'), 'S256');

    const stateCookie = cookieValue(start, 'il_oauth_state');
    assert.ok(stateCookie, 'state cookie must be set');
    const pending = readStatePayload(stateCookie);
    assert.equal(pending.provider, 'google');
    assert.equal(pending.returnTo, '/fleet');
    assert.equal(pending.state, authorize.searchParams.get('state'));
    const expectedChallenge = base64url(crypto.createHash('sha256').update(pending.verifier).digest());
    assert.equal(authorize.searchParams.get('code_challenge'), expectedChallenge, 'challenge must match the verifier');

    // 2. /callback exchanges the code server-side and mints the session cookie.
    const callback = await h.get(
      `/api/auth/google/callback?code=test-code&state=${encodeURIComponent(pending.state)}`,
      { headers: { cookie: `il_oauth_state=${stateCookie}` } },
    );
    assert.equal(callback.status, 302);
    const landing = new URL(callback.headers.get('location'));
    assert.equal(landing.origin + landing.pathname, 'http://localhost:3000/fleet', 'returnTo is honoured');
    assert.equal(landing.searchParams.get('auth'), 'success');
    const session = cookieValue(callback, 'il_session');
    assert.ok(session, 'session cookie must be issued');
    assert.match(setCookies(callback).join(';'), /HttpOnly; SameSite=Lax/, 'session cookie is locked down');

    // 3. /me resolves the cookie to the Google profile.
    const me = await h.get('/api/auth/me', { headers: { cookie: `il_session=${session}` } });
    assert.equal(me.status, 200);
    const body = await me.json();
    assert.equal(body.user.provider, 'google');
    assert.equal(body.user.name, 'Ada Lovelace');
    assert.equal(body.user.email, 'ada@example.com');
    assert.ok(body.session.expiresAt > body.session.issuedAt);

    // …and the identity landed in the on-disk directory.
    const stored = JSON.parse(fs.readFileSync(h.usersFile, 'utf8'));
    assert.equal(Object.keys(stored.users).length, 1);
    assert.equal(stored.users[body.user.id].loginCount, 1);
    assert.equal(stored.users[body.user.id].provider, 'google');

    // 4. Logout clears the cookie.
    const logout = await h.get('/api/auth/logout', { method: 'POST', headers: { cookie: `il_session=${session}` } });
    assert.equal(logout.status, 200);
    assert.match(setCookies(logout).join(';'), /il_session=;.*Max-Age=0/);
  } finally {
    await h.close();
  }
});

test('a repeat sign-in reuses the same identity record', async () => {
  const { fetchImpl } = stubProviders();
  const h = await harness({ env: googleEnv, fetchImpl });
  try {
    const signIn = async () => {
      const start = await h.get('/api/auth/google/start');
      const cookie = cookieValue(start, 'il_oauth_state');
      const pending = readStatePayload(cookie);
      const callback = await h.get(`/api/auth/google/callback?code=test-code&state=${pending.state}`, {
        headers: { cookie: `il_oauth_state=${cookie}` },
      });
      const session = cookieValue(callback, 'il_session');
      return (await (await h.get('/api/auth/me', { headers: { cookie: `il_session=${session}` } })).json());
    };

    const first = await signIn();
    const second = await signIn();
    assert.equal(second.user.id, first.user.id);
    assert.equal(second.user.loginCount, 2);
    assert.equal(new UserStore({ filePath: h.usersFile, logger: SILENT }).count(), 1);
  } finally {
    await h.close();
  }
});

test('signed-out requests get 401, unknown providers 404, /api misses are JSON', async () => {
  const h = await harness({ env: googleEnv });
  try {
    const me = await h.get('/api/auth/me');
    assert.equal(me.status, 401);
    assert.equal((await me.json()).error, 'no_session');

    const unknown = await h.get('/api/auth/gitlab/start');
    assert.equal(unknown.status, 404);
    assert.equal((await unknown.json()).error, 'unknown_provider');

    const missing = await h.get('/api/nope');
    assert.equal(missing.status, 404);
    assert.equal((await missing.json()).error, 'not_found');

    const providers = await (await h.get('/api/auth/providers')).json();
    assert.deepEqual(
      providers.providers.map((p) => [p.id, p.configured]),
      [['google', true], ['github', false]],
    );
  } finally {
    await h.close();
  }
});

test('a forged or replayed state never authenticates anyone', async () => {
  const { fetchImpl, seen } = stubProviders();
  const h = await harness({ env: googleEnv, fetchImpl });
  try {
    // (a) bare callback hit with no state cookie at all
    const bare = await h.get('/api/auth/google/callback?code=test-code&state=whatever');
    assert.equal(new URL(bare.headers.get('location')).searchParams.get('auth_error'), 'state_mismatch');
    assert.equal(cookieValue(bare, 'il_session'), null);

    // (b) valid cookie, attacker-chosen state value
    const start = await h.get('/api/auth/google/start');
    const stateCookie = cookieValue(start, 'il_oauth_state');
    const swapped = await h.get('/api/auth/google/callback?code=test-code&state=attacker', {
      headers: { cookie: `il_oauth_state=${stateCookie}` },
    });
    assert.equal(new URL(swapped.headers.get('location')).searchParams.get('auth_error'), 'state_mismatch');
    assert.equal(cookieValue(swapped, 'il_session'), null);

    // (c) a state minted for another provider cannot be replayed here
    const githubStart = await h.get('/api/auth/github/start');
    const githubState = cookieValue(githubStart, 'il_oauth_state');
    const crossUsed = await h.get(`/api/auth/google/callback?code=x&state=${readStatePayload(githubState).state}`, {
      headers: { cookie: `il_oauth_state=${githubState}` },
    });
    assert.equal(new URL(crossUsed.headers.get('location')).searchParams.get('auth_error'), 'state_mismatch');

    assert.equal(seen.requests.length, 0, 'no token exchange may run for a rejected callback');
  } finally {
    await h.close();
  }
});

test('provider failures come back as stable error codes, never a 500', async () => {
  const failingExchange = async (url) => {
    assert.equal(String(url), PROVIDERS.google.tokenUrl);
    return jsonResponse({ error: 'invalid_grant', error_description: 'Bad code' }, 400);
  };
  const h = await harness({ env: googleEnv, fetchImpl: failingExchange });
  try {
    const start = await h.get('/api/auth/google/start');
    const stateCookie = cookieValue(start, 'il_oauth_state');
    const pending = readStatePayload(stateCookie);

    const rejected = await h.get(`/api/auth/google/callback?code=stale&state=${pending.state}`, {
      headers: { cookie: `il_oauth_state=${stateCookie}` },
    });
    const landing = new URL(rejected.headers.get('location'));
    assert.equal(landing.origin + landing.pathname, 'http://localhost:3000/');
    assert.equal(landing.searchParams.get('auth_error'), 'provider_error');
    assert.equal(landing.searchParams.get('auth_provider'), 'google');
    assert.equal(cookieValue(rejected, 'il_session'), null);
  } finally {
    await h.close();
  }
});

test('“cancel” at the provider is reported as provider_denied', async () => {
  const h = await harness({ env: googleEnv });
  try {
    const start = await h.get('/api/auth/google/start');
    const stateCookie = cookieValue(start, 'il_oauth_state');
    const pending = readStatePayload(stateCookie);

    const denied = await h.get(
      `/api/auth/google/callback?error=access_denied&error_description=user+denied&state=${pending.state}`,
      { headers: { cookie: `il_oauth_state=${stateCookie}` } },
    );
    const landing = new URL(denied.headers.get('location'));
    assert.equal(landing.searchParams.get('auth_error'), 'provider_denied');
    assert.equal(cookieValue(denied, 'il_session'), null);
  } finally {
    await h.close();
  }
});

test('GitHub sign-in uses the confidential-client flow and the verified-email fallback', async () => {
  const { fetchImpl, seen } = stubProviders();
  const h = await harness({ env: githubEnv, fetchImpl });
  try {
    const start = await h.get('/api/auth/github/start');
    const authorize = new URL(start.headers.get('location'));
    assert.equal(authorize.origin + authorize.pathname, 'https://github.com/login/oauth/authorize');
    assert.equal(authorize.searchParams.get('scope'), 'read:user user:email');
    assert.equal(authorize.searchParams.get('code_challenge'), null, 'no PKCE on the confidential-client flow');

    const stateCookie = cookieValue(start, 'il_oauth_state');
    const pending = readStatePayload(stateCookie);
    const callback = await h.get(`/api/auth/github/callback?code=test-code&state=${pending.state}`, {
      headers: { cookie: `il_oauth_state=${stateCookie}` },
    });
    assert.equal(new URL(callback.headers.get('location')).searchParams.get('auth'), 'success');

    const me = await h.get('/api/auth/me', { headers: { cookie: `il_session=${cookieValue(callback, 'il_session')}` } });
    const body = await me.json();
    assert.equal(body.user.provider, 'github');
    assert.equal(body.user.username, 'octocat');
    assert.equal(body.user.name, 'The Octocat');
    assert.equal(body.user.email, 'mona@example.com', 'private email resolved through /user/emails');
    assert.equal(body.user.avatarUrl, 'https://avatars.githubusercontent.com/u/583231');

    assert.deepEqual(seen.requests, [
      'https://github.com/login/oauth/access_token',
      'https://api.github.com/user',
      'https://api.github.com/user/emails',
    ]);
  } finally {
    await h.close();
  }
});

test('an unconfigured provider fails closed instead of faking an identity', async () => {
  const h = await harness({ env: googleEnv }); // Google only — GitHub has no credentials
  try {
    const providers = await (await h.get('/api/auth/providers')).json();
    const github = providers.providers.find((p) => p.id === 'github');
    assert.equal(github.configured, false);
    assert.deepEqual(github.setupEnv, ['GITHUB_CLIENT_ID', 'GITHUB_CLIENT_SECRET']);
    assert.equal(Object.hasOwn(github, 'demo'), false, 'there is no demo fallback any more');

    const start = await h.get('/api/auth/github/start');
    const landing = new URL(start.headers.get('location'));
    assert.equal(landing.origin + landing.pathname, 'http://localhost:3000/');
    assert.equal(landing.searchParams.get('auth_error'), 'github_not_configured');
    assert.equal(cookieValue(start, 'il_session'), null, 'no session may be issued');

    // The old dev-only route must be gone, not merely disabled.
    const demo = await h.get('/api/auth/github/demo-callback?state=x');
    assert.equal(demo.status, 404);

    // /me stays empty and the health probe reports the provider as unconfigured.
    const me = await h.get('/api/auth/me');
    assert.equal(me.status, 401);
    const health = await (await h.get('/api/health')).json();
    assert.deepEqual(health.providers, [{ id: 'google', configured: true }, { id: 'github', configured: false }]);
  } finally {
    await h.close();
  }
});





