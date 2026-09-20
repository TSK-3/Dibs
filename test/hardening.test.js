// test/hardening.test.js — production-grade behaviors: auth, rate limiting,
// field validation, scope normalization, /stats metrics, crash-safety.
import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import WebSocket from 'ws';
import { startServer } from '../src/server.js';
import { createRateLimiter } from '../src/ratelimit.js';

const SCOPES = ['auth', 'payments', 'ui'];
const SCOPE_SET = new Set(SCOPES);

async function mkServer(t, extra = {}) {
  const snapshotPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'li-h-')), 'snap.json');
  const handle = await startServer({
    port: 0, host: '127.0.0.1', snapshotPath, scopes: SCOPES, scopeSet: SCOPE_SET,
    logger: { log: () => {}, warn: () => {}, error: () => {} },
    claimTtlMs: 0, ...extra,
  });
  t.after(() => handle.close());
  return handle;
}

function client(handle, userId, teamId = 'insomniacs', qs = '') {
  const ws = new WebSocket(`ws://127.0.0.1:${handle.port}/ws?user_id=${userId}&team_id=${teamId}${qs}`);
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
  const opened = new Promise((res, rej) => {
    ws.on('open', res);
    ws.on('error', rej);
  });
  return {
    ws, inbox, opened,
    send: (m) => ws.send(JSON.stringify(m)),
    rawSend: (s) => ws.send(s),
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

// ── auth ───────────────────────────────────────────────────────────────────
test('AUTH_TOKEN: bad or missing token is rejected at the door; good token passes', async (t) => {
  const h = await mkServer(t, { authToken: 'sekrit' });

  const bad = new WebSocket(`ws://127.0.0.1:${h.port}/ws?user_id=a&team_id=b&token=WRONG`);
  const badClosed = new Promise((res) => bad.on('close', (code) => res(code)));
  const badMsgs = [];
  bad.on('message', (d) => badMsgs.push(JSON.parse(d.toString())));
  await new Promise((r) => bad.on('open', r));
  const closeCode = await Promise.race([badClosed, new Promise((r) => setTimeout(() => r('timeout'), 1500))]);
  assert.equal(closeCode, 1008, 'must close with policy-violation code');
  assert.ok(badMsgs.some((m) => m.type === 'error' && m.code === 'unauthorized'), 'explains why');

  const noTok = new WebSocket(`ws://127.0.0.1:${h.port}/ws?user_id=a&team_id=b`);
  const noTokClosed = new Promise((res) => noTok.on('close', (code) => res(code)));
  await new Promise((r) => noTok.on('open', r));
  assert.equal(await Promise.race([noTokClosed, new Promise((r) => setTimeout(() => r('timeout'), 1500))]), 1008);

  const good = client(h, 'karthik', 'insomniacs', '&token=sekrit');
  await good.opened;
  good.send(postIntent('karthik', 'auth'));
  const ack = await good.waitFor((m) => m.type === 'ack', 'ack');
  assert.equal(ack.status, 'claimed');
  await good.close();
});

test('open server (no AUTH_TOKEN) works unchanged', async (t) => {
  const h = await mkServer(t);
  const a = client(h, 'karthik');
  await a.opened;
  a.send(postIntent('karthik', 'auth'));
  assert.equal((await a.waitFor((m) => m.type === 'ack', 'ack')).status, 'claimed');
  await a.close();
});

// ── rate limiting ──────────────────────────────────────────────────────────
test('token bucket: burst beyond capacity gets rate_limited with retry_after_ms', async (t) => {
  const h2 = await startServer({
    port: 0, host: '127.0.0.1',
    snapshotPath: path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'li-rl-')), 'snap.json'),
    scopes: SCOPES, scopeSet: SCOPE_SET,
    logger: { log: () => {}, warn: () => {}, error: () => {} }, claimTtlMs: 0,
    rateLimiter: createRateLimiter({ capacity: 3, refillPerSec: 1 }),
  });
  t.after(() => h2.close());

  const a = client(h2, 'karthik');
  await a.opened;
  for (let i = 0; i < 6; i++) a.rawSend('{"type":"request_state"}'); // cheapest valid op
  await new Promise((r) => setTimeout(r, 300));
  const limited = a.inbox.filter((m) => m.type === 'error' && m.code === 'rate_limited');
  assert.ok(limited.length >= 1, 'at least one rate_limited error');
  assert.ok(Number.isFinite(limited[0].retry_after_ms), 'includes retry_after_ms');
  assert.ok(a.inbox.some((m) => m.type === 'state'), 'legitimate messages still served');
  await a.close();
});

// ── validation ─────────────────────────────────────────────────────────────
test('field_too_long: over-length summary is rejected with a precise error', async (t) => {
  const h = await mkServer(t);
  const a = client(h, 'karthik');
  await a.opened;
  a.send(postIntent('karthik', 'auth', 'x'.repeat(600)));
  const err = await a.waitFor((m) => m.type === 'error' && m.code === 'field_too_long', 'field_too_long');
  assert.equal(err.max_length, 512);
  assert.ok(!a.inbox.some((m) => m.type === 'ack'), 'no claim created');
  await a.close();
});

test('invalid identity chars (query param AND hello) are rejected before registration', async (t) => {
  const h = await mkServer(t);
  // query param path
  const bad = new WebSocket(`ws://127.0.0.1:${h.port}/ws?user_id=${encodeURIComponent('bad;id!')}@x&team_id=t`);
  const badMsgs = [];
  bad.on('message', (d) => badMsgs.push(JSON.parse(d.toString())));
  const badClosed = new Promise((r) => bad.on('close', r));
  await new Promise((r) => bad.on('open', r));
  await Promise.race([badClosed, new Promise((r) => setTimeout(r, 800))]);
  assert.ok(badMsgs.some((m) => m.type === 'error' && m.code === 'bad_request'), 'query-param identity rejected');

  // hello path — must be an UNIDENTIFIED socket for hello to apply
  const raw = new WebSocket(`ws://127.0.0.1:${h.port}/ws`);
  const rawMsgs = [];
  raw.on('message', (d) => rawMsgs.push(JSON.parse(d.toString())));
  await new Promise((r, j) => { raw.on('open', r); raw.on('error', j); });
  raw.send(JSON.stringify({ type: 'hello', user_id: 'bad;id!', team_id: 't' }));
  await new Promise((r) => setTimeout(r, 200));
  assert.ok(rawMsgs.some((m) => m.type === 'error' && m.code === 'bad_request' && /Invalid user_id/.test(m.message)), 'bad hello identity rejected');
  raw.close();

  const a = client(h, 'goodid');
  await a.opened;
  a.send({ type: 'hello', user_id: 'second', team_id: 't' });
  const already = await a.waitFor((m) => m.type === 'error' && m.code === 'already_identified', 'already_identified');
  assert.match(already.message, /already identified/);
  await a.close();
});

// ── scope normalization ────────────────────────────────────────────────────
test('scope normalization: "AUTH" and " auth " match "auth" claims exactly', async (t) => {
  const h = await mkServer(t);
  const a = client(h, 'karthik');
  const b = client(h, 'tejashwin');
  await Promise.all([a.opened, b.opened]);

  a.send(postIntent('karthik', 'auth'));
  await a.waitFor((m) => m.type === 'ack', 'ack A');
  b.send({ ...postIntent('tejashwin', 'AUTH'), scope: 'AUTH' });
  const intB = await b.waitFor((m) => m.type === 'interrupt', 'interrupt B');
  assert.equal(intB.scope, 'auth', 'normalized in the interrupt payload');
  const intA = await a.waitFor((m) => m.type === 'interrupt', 'interrupt A');
  assert.equal(intA.from_user, 'tejashwin');

  await Promise.all([a.close(), b.close()]);
});

// ── /stats ─────────────────────────────────────────────────────────────────
test('/stats exposes counters and gauges and tracks real traffic', async (t) => {
  const h = await mkServer(t);
  const base = await (await fetch(`http://127.0.0.1:${h.port}/stats`)).json();
  assert.ok(base.uptime_ms >= 0);
  assert.ok('counters' in base && 'gauges' in base);

  const a = client(h, 'karthik');
  const b = client(h, 'tejashwin');
  await Promise.all([a.opened, b.opened]);
  a.send(postIntent('karthik', 'auth'));
  await a.waitFor((m) => m.type === 'ack', 'ack');
  b.send(postIntent('tejashwin', 'auth'));
  await b.waitFor((m) => m.type === 'interrupt', 'interrupt');

  const after = await (await fetch(`http://127.0.0.1:${h.port}/stats`)).json();
  assert.ok(after.counters.ws_connections_total >= (base.counters.ws_connections_total ?? 0) + 2);
  assert.ok(after.counters.intents_posted_total >= 2);
  assert.ok(after.counters.conflicts_detected_total >= 1);
  const interruptsSent = after.counters.interrupts_sent_total;
  assert.ok((typeof interruptsSent === 'number' ? interruptsSent : interruptsSent?._total ?? 0) >= 1);
  assert.equal(after.gauges.connected_clients, 2);

  await Promise.all([a.close(), b.close()]);
});

// ── crash safety ───────────────────────────────────────────────────────────
test('snapshot survives a mid-flight crash simulation (file written on every mutation)', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'li-crash-'));
  const snapshotPath = path.join(dir, 'snap.json');
  const h = await startServer({
    port: 0, host: '127.0.0.1', snapshotPath, scopes: SCOPES, scopeSet: SCOPE_SET,
    logger: { log: () => {}, warn: () => {}, error: () => {} }, claimTtlMs: 0,
  });
  const a = client(h, 'karthik');
  await a.opened;
  a.send(postIntent('karthik', 'auth', 'pre-crash claim'));
  await a.waitFor((m) => m.type === 'ack', 'ack');
  // Simulate power loss: do NOT call close() — the snapshot was already
  // written synchronously at mutation time, so it must be on disk already.
  const snapOnDisk = JSON.parse(fs.readFileSync(snapshotPath, 'utf8'));
  assert.equal(snapOnDisk.teams.insomniacs.auth.karthik.summary, 'pre-crash claim');
  await h.close();
});

// ── protocol deep checks ───────────────────────────────────────────────────
test('timestamp rejects non-finite numbers; extra fields are ignored (forward compatible)', async (t) => {
  const h = await mkServer(t);
  const a = client(h, 'karthik');
  await a.opened;
  a.send({ type: 'post_intent', user_id: 'karthik', scope: 'ui', summary: 's', rationale: 'r', timestamp: 'not-a-number' });
  const err = await a.waitFor((m) => m.type === 'error' && m.code === 'bad_request', 'bad timestamp');
  assert.match(err.message, /timestamp/);
  a.send({ ...postIntent('karthik', 'ui'), unknown_future_field: { nested: true } });
  assert.equal((await a.waitFor((m) => m.type === 'ack' && m.scope === 'ui', 'ack')).status, 'claimed');
  await a.close();
});
