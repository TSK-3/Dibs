// test/open-scopes.test.js — SCOPES_OPEN=1: hierarchical scopes are accepted
// and conflicts fire on segment-aware overlap ("auth" ↔ "auth/login.tsx").
// The env var MUST be read by config.js before any static import could run
// (ESM hoisting), so the modules are imported dynamically after setting it.
process.env.SCOPES_OPEN = '1';

const assert = (await import('node:assert/strict')).default;
const { default: test } = await import('node:test');
const { createPresence } = await import('../src/presence.js');
const { ClaimStore } = await import('../src/store.js');
const { handleMessage } = await import('../src/protocol.js');
const { findConflicts, scopeOverlaps } = await import('../src/matcher.js');
const { SCOPES, SCOPE_SET, SCOPES_OPEN } = await import('../src/config.js');
const { createLogger } = await import('../src/logger.js');
const fs = (await import('node:fs')).default;
const os = (await import('node:os')).default;
const path = (await import('node:path')).default;

const SILENT = createLogger({ level: 'error', sink: { log() {}, warn() {}, error() {} } });

function freshDeps() {
  const store = new ClaimStore({
    snapshotPath: path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'il-open-')), 'snap.json'),
    logger: SILENT,
  });
  const presence = createPresence({ logger: SILENT });
  const delivered = new Map(); // `${team}::${user}` → messages
  return {
    store,
    presence,
    delivered,
    deps: {
      store,
      presence,
      scopeSet: SCOPE_SET,
      scopes: SCOPES,
      register: () => {},
      now: () => 1_000,
      logger: SILENT,
      overlap: true, // server.js passes SCOPES_OPEN
      sendToUser: (teamId, userId, msg) => {
        const key = `${teamId}::${userId}`;
        const list = delivered.get(key) ?? [];
        list.push(msg);
        delivered.set(key, list);
        return true;
      },
    },
  };
}

const sessionFor = (userId, teamId) => ({
  userId, teamId, identified: true, metrics: null,
  send: (msg) => sessionFor.inbox.push(msg),
});
sessionFor.inbox = [];

test('open mode is actually on in this suite', () => {
  assert.equal(SCOPES_OPEN, true);
});

test('scopeOverlaps: segment-aware, not substring-aware', () => {
  assert.equal(scopeOverlaps('auth', 'auth'), true);
  assert.equal(scopeOverlaps('auth', 'auth/login.tsx'), true);
  assert.equal(scopeOverlaps('auth/login.tsx', 'auth'), true);
  assert.equal(scopeOverlaps('auth/sub', 'auth/sub/deep.ts'), true);
  assert.equal(scopeOverlaps('auth', 'authorize'), false, 'prefix must respect segment boundaries');
  assert.equal(scopeOverlaps('api', 'auth'), false);
  assert.equal(scopeOverlaps('', 'auth'), false);
});

test('findConflicts: overlap mode widens, exact mode stays exact', () => {
  const { store } = freshDeps();
  store.setClaim('t1', 'alice', { scope: 'auth', user_id: 'alice', summary: 's', rationale: 'r', timestamp: 1, received_at: 1 });

  const wide = findConflicts(store, 't1', 'bob', 'auth/login.tsx', { overlap: true });
  assert.equal(wide.length, 1);
  assert.equal(wide[0].user_id, 'alice');
  assert.equal(wide[0].scope, 'auth');

  const exact = findConflicts(store, 't1', 'bob', 'auth/login.tsx', { overlap: false });
  assert.equal(exact.length, 0);
});

test('open mode: a file-path claim against a module claim interrupts BOTH sides', () => {
  const { store, presence, deps, delivered } = freshDeps();

  // Alice claims the module scope (in the closed enum).
  const alice = sessionFor('alice', 't1');
  alice.send = (msg) => alice.inbox.push(msg);
  alice.inbox = [];
  presence.join({ user_id: 'alice', team_id: 't1', connected_at: 1, client: 'cli-agent' });

  handleMessage(
    alice,
    JSON.stringify({ type: 'post_intent', user_id: 'alice', scope: 'auth', summary: 'Refactor auth middleware', rationale: 'r', timestamp: 1 }),
    deps,
  );
  assert.equal(alice.inbox.at(-1).type, 'ack');

  // Bob claims a file INSIDE that module — open mode accepts it and both
  // parties receive the PRD interrupt shape.
  const bob = sessionFor('bob', 't1');
  bob.send = (msg) => bob.inbox.push(msg);
  bob.inbox = [];
  presence.join({ user_id: 'bob', team_id: 't1', connected_at: 2, client: 'web-console' });

  handleMessage(
    bob,
    JSON.stringify({ type: 'post_intent', user_id: 'bob', scope: 'auth/login.tsx', summary: 'Touch the login screen', rationale: 'r', timestamp: 2 }),
    deps,
  );

  const bobGot = bob.inbox.filter((m) => m.type === 'interrupt');
  assert.equal(bobGot.length, 1, 'the poster learns the scope was already held');
  assert.equal(bobGot[0].from_user, 'alice');

  const aliceGot = delivered.get('t1::alice') ?? [];
  const holderInterrupts = aliceGot.filter((m) => m.type === 'interrupt');
  assert.equal(holderInterrupts.length, 1, 'the holder is buzzed on every live device');
  assert.equal(holderInterrupts[0].from_user, 'bob');

  // Both claims co-exist in the store.
  assert.equal(store.getTeamClaims('t1').length, 2);
});
