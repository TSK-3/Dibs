// test/integration.test.js — real end-to-end tests over actual WebSocket
// connections against a real server instance (node:test built-in runner).
// Covers every acceptance criterion in PRD §4 plus the §3.4 contract details.
import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import WebSocket from 'ws';
import { startServer } from '../src/server.js';

const SCOPES = ['auth', 'payments', 'database', 'api', 'ui', 'networking'];
const SCOPE_SET = new Set(SCOPES);

async function mkServer(t, extra = {}) {
  const snapshotPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'li-')), 'snap.json');
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
  const opened = new Promise((res, rej) => {
    ws.on('open', res);
    ws.on('error', rej);
  });
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

// ── §4.1 — two clients, post_intent → ack ──────────────────────────────────
test('two clients each post an intent and receive the PRD ack', async (t) => {
  const h = await mkServer(t);
  const a = client(h, 'karthik');
  const b = client(h, 'tejashwin');
  await Promise.all([a.opened, b.opened]);

  a.send(postIntent('karthik', 'auth', 'Refactoring token validation'));
  const ackA = await a.waitFor((m) => m.type === 'ack' && m.scope === 'auth', 'ack A');
  assert.deepEqual(
    { type: ackA.type, status: ackA.status, scope: ackA.scope },
    { type: 'ack', status: 'claimed', scope: 'auth' },
  );

  b.send(postIntent('tejashwin', 'ui', 'Login screen'));
  const ackB = await b.waitFor((m) => m.type === 'ack' && m.scope === 'ui', 'ack B');
  assert.equal(ackB.status, 'claimed');

  await Promise.all([a.close(), b.close()]);
});

// ── §4.2 — overlapping scope → interrupt to BOTH, within ~1s ───────────────
test('overlapping scope triggers interrupt to both clients within ~1 second', async (t) => {
  const h = await mkServer(t);
  const a = client(h, 'karthik');
  const b = client(h, 'tejashwin');
  await Promise.all([a.opened, b.opened]);

  a.send(postIntent('karthik', 'auth', 'Refactoring token validation'));
  await a.waitFor((m) => m.type === 'ack', 'ack A');

  const t0 = Date.now();
  b.send(postIntent('tejashwin', 'auth', 'Adding OAuth login screen'));

  const intB = await b.waitFor((m) => m.type === 'interrupt', 'interrupt B');
  const intA = await a.waitFor((m) => m.type === 'interrupt', 'interrupt A');
  const elapsed = Date.now() - t0;
  assert.ok(elapsed <= 1000, `interrupt took ${elapsed}ms, target ≤ 1000ms`);

  // Verbatim §3.4 interrupt shape, pushed to the ORIGINAL claimant (A)…
  assert.deepEqual(
    { type: intA.type, from_user: intA.from_user, scope: intA.scope, summary: intA.summary, message: intA.message },
    { type: 'interrupt', from_user: 'tejashwin', scope: 'auth', summary: 'Adding OAuth login screen',
      message: 'Tejashwin just claimed auth — you\'re about to duplicate this' },
  );
  // …and the POSTER sees who already held it.
  assert.deepEqual(
    { from_user: intB.from_user, scope: intB.scope, message: intB.message },
    { from_user: 'karthik', scope: 'auth', message: 'Karthik already claimed auth — you\'re about to duplicate this' },
  );

  await Promise.all([a.close(), b.close()]);
});

test('conflict is per-team: same scope in different teams does NOT conflict', async (t) => {
  const h = await mkServer(t);
  const a = client(h, 'karthik', 'team-red');
  const b = client(h, 'tejashwin', 'team-blue');
  await Promise.all([a.opened, b.opened]);

  a.send(postIntent('karthik', 'auth'));
  await a.waitFor((m) => m.type === 'ack', 'ack A');
  b.send(postIntent('tejashwin', 'auth'));
  const ackB = await b.waitFor((m) => m.type === 'ack', 'ack B');
  assert.equal(ackB.status, 'claimed');
  assert.ok(!a.inbox.some((m) => m.type === 'interrupt'), 'no cross-team interrupt');

  await Promise.all([a.close(), b.close()]);
});

test('same user re-posting their own scope is idempotent (no self-interrupt)', async (t) => {
  const h = await mkServer(t);
  const a = client(h, 'karthik');
  await a.opened;
  a.send(postIntent('karthik', 'auth', 'First pass'));
  await a.waitFor((m) => m.type === 'ack', 'ack 1');
  a.send(postIntent('karthik', 'auth', 'Second pass'));
  const ack2 = await a.waitFor((m) => m.type === 'ack', 'ack 2');
  assert.equal(ack2.status, 'claimed');
  assert.ok(!a.inbox.some((m) => m.type === 'interrupt'), 'no self-interrupt');
  await a.close();
});

// ── complete_intent ────────────────────────────────────────────────────────
test('complete_intent releases the claim; scope becomes claimable again', async (t) => {
  const h = await mkServer(t);
  const a = client(h, 'karthik');
  const b = client(h, 'tejashwin');
  await Promise.all([a.opened, b.opened]);

  a.send(postIntent('karthik', 'payments'));
  await a.waitFor((m) => m.type === 'ack', 'ack A');
  a.send({ type: 'complete_intent', user_id: 'karthik', scope: 'payments' });
  const done = await a.waitFor((m) => m.type === 'complete_ack', 'complete_ack');
  assert.deepEqual(
    { type: done.type, status: done.status, scope: done.scope },
    { type: 'complete_ack', status: 'released', scope: 'payments' },
  );

  b.send(postIntent('tejashwin', 'payments'));
  const ackB = await b.waitFor((m) => m.type === 'ack' && m.scope === 'payments', 'ack B');
  assert.equal(ackB.status, 'claimed'); // released → clean claim, no interrupt

  a.send({ type: 'complete_intent', user_id: 'karthik', scope: 'payments' });
  const nf = await a.waitFor((m) => m.type === 'complete_ack' && m.status === 'not_found', 'not_found');
  assert.equal(nf.status, 'not_found');

  await Promise.all([a.close(), b.close()]);
});
