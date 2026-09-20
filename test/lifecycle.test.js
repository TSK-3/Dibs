// test/lifecycle.test.js — §4.3/§4.4 (reconnect + snapshot restore) and
// contract-validation edge cases. Complements integration.test.js.
import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import WebSocket from 'ws';
import { startServer } from '../src/server.js';
import { ClaimStore } from '../src/store.js';

const SCOPES = ['auth', 'payments', 'database', 'ui'];
const SCOPE_SET = new Set(SCOPES);

async function mkServer(t, extra = {}) {
  const snapshotPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'li-lc-')), 'snap.json');
  const handle = await startServer({
    port: 0, host: '127.0.0.1', snapshotPath, scopes: SCOPES, scopeSet: SCOPE_SET,
    logger: { log: () => {}, warn: () => {}, error: () => {} },
    claimTtlMs: 0, ...extra,
  });
  t.after(() => handle.close());
  return handle;
}

function client(handle, userId, teamId = 'insomniacs') {
  const ws = new WebSocket(`ws://127.0.0.1:${handle.port}/ws?user_id=${userId}&team_id=${teamId}`);
  const inbox = [];
  const waiters = [];
  ws.on('message', (d) => {
    const m = JSON.parse(d.toString());
    inbox.push(m);
    for (let i = 0; i < waiters.length; i++) {
      if (waiters[i].pred(m)) {
        const w = waiters.splice(i, 1)[0];
        clearTimeout(w.timer);
        w.resolve(m);
        break;
      }
    }
  });
  const opened = new Promise((res, rej) => { ws.on('open', res); ws.on('error', rej); });
  return {
    ws, inbox, opened,
    send: (m) => ws.send(JSON.stringify(m)),
    waitFor: (pred, label, timeoutMs = 2000) =>
      new Promise((resolve, reject) => {
        const hit = inbox.find(pred);
        if (hit) return resolve(hit);
        const timer = setTimeout(() => reject(new Error(`timeout waiting for ${label}`)), timeoutMs);
        waiters.push({ pred, timer, resolve });
      }),
    close: () =>
      new Promise((r) => {
        if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
          try { ws.close(); } catch { /* already closing */ }
          ws.once('close', r);
        } else r();
      }),
  };
}

const postIntent = (userId, scope, summary = `Working on ${scope}`) => ({
  type: 'post_intent', user_id: userId, scope, summary, rationale: 'test', timestamp: Date.now(),
});

// ── §4.3 — disconnect/reconnect without losing state ───────────────────────
test('client disconnect + reconnect keeps its claim; state syncs on reconnect', async (t) => {
  const h = await mkServer(t);
  const a = client(h, 'karthik');
  await a.opened;
  a.send(postIntent('karthik', 'auth', 'Refactoring token validation'));
  await a.waitFor((m) => m.type === 'ack', 'ack');
  a.send({ type: 'complete_intent', user_id: 'karthik', scope: 'auth' });
  await a.waitFor((m) => m.type === 'complete_ack', 'complete_ack');
  a.send(postIntent('karthik', 'auth', 'Refactoring token validation'));
  await a.waitFor((m) => m.type === 'ack', 'ack 2');
  await a.close(); // "wifi drops"

  // reconnect as the SAME identity → claim must still exist
  const a2 = client(h, 'karthik');
  await a2.opened;
  const state = await a2.waitFor((m) => m.type === 'state', 'state on reconnect');
  assert.equal(state.user_id, 'karthik');
  assert.equal(state.team_id, 'insomniacs');
  assert.equal(state.your_claims.length, 1);
  assert.equal(state.your_claims[0].scope, 'auth');
  assert.equal(state.your_claims[0].summary, 'Refactoring token validation');

  // and the conflict machinery still works for the reconnected client
  const b = client(h, 'tejashwin');
  await b.opened;
  b.send(postIntent('tejashwin', 'auth'));
  const intA2 = await a2.waitFor((m) => m.type === 'interrupt', 'interrupt after reconnect');
  assert.equal(intA2.from_user, 'tejashwin');

  await a2.close();
  await b.close();
});

// ── §4.4 — JSON snapshot restores state after a server restart ─────────────
test('server restart restores claims from the JSON snapshot on disk', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'li-restart-'));
  const snapshotPath = path.join(dir, 'snap.json');

  const h1 = await startServer({
    port: 0, host: '127.0.0.1', snapshotPath, scopes: SCOPES, scopeSet: SCOPE_SET,
    logger: { log: () => {}, warn: () => {}, error: () => {} }, claimTtlMs: 0,
  });
  const a = client(h1, 'karthik');
  await a.opened;
  a.send(postIntent('karthik', 'auth', 'Refactoring token validation'));
  await a.waitFor((m) => m.type === 'ack', 'ack');
  await a.close();
  await h1.close(); // snapshot already on disk (written on every mutation)

  assert.ok(fs.existsSync(snapshotPath), 'snapshot file must exist');
  const snap = JSON.parse(fs.readFileSync(snapshotPath, 'utf8'));
  assert.equal(snap.teams.insomniacs.auth.karthik.summary, 'Refactoring token validation');

  // "crash" is simulated by a brand-new server process pointing at the same file
  const h2 = await startServer({
    port: 0, host: '127.0.0.1', snapshotPath, scopes: SCOPES, scopeSet: SCOPE_SET,
    logger: { log: () => {}, warn: () => {}, error: () => {} }, claimTtlMs: 0,
  });
  const b = client(h2, 'tejashwin');
  await b.opened;
  b.send(postIntent('tejashwin', 'auth')); // same scope as the restored claim
  const intB = await b.waitFor((m) => m.type === 'interrupt', 'interrupt from restored state');
  assert.deepEqual(
    { from_user: intB.from_user, scope: intB.scope, message: intB.message },
    { from_user: 'karthik', scope: 'auth', message: 'Karthik already claimed auth — you\'re about to duplicate this' },
  );
  await b.close();
  await h2.close();
});

test('corrupt snapshot is backed up, not fatal — server starts empty', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'li-corrupt-'));
  const snapshotPath = path.join(dir, 'snap.json');
  fs.writeFileSync(snapshotPath, '{ this is not json !!!', 'utf8');
  const h = await startServer({
    port: 0, host: '127.0.0.1', snapshotPath, scopes: SCOPES, scopeSet: SCOPE_SET,
    logger: { log: () => {}, warn: () => {}, error: () => {} }, claimTtlMs: 0,
  });
  assert.equal(h.store.claimCount(), 0);
  assert.ok(fs.readdirSync(dir).some((f) => f.includes('corrupt')), 'corrupt file backed up');
  await h.close();
});

// ── contract validation / error paths ──────────────────────────────────────
test('protocol violations produce structured error messages', async (t) => {
  const h = await mkServer(t);
  const a = client(h, 'karthik');
  await a.opened;

  a.ws.send('not json at all'); // truly invalid JSON (raw frame, not stringified)
  const e1 = await a.waitFor((m) => m.type === 'error' && m.code === 'bad_json', 'bad_json');
  assert.equal(e1.code, 'bad_json');

  a.send({ type: 'post_intent', user_id: 'karthik', scope: 'auth', summary: 'x' }); // no rationale/timestamp
  const e2 = await a.waitFor((m) => m.type === 'error' && m.code === 'bad_request', 'bad_request missing fields');
  assert.match(e2.message, /rationale/);

  a.send({ type: 'post_intent', user_id: 'SOMEONE_ELSE', scope: 'auth', summary: 'x', rationale: 'y', timestamp: 1 });
  const e3 = await a.waitFor((m) => m.type === 'error' && m.code === 'identity_mismatch', 'identity_mismatch');
  assert.match(e3.message, /SOMEONE_ELSE/);

  a.send({ type: 'post_intent', user_id: 'karthik', scope: 'not-a-scope', summary: 'x', rationale: 'y', timestamp: 1 });
  const e4 = await a.waitFor((m) => m.type === 'error' && m.code === 'unknown_scope', 'unknown_scope');
  assert.match(e4.message, /closed enum/);

  a.send({ type: 'bogus_type', user_id: 'karthik' });
  const e5 = await a.waitFor((m) => m.type === 'error' && m.message.includes('bogus_type'), 'unknown type');
  assert.ok(e5.message.includes('Unknown message type'));

  await a.close();
});

test('unidentified socket must identify (query params or hello) before posting', async (t) => {
  const h = await mkServer(t);
  const raw = new WebSocket(`ws://127.0.0.1:${h.port}/ws`); // no query params
  const inbox = [];
  raw.on('message', (d) => inbox.push(JSON.parse(d.toString())));
  await new Promise((res, rej) => { raw.on('open', res); raw.on('error', rej); });

  raw.send(JSON.stringify(postIntent('karthik', 'auth')));
  await new Promise((r) => setTimeout(r, 150));
  assert.ok(inbox.some((m) => m.type === 'error' && m.code === 'not_identified'), 'must reject before identity');

  raw.send(JSON.stringify({ type: 'hello', user_id: 'karthik', team_id: 'insomniacs' }));
  await new Promise((r) => setTimeout(r, 150));
  assert.ok(inbox.some((m) => m.type === 'state' && m.user_id === 'karthik'), 'hello identifies');

  raw.send(JSON.stringify(postIntent('karthik', 'auth')));
  await new Promise((r) => setTimeout(r, 150));
  assert.ok(inbox.some((m) => m.type === 'ack' && m.scope === 'auth'), 'works after hello');
  raw.close();
});

// ── store unit checks (TTL pruning, multi-holder) ──────────────────────────
test('ClaimStore pruneExpired drops only stale claims and snapshots the change', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'li-ttl-'));
  const snapshotPath = path.join(dir, 'snap.json');
  const store = new ClaimStore({ snapshotPath, logger: { log: () => {}, warn: () => {} } });
  const now = Date.now();
  store.setClaim('t1', 'old-user', { scope: 'auth', user_id: 'old-user', summary: 's', rationale: 'r', timestamp: now, received_at: now - 60_000 });
  store.setClaim('t1', 'new-user', { scope: 'auth', user_id: 'new-user', summary: 's', rationale: 'r', timestamp: now, received_at: now });

  const expired = store.pruneExpired(30_000, now);
  assert.equal(expired.length, 1);
  assert.equal(expired[0].user_id, 'old-user');
  assert.equal(store.claimCount(), 1);

  const snap = JSON.parse(fs.readFileSync(snapshotPath, 'utf8'));
  assert.ok(snap.teams.t1.auth['new-user'], 'survivor present in snapshot');
  assert.ok(!snap.teams.t1.auth['old-user'], 'expired claim gone from snapshot');
});

test('two clients on the same scope (3-way) all hear about it', async (t) => {
  const h = await mkServer(t);
  const a = client(h, 'karthik');
  const b = client(h, 'tejashwin');
  const c = client(h, 'surya');
  await Promise.all([a.opened, b.opened, c.opened]);

  a.send(postIntent('karthik', 'ui'));
  await a.waitFor((m) => m.type === 'ack', 'ack A');
  b.send(postIntent('tejashwin', 'ui'));
  await b.waitFor((m) => m.type === 'interrupt', 'interrupt B');
  const intA = await a.waitFor((m) => m.type === 'interrupt', 'interrupt A');
  assert.equal(intA.from_user, 'tejashwin');

  c.send(postIntent('surya', 'ui'));
  const intC = await c.waitFor((m) => m.type === 'interrupt', 'interrupt C');
  assert.equal(intC.from_user, 'karthik'); // first existing holder reported
  await a.waitFor((m) => m.type === 'interrupt' && m.from_user === 'surya', 'A hears about C');

  await Promise.all([a.close(), b.close(), c.close()]);
});
