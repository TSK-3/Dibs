// server/workspaces.test.js — the workspace service end to end over HTTP.
// Sessions are minted with the same codec the app uses, so the tests focus on
// authorization, invite-code semantics, validation, and persistence.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createApp } from './app.js';
import { createLogger } from './logger.js';
import { UserStore } from './users.js';
import { createSessionCodec } from './session.js';
import { WorkspaceStore, generateInviteCode } from './workspaces.js';

const SILENT = createLogger({ level: 'error', sink: { log() {}, info() {}, warn() {}, error() {} } });
const SESSION_SECRET = 'test-secret'.padEnd(48, 'x');

async function harness() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'interlock-workspaces-'));
  const users = new UserStore({ logger: SILENT, encryptionKey: SESSION_SECRET });
  const owner = users.upsertFromProfile({
    provider: 'github', providerLabel: 'GitHub', providerId: '1',
    name: 'Owner One', username: 'owner', email: 'owner@example.com', emailVerified: true, avatarUrl: null,
  });
  const member = users.upsertFromProfile({
    provider: 'github', providerLabel: 'GitHub', providerId: '2',
    name: 'Member Two', username: 'member', email: 'member@example.com', emailVerified: true, avatarUrl: null,
  });
  const outsider = users.upsertFromProfile({
    provider: 'github', providerLabel: 'GitHub', providerId: '3',
    name: 'Outsider Three', username: 'outsider', email: 'out@example.com', emailVerified: true, avatarUrl: null,
  });
  const workspaces = new WorkspaceStore({ filePath: path.join(dir, 'workspaces.json'), logger: SILENT });
  const codec = createSessionCodec({ secret: SESSION_SECRET, ttlMs: 60_000 });
  const cookieFor = (user) => {
    const { token } = codec.issue({ sub: user.id, sid: `sid-${user.id}`, provider: user.provider });
    return `il_session=${token}`;
  };

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
    env: {},
    sessionSecret: SESSION_SECRET,
    users,
    workspaces,
    fetchImpl: () => { throw new Error('no provider fetch expected'); },
    logger: SILENT,
  });
  const server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;

  const request = (method, url, { user = owner, body } = {}) =>
    fetch(`${base}${url}`, {
      method,
      redirect: 'manual',
      headers: {
        cookie: cookieFor(user),
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });

  async function createWorkspace(user = owner, name = 'Core Platform') {
    const response = await request('POST', '/api/workspaces', {
      user,
      body: { name, repo: { fullName: 'octocat/interlock-monorepo', private: false, defaultBranch: 'main', htmlUrl: 'https://github.com/octocat/interlock-monorepo' } },
    });
    assert.equal(response.status, 201);
    return response.json();
  }

  return {
    base,
    dir,
    owner,
    member,
    outsider,
    cookieFor,
    request,
    createWorkspace,
    close: () =>
      new Promise((resolve) => {
        server.closeAllConnections?.();
        server.close(() => resolve());
      }),
  };
}

test('creating a workspace persists it, hashes the invite code, and exposes a public shape', async () => {
  const h = await harness();
  try {
    const { workspace, inviteCode } = await h.createWorkspace();
    assert.match(workspace.id, /^wsp_[0-9a-f]{12}$/);
    assert.match(inviteCode, /^\d{6}$/);
    assert.equal(workspace.name, 'Core Platform');
    assert.equal(workspace.repo.fullName, 'octocat/interlock-monorepo');
    assert.equal(workspace.ownerUserId, h.owner.id);
    assert.equal(workspace.members.length, 1);
    assert.equal(workspace.members[0].username, 'owner');
    assert.equal(Object.hasOwn(workspace, 'inviteCodeHash'), false, 'the hash never leaves the server');

    // On disk: hash stored, plaintext code nowhere.
    const raw = fs.readFileSync(path.join(h.dir, 'workspaces.json'), 'utf8');
    const persisted = JSON.parse(raw).workspaces[workspace.id];
    assert.match(persisted.inviteCodeHash, /^[0-9a-f]{64}$/);
    assert.ok(!raw.includes(inviteCode), 'the plaintext invite code is never persisted');

    // The invite code actually verifies.
    const joined = await h.request('POST', '/api/workspaces/join', { user: h.member, body: { code: inviteCode } });
    assert.equal(joined.status, 200);
    assert.equal((await joined.json()).workspace.members.length, 2);
  } finally {
    await h.close();
  }
});

test('listing is scoped to membership; a non-member cannot read a workspace', async () => {
  const h = await harness();
  try {
    const { workspace } = await h.createWorkspace(h.owner, 'Owned');
    const mine = await h.request('GET', '/api/workspaces', { user: h.owner });
    const mineBody = await mine.json();
    assert.equal(mineBody.workspaces.length, 1);
    assert.equal(mineBody.workspaces[0].id, workspace.id);

    const foreignList = await h.request('GET', '/api/workspaces', { user: h.member });
    assert.deepEqual((await foreignList.json()).workspaces, []);

    const peek = await h.request('GET', `/api/workspaces/${workspace.id}`, { user: h.member });
    assert.equal(peek.status, 404);
  } finally {
    await h.close();
  }
});

test('joining: invalid codes are rejected, joins are idempotent, join makes the workspace visible', async () => {
  const h = await harness();
  try {
    const { inviteCode, workspace } = await h.createWorkspace();

    const badCode = await h.request('POST', '/api/workspaces/join', {
      user: h.member,
      body: { code: inviteCode === '000000' ? '000001' : '000000' },
    });
    assert.equal(badCode.status, 404);
    assert.equal((await badCode.json()).error, 'invalid_code');

    const shortCode = await h.request('POST', '/api/workspaces/join', { user: h.member, body: { code: '12' } });
    assert.equal(shortCode.status, 400);

    const first = await h.request('POST', '/api/workspaces/join', { user: h.member, body: { code: inviteCode } });
    assert.equal(first.status, 200);
    const second = await h.request('POST', '/api/workspaces/join', { user: h.member, body: { code: inviteCode } });
    assert.equal(second.status, 200);
    assert.equal((await second.json()).workspace.members.length, 2, 'duplicate join does not duplicate members');

    const list = await h.request('GET', '/api/workspaces', { user: h.member });
    const listBody = await list.json();
    assert.equal(listBody.workspaces.length, 1);
    assert.equal(listBody.workspaces[0].id, workspace.id);
  } finally {
    await h.close();
  }
});

test('invite-code rotation invalidates the old code and is owner-only', async () => {
  const h = await harness();
  try {
    const { workspace, inviteCode } = await h.createWorkspace();

    const forbidden = await h.request('POST', `/api/workspaces/${workspace.id}/invite/regenerate`, { user: h.member });
    assert.equal(forbidden.status, 403);

    const rotated = await h.request('POST', `/api/workspaces/${workspace.id}/invite/regenerate`, { user: h.owner });
    assert.equal(rotated.status, 200);
    const { inviteCode: newCode } = await rotated.json();
    assert.match(newCode, /^\d{6}$/);
    assert.notEqual(newCode, inviteCode);

    const stale = await h.request('POST', '/api/workspaces/join', { user: h.member, body: { code: inviteCode } });
    assert.equal(stale.status, 404, 'the old code must be dead');
    const fresh = await h.request('POST', '/api/workspaces/join', { user: h.member, body: { code: newCode } });
    assert.equal(fresh.status, 200);
  } finally {
    await h.close();
  }
});

test('deletion is owner-only and removes the workspace for everyone', async () => {
  const h = await harness();
  try {
    const { workspace, inviteCode } = await h.createWorkspace();
    await h.request('POST', '/api/workspaces/join', { user: h.member, body: { code: inviteCode } });

    const forbidden = await h.request('DELETE', `/api/workspaces/${workspace.id}`, { user: h.member });
    assert.equal(forbidden.status, 403);

    const removed = await h.request('DELETE', `/api/workspaces/${workspace.id}`, { user: h.owner });
    assert.equal(removed.status, 200);

    const gone = await h.request('GET', `/api/workspaces/${workspace.id}`, { user: h.member });
    assert.equal(gone.status, 404);

    const joinAfterDelete = await h.request('POST', '/api/workspaces/join', { user: h.member, body: { code: inviteCode } });
    assert.equal(joinAfterDelete.status, 404);
  } finally {
    await h.close();
  }
});

test('input validation and unauthenticated access', async () => {
  const h = await harness();
  try {
    const noSession = await fetch(`${h.base}/api/workspaces`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'x', repo: { fullName: 'a/b' } }),
    });
    assert.equal(noSession.status, 401);

    const badName = await h.request('POST', '/api/workspaces', { body: { name: '', repo: { fullName: 'a/b' } } });
    assert.equal(badName.status, 400);
    const longName = await h.request('POST', '/api/workspaces', { body: { name: 'x'.repeat(65), repo: { fullName: 'a/b' } } });
    assert.equal(longName.status, 400);
    const badRepo = await h.request('POST', '/api/workspaces', { body: { name: 'ok', repo: { fullName: 'no-slash' } } });
    assert.equal(badRepo.status, 400);
  } finally {
    await h.close();
  }
});

test('the store restores workspaces and invite codes across restarts', async () => {
  const h = await harness();
  try {
    const { workspace, inviteCode } = await h.createWorkspace();
    const restored = new WorkspaceStore({ filePath: path.join(h.dir, 'workspaces.json'), logger: SILENT });
    assert.equal(restored.get(workspace.id).name, 'Core Platform');
    const join = restored.join(inviteCode, h.member);
    assert.equal(join.ok, true);
    assert.equal(join.workspace.members.length, 2);
  } finally {
    await h.close();
  }
});



