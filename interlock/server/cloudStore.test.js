// server/cloudStore.test.js — the durable-storage layer used by serverless
// deploys: the Upstash REST adapter itself, and — more importantly — the
// cross-instance contract it enables: a team created by one instance is
// joinable by a member who signs in on another one, and every cold start
// reloads the same state instead of logging everyone out.
import assert from 'node:assert/strict';
import test from 'node:test';
import { cloudBackendFromEnv, createUpstashRestBackend, CLOUD_KEY_PREFIX } from './cloudStore.js';
import { createLogger } from './logger.js';
import { UserStore } from './users.js';
import { WorkspaceStore } from './workspaces.js';
import { createPostgresBackend, postgresBackendFromEnv } from './postgresStore.js';

const SILENT = createLogger({ level: 'error', sink: { log() {}, info() {}, warn() {}, error() {} } });
const SECRET = 'cloud-test-secret'.padEnd(48, 'x');

const profile = (providerId, username) => ({
  provider: 'github',
  providerLabel: 'GitHub',
  providerId,
  name: username,
  username,
  email: `${username}@example.com`,
  emailVerified: true,
  avatarUrl: null,
});

/** Fake of the Upstash REST wire protocol: each POST body is a command array. */
function fakeUpstash() {
  const store = new Map();
  const commands = [];
  const fetchImpl = async (url, init) => {
    const command = JSON.parse(init.body);
    commands.push(command);
    const [op, key, value] = command;
    if (op !== 'GET' && op !== 'SET') {
      return { ok: true, json: async () => ({ error: `unknown command ${op}` }) };
    }
    if (op === 'GET') return { ok: true, json: async () => ({ result: store.get(key) ?? null }) };
    store.set(key, value);
    return { ok: true, json: async () => ({ result: 'OK' }) };
  };
  return { store, commands, fetchImpl };
}

/** Legacy helper for tests that exercise the stores without their barrier. */
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

test('cloud storage is off unless both Upstash variables are set', () => {
  const warnings = [];
  const logger = { log() {}, info() {}, warn: (msg) => warnings.push(msg), error() {} };
  assert.equal(cloudBackendFromEnv({}, { logger }), null);
  assert.equal(cloudBackendFromEnv({ UPSTASH_REDIS_REST_URL: 'https://db.upstash.io' }, { logger }), null);
  assert.match(warnings[0] ?? '', /together/);
  const backend = cloudBackendFromEnv(
    { UPSTASH_REDIS_REST_URL: 'https://db.upstash.io', UPSTASH_REDIS_REST_TOKEN: 'tok' },
    { logger },
  );
  assert.equal(backend.kind, 'upstash-rest');
});

test('postgres storage activates from Vercel connection variables', () => {
  assert.equal(postgresBackendFromEnv({}), null);
  assert.equal(postgresBackendFromEnv({ POSTGRES_URL: 'postgres://example' }).kind, 'supabase-postgres');
});

test('postgres storage creates and round-trips snapshots', async () => {
  const queries = [];
  const pool = {
    async query(sql, params = []) {
      queries.push({ sql, params });
      if (sql.startsWith('select snapshot')) return { rows: [{ snapshot: { version: 1 } }] };
      return { rows: [] };
    },
  };
  const backend = createPostgresBackend({ connectionString: 'postgres://example', pool, logger: SILENT });
  assert.deepEqual(await backend.load('users'), { version: 1 });
  assert.equal(await backend.save('users', { version: 2 }), true);
  assert.ok(queries.some(({ sql }) => sql.includes('create table if not exists interlock_snapshots')));
  assert.ok(queries.some(({ sql }) => sql.includes("jsonb_set") && sql.includes("'workspaces'")));
});

test('the backend round-trips a snapshot through GET/SET', async () => {
  const { commands, fetchImpl } = fakeUpstash();
  const backend = createUpstashRestBackend({
    url: 'https://db.upstash.test',
    token: 'tok',
    logger: SILENT,
    fetchImpl,
  });

  assert.equal(await backend.load('workspaces'), null, 'a miss reads as null, not an error');
  const snapshot = { version: 1, workspaces: { wsp_abc: { id: 'wsp_abc', name: 'X' } } };
  assert.equal(await backend.save('workspaces', snapshot), true);
  assert.equal(await backend.load('workspaces').then((s) => s.workspaces.wsp_abc.name), 'X');
  assert.ok(
    commands.some((c) => c[0] === 'SET' && c[1] === `${CLOUD_KEY_PREFIX}workspaces`),
    'the key namespaced under the interlock prefix',
  );
});

test('an unreachable backend degrades to empty on load instead of crashing boot', async () => {
  const backend = createUpstashRestBackend({
    url: 'https://db.upstash.test',
    token: 'tok',
    logger: SILENT,
    fetchImpl: async () => {
      throw new Error('connection refused');
    },
  });
  assert.equal(await backend.load('users'), null);
});

test('a non-https REST URL is rejected', () => {
  assert.throws(
    () => createUpstashRestBackend({ url: 'http://db.upstash.test', token: 'tok', logger: SILENT }),
    /https/,
  );
});

test('TEAM FLOW: a workspace created on instance A is joinable from instance B and survives a cold start', async () => {
  const { fetchImpl } = fakeUpstash();
  const cloud = createUpstashRestBackend({
    url: 'https://db.upstash.test',
    token: 'tok',
    logger: SILENT,
    fetchImpl,
  });

  // ── instance A: the owner signs in and creates the team ──────────────────
  const usersA = new UserStore({ logger: SILENT, encryptionKey: SECRET, remoteSave: (s) => cloud.save('users', s) });
  const owner = usersA.upsertFromProfile(profile('1', 'owner'));
  const workspacesA = new WorkspaceStore({ logger: SILENT, remoteSave: (s) => cloud.save('workspaces', s) });
  const created = workspacesA.create({
    owner,
    name: 'Deploy Team',
    repo: { fullName: 'octocat/interlock', private: false, defaultBranch: 'main', htmlUrl: null },
  });
  assert.equal(typeof created.inviteCode, 'string');
  assert.match(created.inviteCode, /^\d{6}$/);
  await flush(); // let the fire-and-forget mirror reach the cloud store

  // ── instance B: a cold start in another lambda — another member signs in ──
  const usersB = new UserStore({
    logger: SILENT,
    encryptionKey: SECRET,
    initialSnapshot: await cloud.load('users'),
    remoteSave: (s) => cloud.save('users', s),
  });
  assert.ok(usersB.get(owner.id), 'the cold instance knows the owner — no unknown_identity logout loop');
  const member = usersB.upsertFromProfile(profile('2', 'member'));
  await flush();

  const workspacesB = new WorkspaceStore({
    logger: SILENT,
    initialSnapshot: await cloud.load('workspaces'),
    remoteSave: (s) => cloud.save('workspaces', s),
  });
  const join = workspacesB.join(created.inviteCode, member);
  assert.equal(join.ok, true);
  assert.equal(join.workspace.members.length, 2);
  assert.equal(join.workspace.ownerUserId, owner.id);
  // Idempotent join: joining again must not duplicate the member.
  assert.equal(workspacesB.join(created.inviteCode, member).workspace.members.length, 2);
  await flush();

  // ── instance C: yet another cold start sees the full roster ──────────────
  const workspacesC = new WorkspaceStore({ logger: SILENT, initialSnapshot: await cloud.load('workspaces') });
  const record = workspacesC.get(created.workspace.id);
  assert.equal(record.members.length, 2);
  assert.equal(record.members.some((m) => m.username === 'member'), true);
  assert.ok(workspacesC.findByCode(created.inviteCode), 'the invite code still resolves after the round-trip');
  assert.equal(workspacesC.listForUser(owner.id).length, 1);
});

test('mutations expose a persistence barrier for serverless responses', async () => {
  let persisted = 0;
  const users = new UserStore({
    logger: SILENT,
    encryptionKey: SECRET,
    remoteSave: async () => {
      await new Promise((resolve) => setTimeout(resolve, 5));
      persisted += 1;
    },
  });
  users.upsertFromProfile(profile('barrier-user', 'barrier'));
  assert.equal(persisted, 0, 'the remote write is asynchronous');
  await users.waitForPersistence();
  assert.equal(persisted, 1);

  const workspaces = new WorkspaceStore({
    logger: SILENT,
    remoteSave: async () => {
      await new Promise((resolve) => setTimeout(resolve, 5));
      persisted += 1;
    },
  });
  workspaces.create({
    owner: users.get(users.findByProvider('github', 'barrier-user').id),
    name: 'Barrier',
    repo: { fullName: 'octocat/barrier', private: false, defaultBranch: 'main', htmlUrl: null },
  });
  await workspaces.waitForPersistence();
  assert.equal(persisted, 2);
});
