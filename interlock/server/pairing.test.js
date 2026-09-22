// server/pairing.test.js — the agent-pairing service end to end over HTTP.
// Covers token generation strength, issue/resolve/rotate semantics, snapshot
// sealing, the pairing API surface, and the /mcp auth-and-resolve middleware.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createApp } from './app.js';
import { createLogger } from './logger.js';
import { UserStore } from './users.js';
import { createSessionCodec } from './session.js';
import { WorkspaceStore } from './workspaces.js';
import { PairingStore, generatePairingToken, hashPairingToken } from './pairing.js';

const SILENT = createLogger({ level: 'error', sink: { log() {}, info() {}, warn() {}, error() {} } });
const SESSION_SECRET = 'test-secret'.padEnd(48, 'x');

async function harness() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'interlock-pairing-'));
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
  const pairings = new PairingStore({
    filePath: path.join(dir, 'pairing.json'),
    logger: SILENT,
    encryptionKey: SESSION_SECRET,
  });
  const codec = createSessionCodec({ secret: SESSION_SECRET, ttlMs: 60_000 });
  const cookieFor = (user) => {
    const { token } = codec.issue({ sub: user.id, sid: `sid-${user.id}`, provider: user.provider });
    return `il_session=${token}`;
  };

  // A relay stub that records the identity each tool call was attributed to.
  const relayCalls = [];
  const mcpRelay = async ({ identity, message }) => {
    relayCalls.push({ identity, message });
    const canned = {
      post_intent: { type: 'ack', status: 'claimed', scope: message.scope },
      check_intent: { type: 'scope_status', scope: message.scope, available: true, claimed_by_others: [], holders: [] },
      complete_intent: { type: 'complete_ack', status: 'released', scope: message.scope },
    };
    return canned[message.type] ?? { type: 'error', code: 'bad_request', message: 'unexpected relay type' };
  };

  const app = createApp({
    config: {
      publicUrl: 'http://localhost:8787',
      clientUrl: 'http://localhost:3000',
      usersFile: path.join(dir, 'users.json'),
      sessionSecretFile: path.join(dir, 'session-secret'),
      workspacesFile: path.join(dir, 'workspaces.json'),
      pairingFile: path.join(dir, 'pairing.json'),
      dataDir: dir,
      cookieSecure: false,
      rateMax: 10_000,
      mcpPublicUrl: 'http://localhost:8787/mcp',
    },
    env: {},
    sessionSecret: SESSION_SECRET,
    users,
    workspaces,
    pairings,
    mcpRelay,
    fetchImpl: () => { throw new Error('no provider fetch expected'); },
    logger: SILENT,
  });
  const server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;

  const request = (method, url, { user = owner, body, headers = {} } = {}) =>
    fetch(`${base}${url}`, {
      method,
      redirect: 'manual',
      headers: {
        ...(user ? { cookie: cookieFor(user) } : {}),
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...headers,
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });

  const mcpPost = (body, token) =>
    request('POST', '/mcp', { user: null, body, headers: token ? { authorization: `Bearer ${token}` } : {} });

  async function createWorkspace(user = owner, name = 'Core Platform') {
    const response = await request('POST', '/api/workspaces', {
      user,
      body: { name, repo: { fullName: 'octocat/interlock-monorepo', private: false, defaultBranch: 'main', htmlUrl: 'https://github.com/octocat/interlock-monorepo' } },
    });
    assert.equal(response.status, 201);
    return (await response.json()).workspace;
  }

  return {
    base, dir, owner, member, outsider, users, workspaces, pairings, relayCalls,
    request, mcpPost, createWorkspace, pairingsFile: path.join(dir, 'pairing.json'),
    close: () =>
      new Promise((resolve) => {
        server.closeAllConnections?.();
        server.close(() => resolve());
      }),
  };
}

test('pairing tokens are long, unique, and cryptographically random — not a guessable format', () => {
  const seen = new Set();
  for (let i = 0; i < 200; i += 1) {
    const token = generatePairingToken();
    assert.match(token, /^ilp_[A-Za-z0-9_-]+$/);
    assert.ok(token.length >= 43, `token must be 32+ random bytes (got ${token.length} chars)`);
    seen.add(token);
  }
  assert.equal(seen.size, 200, 'no two tokens may ever collide');
  // Unlike the 6-digit invite code, a pairing token must be unguessable.
  assert.ok(!/^\d+$/.test(generatePairingToken()));
});

test('issue → resolve round-trips to the right {user_id, team_id}; junk never resolves', () => {
  const store = new PairingStore({ logger: SILENT, encryptionKey: SESSION_SECRET });
  const { token } = store.issue('usr_a', 'wsp_1');
  const resolved = store.resolve(token);
  assert.equal(resolved.user_id, 'usr_a');
  assert.equal(resolved.team_id, 'wsp_1');
  assert.equal(store.resolve(''), null);
  assert.equal(store.resolve('not-a-token'), null);
  assert.equal(store.resolve('ilp_wrong-but-well-formed'), null);
  assert.equal(store.resolve(token.slice(0, -1) + (token.endsWith('A') ? 'B' : 'A')), null, 'a mutated token must fail');
});

test('rotating invalidates the old token immediately and keeps exactly one token per pair', () => {
  const store = new PairingStore({ logger: SILENT, encryptionKey: SESSION_SECRET });
  const first = store.issue('usr_a', 'wsp_1').token;
  const second = store.issue('usr_a', 'wsp_1').token; // same pair — must replace
  assert.notEqual(first, second);
  assert.equal(store.resolve(first), null, 'the superseded token stops resolving at once');
  assert.equal(store.resolve(second).user_id, 'usr_a');
  assert.equal(store.count(), 1, 'one token per {user, team} pair');
  // A different team keeps its own independent token.
  const other = store.issue('usr_a', 'wsp_2').token;
  assert.equal(store.resolve(second).team_id, 'wsp_1');
  assert.equal(store.resolve(other).team_id, 'wsp_2');
  // reveal() returns the current plaintext (for the display screen).
  assert.equal(store.reveal('usr_a', 'wsp_2'), other);
});

test('the snapshot never contains the plaintext token — it is sealed at rest', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'interlock-pairing-disk-'));
  const file = path.join(dir, 'pairing.json');
  const store = new PairingStore({ filePath: file, logger: SILENT, encryptionKey: SESSION_SECRET });
  const { token } = store.issue('usr_a', 'wsp_1');
  const raw = fs.readFileSync(file, 'utf8');
  const persisted = JSON.parse(raw).pairings[hashPairingToken(token)];
  assert.match(persisted.sealedToken, /^v1\./, 'sealed with the secretbox envelope');
  assert.ok(!raw.includes(token), 'the plaintext token is never persisted');
  assert.equal(persisted.user_id, 'usr_a');
  assert.equal(persisted.team_id, 'wsp_1');
});

test('tokens survive a restart (hydrate from the snapshot) and rotation is durable', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'interlock-pairing-restart-'));
  const file = path.join(dir, 'pairing.json');
  const first = new PairingStore({ filePath: file, logger: SILENT, encryptionKey: SESSION_SECRET });
  const keep = first.issue('usr_a', 'wsp_1').token;
  const dropped = first.issue('usr_b', 'wsp_1').token;
  first.rotate('usr_b', 'wsp_1'); // rotates usr_b's token away
  const second = new PairingStore({ filePath: file, logger: SILENT, encryptionKey: SESSION_SECRET });
  assert.equal(second.resolve(keep).user_id, 'usr_a', 'surviving token still resolves after restart');
  assert.equal(second.resolve(dropped), null, 'rotated token stays dead after restart');
  // And with the WRONG key the sealed token is unreadable — resolution fails closed.
  const hostile = new PairingStore({
    filePath: file,
    logger: SILENT,
    encryptionKey: 'an-entirely-different-secret-xxxxxxxx',
  });
  assert.equal(hostile.resolve(keep), null);
});

test('serverless parity: a cold instance hydrates from the remote snapshot and every tool call still resolves', async () => {
  // Simulates Vercel: instance A issues a token (mirrored to "Upstash"), then a
  // cold instance B boots, preloads the snapshot, and serves the MCP endpoint.
  // The fake backend serializes on write, exactly like the real one — a stored
  // snapshot is never an aliased, mutable reference to the store's live state.
  const snapshots = new Map(); // fake cloud storage
  const remoteSave = (snapshot) => snapshots.set('pairings', JSON.parse(JSON.stringify(snapshot)));
  const fresh = () =>
    new PairingStore({
      logger: SILENT,
      encryptionKey: SESSION_SECRET,
      initialSnapshot: snapshots.get('pairings') ?? null,
      remoteSave,
    });

  const instanceA = fresh();
  const { token } = instanceA.issue('usr_a', 'wsp_1');
  await instanceA.waitForPersistence();
  assert.ok(snapshots.has('pairings'), 'the issue was mirrored to remote storage');

  // A resolve alone must NOT write to remote storage (stale instances must
  // never clobber a concurrent rotation through last-write-wins).
  const snapshotBefore = JSON.stringify(snapshots.get('pairings'));
  instanceA.resolve(token);
  await instanceA.waitForPersistence();
  assert.equal(JSON.stringify(snapshots.get('pairings')), snapshotBefore, 'resolve never writes to remote storage');

  const instanceB = fresh(); // cold start on another lambda
  assert.equal(instanceB.resolve(token).team_id, 'wsp_1', 'the token survives a cold start');

  // Rotation on B mirrors back; the NEXT cold instance refuses the dead token.
  const rotated = instanceB.rotate('usr_a', 'wsp_1');
  await instanceB.waitForPersistence();
  const instanceC = fresh();
  assert.equal(instanceC.resolve(token), null, 'a rotated-away token never survives into a cold instance');
  assert.equal(instanceC.resolve(rotated.token).user_id, 'usr_a', 'the replacement token does');
  // And within B itself (the instance that did the rotate) the old one is dead at once.
  assert.equal(instanceB.resolve(token), null);
});

test('GET /api/workspaces/:id/pairing issues once, re-displays, and returns the paste-ready MCP config', async () => {
  const h = await harness();
  try {
    const workspace = await h.createWorkspace();
    const response = await h.request('GET', `/api/workspaces/${workspace.id}/pairing`);
    assert.equal(response.status, 200);
    const first = await response.json();
    assert.match(first.token, /^ilp_/);
    assert.equal(first.mcpUrl, 'http://localhost:8787/mcp');
    assert.deepEqual(first.config, {
      mcpServers: {
        interlock: {
          url: 'http://localhost:8787/mcp',
          headers: { Authorization: `Bearer ${first.token}` },
        },
      },
    });
    // A second GET re-displays the SAME token — the screen is re-visitable.
    const again = await (await h.request('GET', `/api/workspaces/${workspace.id}/pairing`)).json();
    assert.equal(again.token, first.token);
    // A non-member gets a plain 404 — no information leak about the workspace.
    const foreign = await h.request('GET', `/api/workspaces/${workspace.id}/pairing`, { user: h.outsider });
    assert.equal(foreign.status, 404);
  } finally {
    await h.close();
  }
});

test('regenerate issues a fresh token and the old one stops resolving immediately', async () => {
  const h = await harness();
  try {
    const workspace = await h.createWorkspace();
    const first = await (await h.request('GET', `/api/workspaces/${workspace.id}/pairing`)).json();
    const regenerated = await (await h.request('POST', `/api/workspaces/${workspace.id}/pairing/regenerate`)).json();
    assert.match(regenerated.token, /^ilp_/);
    assert.notEqual(regenerated.token, first.token);
    assert.ok(regenerated.meta.rotatedAt, 'rotation is recorded');
    // The old token no longer works against the MCP endpoint.
    const oldConn = await h.mcpPost({ jsonrpc: '2.0', id: 1, method: 'tools/list' }, first.token);
    assert.equal(oldConn.status, 401);
    const newConn = await h.mcpPost({ jsonrpc: '2.0', id: 1, method: 'tools/list' }, regenerated.token);
    assert.equal(newConn.status, 200);
  } finally {
    await h.close();
  }
});

test('the /mcp middleware rejects missing and unresolvable tokens with 401', async () => {
  const h = await harness();
  try {
    const noToken = await h.mcpPost({ jsonrpc: '2.0', id: 1, method: 'tools/list' }, null);
    assert.equal(noToken.status, 401);
    assert.equal((await noToken.json()).error, 'invalid_token');
    const badToken = await h.mcpPost({ jsonrpc: '2.0', id: 1, method: 'tools/list' }, 'ilp_forged');
    assert.equal(badToken.status, 401);
    // A browser session cookie alone is worthless here — the agent surface is token-only.
    const cookieOnly = await h.request('POST', '/mcp', { body: { jsonrpc: '2.0', id: 1, method: 'tools/list' } });
    assert.equal(cookieOnly.status, 401);
    // GET is not a supported transport — POST JSON-RPC only.
    const get = await h.request('GET', '/mcp', { user: null });
    assert.equal(get.status, 405);
  } finally {
    await h.close();
  }
});

test('a valid token lists the three intent tools and attributes tool calls to the paired user + team', async () => {
  const h = await harness();
  try {
    const workspace = await h.createWorkspace();
    const { token } = await (await h.request('GET', `/api/workspaces/${workspace.id}/pairing`)).json();

    const init = await h.mcpPost(
      { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2024-11-05' } },
      token,
    );
    assert.equal(init.status, 200);
    const handshake = await init.json();
    assert.equal(handshake.result.serverInfo.name, 'interlock-mcp');
    assert.ok(handshake.result.capabilities.tools);

    const list = await h.mcpPost({ jsonrpc: '2.0', id: 2, method: 'tools/list' }, token);
    const tools = (await list.json()).result.tools.map((t) => t.name);
    assert.deepEqual(tools, ['post_intent', 'check_intent', 'complete_intent']);

    const call = await h.mcpPost(
      {
        jsonrpc: '2.0',
        id: 3,
        method: 'tools/call',
        params: {
          name: 'post_intent',
          arguments: { scopes: 'auth', summary: 'reworking the OAuth callback', rationale: 'login is broken on staging' },
        },
      },
      token,
    );
    assert.equal(call.status, 200);
    const result = await call.json();
    assert.equal(result.result.isError, undefined);
    const ack = JSON.parse(result.result.content[0].text);
    assert.equal(ack.type, 'ack');
    assert.equal(ack.status, 'claimed');
    assert.equal(ack.scope, 'auth');

    // THE core invariant: identity came from the token, never the agent.
    assert.equal(h.relayCalls.length, 1);
    assert.deepEqual(h.relayCalls[0].identity, { userId: h.owner.id, teamId: workspace.id });
    assert.equal(h.relayCalls[0].message.user_id, h.owner.id, 'the relayed claim is attributed to the paired user');
    assert.equal(h.relayCalls[0].message.scope, 'auth');

    // The "last used" timestamp is bumped — the UI can show agent activity.
    const refreshed = await (await h.request('GET', `/api/workspaces/${workspace.id}/pairing`)).json();
    assert.ok(refreshed.meta.lastUsedAt, 'token usage is tracked');
  } finally {
    await h.close();
  }
});

test('a pairing whose workspace is deleted is refused even though the token itself is intact', async () => {
  const h = await harness();
  try {
    const workspace = await h.createWorkspace();
    // member joins with a fresh invite code, then pairs.
    const { inviteCode } = await (
      await h.request('POST', `/api/workspaces/${workspace.id}/invite/regenerate`)
    ).json();
    const join = await h.request('POST', '/api/workspaces/join', { user: h.member, body: { code: inviteCode } });
    assert.equal(join.status, 200);
    const memberPairing = await (
      await h.request('GET', `/api/workspaces/${workspace.id}/pairing`, { user: h.member })
    ).json();
    const alive = await h.mcpPost({ jsonrpc: '2.0', id: 1, method: 'tools/list' }, memberPairing.token);
    assert.equal(alive.status, 200);

    // Owner deletes the workspace — the team (and the pairing's target) is gone.
    const del = await h.request('DELETE', `/api/workspaces/${workspace.id}`);
    assert.equal(del.status, 200);
    const refused = await h.mcpPost({ jsonrpc: '2.0', id: 2, method: 'tools/list' }, memberPairing.token);
    assert.equal(refused.status, 401, 'a token pointing at a dead workspace must not resolve');
  } finally {
    await h.close();
  }
});

