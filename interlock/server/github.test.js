// server/github.test.js — the GitHub repository proxy surface.
// Sign-in is exercised through the real OAuth round-trip with a stubbed GitHub
// API; the /api/github/repos endpoint must serve from the token persisted at
// login and never leak the plaintext token anywhere.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createApp } from './app.js';
import { listRepos, normalizeRepo } from './github.js';
import { createLogger } from './logger.js';
import { UserStore } from './users.js';
import { createSessionCodec } from './session.js';

const SILENT = createLogger({ level: 'error', sink: { log() {}, info() {}, warn() {}, error() {} } });
const SESSION_SECRET = 'test-secret'.padEnd(48, 'x');
const githubEnv = { GITHUB_CLIENT_ID: 'github-client-id', GITHUB_CLIENT_SECRET: 'github-client-secret' };

const jsonResponse = (body, status = 200, headers = {}) => ({
  ok: status < 400,
  status,
  text: async () => JSON.stringify(body),
  headers: { get: (name) => headers[name.toLowerCase()] ?? null },
});

const cookieValue = (response, name) => {
  const headers =
    typeof response.headers.getSetCookie === 'function'
      ? response.headers.getSetCookie()
      : [response.headers.get('set-cookie') ?? ''];
  for (const header of headers) {
    for (const part of header.split(';')) {
      const eq = part.indexOf('=');
      if (eq > 0 && part.slice(0, eq).trim() === name) return part.slice(eq + 1).trim();
    }
  }
  return null;
};

const stateFromCookie = (cookie) =>
  JSON.parse(Buffer.from(cookie.split('.')[1], 'base64url').toString('utf8')).state;

const SAMPLE_REPO = {
  id: 401,
  full_name: 'octocat/interlock-monorepo',
  private: false,
  html_url: 'https://github.com/octocat/interlock-monorepo',
  description: 'Demo monorepo',
  default_branch: 'main',
  updated_at: '2026-09-01T10:00:00Z',
  owner: { login: 'octocat' },
};

function stubGithub({ repos = [SAMPLE_REPO], reposStatus = 200, remaining = null } = {}) {
  const requests = [];
  const fetchImpl = async (url, init = {}) => {
    const target = typeof url === 'string' ? url : url.toString();
    requests.push(target);
    if (target.includes('/login/oauth/access_token')) {
      const body = new URLSearchParams(init.body);
      assert.equal(body.get('client_id'), 'github-client-id');
      return jsonResponse({ access_token: 'gho_test_token', token_type: 'bearer', scope: 'read:user,user:email' });
    }
    if (target === 'https://api.github.com/user') {
      assert.equal(init.headers.Authorization, 'Bearer gho_test_token');
      return jsonResponse({ id: 583231, login: 'octocat', name: 'The Octocat', email: 'mona@example.com', avatar_url: null });
    }
    if (target.startsWith('https://api.github.com/user/repos')) {
      const headers = remaining === null ? {} : { 'x-ratelimit-remaining': String(remaining) };
      return jsonResponse(repos, reposStatus, headers);
    }
    throw new Error(`unexpected request: ${target}`);
  };
  return { fetchImpl, requests };
}

async function harness({ fetchImpl, users = undefined } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'interlock-github-'));
  const app = createApp({
    config: {
      publicUrl: 'http://localhost:8787',
      clientUrl: 'http://localhost:3000',
      usersFile: path.join(dir, 'users.json'),
      sessionSecretFile: path.join(dir, 'session-secret'),
      workspacesFile: path.join(dir, 'workspaces.json'),
      dataDir: dir,
      cookieSecure: false,
      rateMax: 10_000,
    },
    env: githubEnv,
    sessionSecret: SESSION_SECRET,
    users,
    fetchImpl: fetchImpl ?? (() => { throw new Error('no provider fetch expected'); }),
    logger: SILENT,
  });
  const server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const get = (url, init) => fetch(`${base}${url}`, { redirect: 'manual', ...init });

  /** Runs the real sign-in round-trip and returns the session cookie value. */
  async function signIn() {
    const start = await get('/api/auth/github/start');
    const stateCookie = cookieValue(start, 'il_oauth_state');
    const callback = await get(`/api/auth/github/callback?code=test-code&state=${stateFromCookie(stateCookie)}`, {
      headers: { cookie: `il_oauth_state=${stateCookie}` },
    });
    const session = cookieValue(callback, 'il_session');
    assert.ok(session, 'sign-in must mint a session');
    return session;
  }

  return {
    base,
    dir,
    usersFile: path.join(dir, 'users.json'),
    get,
    signIn,
    close: () =>
      new Promise((resolve) => {
        server.closeAllConnections?.();
        server.close(() => resolve());
      }),
  };
}

// ── units ────────────────────────────────────────────────────────────────────

test('normalizeRepo maps GitHub JSON to the console shape and rejects junk', () => {
  const repo = normalizeRepo(SAMPLE_REPO);
  assert.deepEqual(repo, {
    id: 401,
    fullName: 'octocat/interlock-monorepo',
    private: false,
    htmlUrl: 'https://github.com/octocat/interlock-monorepo',
    description: 'Demo monorepo',
    defaultBranch: 'main',
    updatedAt: '2026-09-01T10:00:00Z',
    ownerLogin: 'octocat',
  });
  assert.equal(normalizeRepo(null), null);
  assert.equal(normalizeRepo({ id: 'x', full_name: 'a/b' }), null);
  assert.equal(normalizeRepo({ id: 1 }), null);
});

test('listRepos normalizes pages, stops at a short page, and maps failures to codes', async () => {
  const seen = [];
  const fetchImpl = async (url) => {
    seen.push(String(url));
    if (seen.length === 1) return jsonResponse([SAMPLE_REPO]); // full page → fetch page 2
    return jsonResponse([]); // short page → stop
  };
  const repos = await listRepos({ accessToken: 'tok', fetchImpl, perPage: 100, maxPages: 2 });
  assert.equal(repos.length, 1);
  assert.equal(repos[0].fullName, 'octocat/interlock-monorepo');
  assert.match(seen[0], /user\/repos\?sort=updated&direction=desc&affiliation=owner&per_page=100&page=1/);

  await assert.rejects(
    listRepos({ accessToken: null, fetchImpl }),
    (err) => err.code === 'github_token_missing',
  );

  const rejected = await listRepos({
    accessToken: 'tok',
    fetchImpl: async () => jsonResponse({}, 401),
  }).catch((err) => err);
  assert.equal(rejected.code, 'github_token_rejected');

  const limited = await listRepos({
    accessToken: 'tok',
    fetchImpl: async () => jsonResponse({}, 403, { 'x-ratelimit-remaining': '0' }),
  }).catch((err) => err);
  assert.equal(limited.code, 'github_rate_limited');

  const unreachable = await listRepos({
    accessToken: 'tok',
    fetchImpl: async () => { throw new Error('boom'); },
  }).catch((err) => err);
  assert.equal(unreachable.code, 'github_unreachable');
});

// ── endpoint ─────────────────────────────────────────────────────────────────

test('GET /api/github/repos requires a session', async () => {
  const { fetchImpl } = stubGithub();
  const h = await harness({ fetchImpl });
  try {
    const response = await h.get('/api/github/repos');
    assert.equal(response.status, 401);
    assert.equal((await response.json()).error, 'no_session');
  } finally {
    await h.close();
  }
});

test('GET /api/github/repos serves public repositories from the stored token', async () => {
  const { fetchImpl } = stubGithub({ repos: [SAMPLE_REPO] });
  const h = await harness({ fetchImpl });
  try {
    const session = await h.signIn();
    const response = await h.get('/api/github/repos', { headers: { cookie: `il_session=${session}` } });
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.ok, true);
    assert.equal(body.repos.length, 1);
    assert.equal(body.repos[0].fullName, 'octocat/interlock-monorepo');
    assert.equal(body.repos[0].defaultBranch, 'main');

    // The persisted token is a secretbox envelope, never the plaintext.
    const stored = JSON.parse(fs.readFileSync(h.usersFile, 'utf8'));
    const record = Object.values(stored.users)[0];
    assert.match(record.providerToken.accessToken, /^v1\./);
    assert.ok(!JSON.stringify(stored).includes('gho_test_token'));
  } finally {
    await h.close();
  }
});

test('a Google session is refused (403) and a GitHub session without a stored token answers 409', async () => {
  // Seed a directory with one Google identity and one GitHub identity that has
  // no provider token (as if signed in before token persistence existed).
  const users = new UserStore({ logger: SILENT, encryptionKey: SESSION_SECRET });
  const google = users.upsertFromProfile({
    provider: 'google', providerLabel: 'Google', providerId: 'g-1',
    name: 'Ada', username: null, email: 'ada@example.com', emailVerified: true, avatarUrl: null,
  });
  const github = users.upsertFromProfile({
    provider: 'github', providerLabel: 'GitHub', providerId: '583231',
    name: 'Octocat', username: 'octocat', email: null, emailVerified: true, avatarUrl: null,
  });
  const codec = createSessionCodec({ secret: SESSION_SECRET, ttlMs: 60_000 });
  const googleSession = codec.issue({ sub: google.id, sid: 's1', provider: 'google' }).token;
  const githubSession = codec.issue({ sub: github.id, sid: 's2', provider: 'github' }).token;

  const { fetchImpl } = stubGithub();
  const h = await harness({ fetchImpl, users });
  try {
    const asGoogle = await h.get('/api/github/repos', { headers: { cookie: `il_session=${googleSession}` } });
    assert.equal(asGoogle.status, 403);
    assert.equal((await asGoogle.json()).error, 'not_github_session');

    const asGithub = await h.get('/api/github/repos', { headers: { cookie: `il_session=${githubSession}` } });
    assert.equal(asGithub.status, 409);
    assert.equal((await asGithub.json()).error, 'github_token_missing');
  } finally {
    await h.close();
  }
});


