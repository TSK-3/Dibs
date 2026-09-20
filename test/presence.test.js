// test/presence.test.js — the live roster: joins, multi-device refcounts,
// leaves, subscriber notifications, and the state payload's agent list.
// NOTE: this file runs with SCOPES_OPEN unset, so it also pins the DEFAULT
// closed-enum behaviour (hierarchical scopes rejected).
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createPresence } from '../src/presence.js';
import { ClaimStore } from '../src/store.js';
import { handleMessage, statePayload } from '../src/protocol.js';
import { SCOPES, SCOPE_SET } from '../src/config.js';
import { createLogger } from '../src/logger.js';

const SILENT = createLogger({ level: 'error', sink: { log() {}, warn() {}, error() {} } });

test('presence: join/leave maintain the roster with multi-device refcounts', () => {
  const presence = createPresence({ logger: SILENT });
  const now = Date.now();

  presence.join({ user_id: 'alice', team_id: 't1', connected_at: now, client: 'web-console' });
  assert.deepEqual(presence.roster('t1'), [
    { user_id: 'alice', team_id: 't1', connected_at: now, client: 'web-console' },
  ]);

  // Second device: same roster entry (no duplicate), later leave keeps her online.
  presence.join({ user_id: 'alice', team_id: 't1', connected_at: now + 5, client: 'web-console' });
  assert.equal(presence.roster('t1').length, 1);
  assert.equal(presence.roster('t1')[0].connected_at, now, 'the original connected_at is kept');
  assert.equal(Object.hasOwn(presence.roster('t1')[0], 'sockets'), false, 'refcounts are internal');

  presence.leave('t1', 'alice');
  assert.equal(presence.roster('t1').length, 1, 'one device is still connected');
  presence.leave('t1', 'alice');
  assert.equal(presence.roster('t1').length, 0, 'last device leaving empties the roster');
  assert.equal(presence.leave('t1', 'ghost'), false);
});

test('presence: subscribers are notified with the fresh roster', () => {
  const presence = createPresence({ logger: SILENT });
  const seen = [];
  const unsubscribe = presence.subscribe(({ teamId, agents }) => seen.push({ teamId, agents }));

  presence.join({ user_id: 'bob', team_id: 't9', connected_at: 1, client: 'cli-agent' });
  assert.equal(seen.length, 1);
  assert.equal(seen[0].teamId, 't9');
  assert.equal(seen[0].agents[0].user_id, 'bob');

  unsubscribe();
  presence.join({ user_id: 'carol', team_id: 't9', connected_at: 2, client: 'cli-agent' });
  assert.equal(seen.length, 1, 'unsubscribed listeners are not called');
});

test('closed mode stays closed: hierarchical scopes are rejected by default', () => {
  assert.equal(process.env.SCOPES_OPEN, undefined, 'this suite pins the default (closed) mode');
  const store = new ClaimStore({ snapshotPath: path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'il-presence-')), 'snap.json'), logger: SILENT });
  const presence = createPresence({ logger: SILENT });
  const sent = [];
  const session = {
    userId: 'alice', teamId: 't1', identified: true, metrics: null,
    send: (msg) => sent.push(msg),
  };
  const deps = {
    store, presence, scopeSet: SCOPE_SET, scopes: SCOPES,
    register: () => {}, now: () => 1_000, logger: SILENT, overlap: false,
    sendToUser: () => true,
  };

  handleMessage(session, JSON.stringify({ type: 'post_intent', user_id: 'alice', scope: 'auth', summary: 's', rationale: 'r', timestamp: 1 }), deps);
  assert.equal(sent.at(-1).type, 'ack');

  sent.length = 0;
  handleMessage(session, JSON.stringify({ type: 'post_intent', user_id: 'alice', scope: 'auth/login.tsx', summary: 's', rationale: 'r', timestamp: 2 }), deps);
  assert.equal(sent.at(-1).type, 'error');
  assert.equal(sent.at(-1).code, 'unknown_scope');
});

test('state payload includes the roster and claim received_at timestamps', () => {
  const store = new ClaimStore({ snapshotPath: path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'il-presence2-')), 'snap.json'), logger: SILENT });
  const presence = createPresence({ logger: SILENT });
  presence.join({ user_id: 'alice', team_id: 't1', connected_at: 42, client: 'web-console' });
  store.setClaim('t1', 'alice', { scope: 'auth', user_id: 'alice', summary: 's', rationale: 'r', timestamp: 7, received_at: 9 });

  const payload = statePayload(store, { teamId: 't1', userId: 'alice' }, presence);
  assert.deepEqual(payload.agents, [
    { user_id: 'alice', team_id: 't1', connected_at: 42, client: 'web-console' },
  ]);
  assert.equal(payload.team_claims[0].received_at, 9);
});
