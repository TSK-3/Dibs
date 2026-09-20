// scripts/demo.js — narrated end-to-end run of the whole loop (PRD §1):
// two teammates, one shared scope, live interrupt on BOTH phones.
// Self-contained: starts the backend in-process, runs the script, exits.
//
//   npm run demo
//   DEMO_PORT=9090 DEMO_HOST=127.0.0.1 npm run demo   (custom port/host)
//   While it keeps running, open http://localhost:8080 on two phones and
//   act it live with real people.
import { startServer } from '../src/server.js';
import WebSocket from 'ws';
import os from 'node:os';
import path from 'node:path';

const PORT = Number(process.env.DEMO_PORT || 8080);
const HOST = process.env.DEMO_HOST || '0.0.0.0';
const TEAM = 'insomniacs';
// Demo should be a clean slate — previous runs' claims would fake a conflict.
// Override with DEMO_SNAPSHOT to reuse state, or point DEMO_PORT at your port.
const SNAPSHOT =
  process.env.DEMO_SNAPSHOT || path.join(os.tmpdir(), `live-interrupt-demo-${process.pid}.json`);

const c = {
  dim: (s) => `\x1b[2m${s}\x1b[22m`,
  bold: (s) => `\x1b[1m${s}\x1b[22m`,
  green: (s) => `\x1b[32m${s}\x1b[39m`,
  red: (s) => `\x1b[31m${s}\x1b[39m`,
  cyan: (s) => `\x1b[36m${s}\x1b[39m`,
  yellow: (s) => `\x1b[33m${s}\x1b[39m`,
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function client(userId) {
  const ws = new WebSocket(`ws://127.0.0.1:${PORT}/ws?user_id=${userId}&team_id=${TEAM}`);
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
  return {
    ws,
    inbox,
    send: (m) => {
      console.log(c.dim(`    ${userId} → `) + c.dim(JSON.stringify(m)));
      ws.send(JSON.stringify(m));
    },
    waitFor: (pred, label, timeoutMs = 3000) =>
      new Promise((resolve, reject) => {
        const existing = inbox.find(pred);
        if (existing) return resolve(existing);
        const timer = setTimeout(() => reject(new Error(`${userId}: timed out waiting for ${label}`)), timeoutMs);
        waiters.push({ pred, timer, resolve });
      }),
    open: () => new Promise((res, rej) => {
      ws.on('open', res);
      ws.on('error', rej);
    }),
  };
}

const show = (userId, m) => {
  const body = JSON.stringify(m);
  if (m.type === 'interrupt') console.log(c.bold(c.red(`⚡ ${userId.padEnd(10)}← ${body}`)));
  else if (m.type === 'ack') console.log(c.green(`✔ ${userId.padEnd(10)}← ${body}`));
  else if (m.type === 'error') console.log(c.yellow(`✖ ${userId.padEnd(10)}← ${body}`));
  else console.log(c.dim(`${userId.padEnd(10)}← ${body}`));
};

console.log(c.bold('\n── Live Interrupt — scripted demo ─────────────────────────────────'));
const server = await startServer({ port: PORT, host: HOST, snapshotPath: SNAPSHOT });
console.log(`  backend    : ws://localhost:${PORT}/ws ${c.dim(`(snapshot → ${server.snapshotPath})`)}`);
console.log(`  test bench : ${c.cyan(`http://localhost:${PORT}/`)} ${c.dim('← open on two phones for the live version')}\n`);

const karthik = client('karthik');
const tejashwin = client('tejashwin');
await Promise.all([karthik.open(), tejashwin.open()]);
console.log(c.dim('  both clients connected (identity = user_id + team_id, reconnect-safe)\n'));

// 1 — Karthik claims auth cleanly
console.log(c.bold('1. Karthik speaks an intent → posted, scope "auth" is free'));
karthik.send({
  type: 'post_intent', user_id: 'karthik', scope: 'auth',
  summary: 'Refactoring token validation',
  rationale: 'Cleaning up auth module before demo', timestamp: Date.now(),
});
show('karthik', await karthik.waitFor((m) => m.type === 'ack' && m.scope === 'auth', 'ack'));
console.log(c.dim('   → claimed cleanly, no conflict\n'));
await sleep(900);

// 2 — Tejashwin posts the same scope → both phones buzz
console.log(c.bold('2. Tejashwin (unaware) posts the SAME scope — conflict!'));
const t0 = Date.now();
tejashwin.send({
  type: 'post_intent', user_id: 'tejashwin', scope: 'auth',
  summary: 'Adding OAuth login screen',
  rationale: 'New sign-in flow', timestamp: Date.now(),
});
show('tejashwin', await tejashwin.waitFor((m) => m.type === 'interrupt', 'interrupt'));
const intK = await karthik.waitFor((m) => m.type === 'interrupt', 'interrupt');
show('karthik', intK);
console.log(`  ${c.bold(c.green(`interrupt delivered in ${Date.now() - t0}ms  (target ≤ 1000ms)`))}\n`);
await sleep(900);

// 3 — Tejashwin backs off, completes, picks uncontested work
console.log(c.bold('3. Tejashwin backs off → releases, picks "ui", now clean'));
tejashwin.send({ type: 'complete_intent', user_id: 'tejashwin', scope: 'auth' });
show('tejashwin', await tejashwin.waitFor((m) => m.type === 'complete_ack', 'complete_ack'));
await sleep(400);
tejashwin.send({
  type: 'post_intent', user_id: 'tejashwin', scope: 'ui',
  summary: 'Login screen layout',
  rationale: 'Unblocked UI work', timestamp: Date.now(),
});
show('tejashwin', await tejashwin.waitFor((m) => m.type === 'ack' && m.scope === 'ui', 'ack'));
console.log(c.dim('\n   → conflict resolved in seconds, before anyone wasted work'));

console.log(c.bold('\n── demo loop complete ──────────────────────────────────────────────'));
if (process.env.DEMO_EXIT) {
  await server.close();
  console.log(c.dim('server stopped (DEMO_EXIT=1)'));
  process.exit(0);
}
console.log(c.dim('server still running for live phones — Ctrl+C to stop\n'));
