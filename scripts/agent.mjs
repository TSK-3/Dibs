#!/usr/bin/env node
// scripts/agent.mjs — a REAL Interlock agent client (no mocks).
//
// Connects to the live-interrupt WebSocket backend, posts a development intent,
// holds the claim, and prints every interrupt it receives. Run it from the repo
// root — or copy the exact command shown in the web console's Connect Agents
// view. The agent appears on the console's live roster within a second.
//
// Usage:
//   node scripts/agent.mjs --user cursor-ide --team <workspaceId> --scope auth \
//        [--summary "..."] [--rationale "..."] [--url ws://localhost:8080/ws] [--check]
//
//   --check  only queries the scope's status (check_intent) and exits.
//
// Requires Node >= 21 (global WebSocket). Exit codes: 0 clean, 2 usage error,
// 3 unreachable backend, 4 protocol error (unknown scope / rejected intent).
import process from 'node:process';

const args = process.argv.slice(2);
const readArg = (flag) => {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : null;
};
const hasFlag = (flag) => args.includes(flag);

const USER = readArg('--user');
const TEAM = readArg('--team');
const SCOPE = readArg('--scope');
const SUMMARY = readArg('--summary') ?? null;
const RATIONALE = readArg('--rationale') ?? 'Declared via scripts/agent.mjs';
const URL_OVERRIDE = readArg('--url');
const CHECK_ONLY = hasFlag('--check');

const usage = () => {
  console.error('usage: node scripts/agent.mjs --user <id> --team <id> --scope <scope> [--summary s] [--rationale r] [--url ws://host:port/ws] [--check]');
};

if (!USER || !TEAM || !SCOPE) {
  usage();
  process.exit(2);
}

const URL_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,63}$/;
const SCOPE_PATTERN = /^[a-z0-9][a-z0-9._/-]{0,63}$/;
if (!URL_PATTERN.test(USER) || !URL_PATTERN.test(TEAM)) {
  console.error('error: --user and --team must be 1-64 chars: letters, digits, . _ - (start alphanumeric)');
  process.exit(2);
}
const scope = SCOPE.trim().toLowerCase();
if (!SCOPE_PATTERN.test(scope)) {
  console.error(`error: invalid scope "${scope}" — use lowercase letters, digits, . _ / -`);
  process.exit(2);
}

const base = URL_OVERRIDE ?? process.env.LIVE_WS_URL ?? 'ws://localhost:8090/ws';
const wsUrl = (() => {
  try {
    const url = new URL(base);
    url.searchParams.set('user_id', USER);
    url.searchParams.set('team_id', TEAM);
    url.searchParams.set('client', 'cli-agent');
    return url.toString();
  } catch {
    console.error(`error: invalid --url "${base}"`);
    process.exit(2);
  }
})();

const summary = SUMMARY ?? `${USER} is working on ${scope}`;
const dim = (text) => `\x1b[2m${text}\x1b[0m`;
const bold = (text) => `\x1b[1m${text}\x1b[0m`;
const red = (text) => `\x1b[31m${text}\x1b[0m`;
const green = (text) => `\x1b[32m${text}\x1b[0m`;

console.log(dim(`[agent] ${USER}@${TEAM} → ${new URL(base).host}${new URL(base).pathname}`));

let ws;
let settled = false;
const fail = (code, message) => {
  if (!settled) {
    settled = true;
    console.error(red(`[agent] ${message}`));
    try { ws?.close(); } catch { /* ignore */ }
    process.exit(code);
  }
};

const connectTimeout = setTimeout(() => fail(3, `cannot reach backend at ${base} — start it with: npm start`), 5000);

try {
  ws = new WebSocket(wsUrl);
} catch (err) {
  clearTimeout(connectTimeout);
  fail(3, `cannot open socket: ${err.message}`);
}

const postIntent = () => {
  ws.send(JSON.stringify({
    type: 'post_intent',
    user_id: USER,
    scope,
    summary,
    rationale: RATIONALE,
    timestamp: Date.now(),
  }));
};

ws.onopen = () => {
  clearTimeout(connectTimeout);
  if (CHECK_ONLY) {
    ws.send(JSON.stringify({ type: 'check_intent', user_id: USER, scope }));
    return;
  }
  postIntent();
  console.log(green(`[agent] intent posted on "${scope}" — holding the claim (Ctrl+C to release)`));
};

ws.onmessage = (event) => {
  let msg;
  try {
    msg = JSON.parse(String(event.data));
  } catch {
    return;
  }
  switch (msg.type) {
    case 'state':
      console.log(dim(`[agent] state synced — ${msg.team_claims?.length ?? 0} claim(s) on this team, ${msg.agents?.length ?? 0} agent(s) online`));
      break;
    case 'ack':
      if (CHECK_ONLY) {
        console.log(green(`[agent] "${scope}" is free — nobody holds it`));
        settleAndClose(0);
      }
      break;
    case 'scope_status':
      console.log(
        msg.available
          ? green(`[agent] "${scope}" is free — nobody holds it`)
          : red(`[agent] "${scope}" is held by: ${(msg.claimed_by_others ?? []).join(', ')}`),
      );
      settleAndClose(0);
      break;
    case 'interrupt':
      console.log(bold(red(`[agent] INTERRUPT from ${msg.from_user}: ${msg.message}`)));
      console.log(dim(`        their intent: ${msg.summary ?? '(no summary)'}`));
      break;
    case 'complete_ack':
      console.log(dim(`[agent] release: ${msg.status}`));
      break;
    case 'claim_expired':
      console.log(dim('[agent] claim expired server-side'));
      break;
    case 'error':
      fail(4, `backend said ${msg.code}: ${msg.message}`);
      break;
    default:
      break;
  }
};

ws.onclose = (event) => {
  clearTimeout(connectTimeout);
  if (!settled && event.code !== 1000) fail(3, `connection closed (code ${event.code})`);
};

ws.onerror = () => {
  /* onclose follows with the real code */
};

let exiting = false;
function settleAndClose(code) {
  if (exiting) return;
  exiting = true;
  settled = true;
  try { ws.close(1000, 'done'); } catch { /* ignore */ }
  setTimeout(() => process.exit(code), 100);
}

process.on('SIGINT', () => {
  if (CHECK_ONLY || !ws || ws.readyState !== 1) process.exit(0);
  console.log(dim('\n[agent] releasing the claim…'));
  ws.send(JSON.stringify({ type: 'complete_intent', user_id: USER, scope }));
  setTimeout(() => process.exit(0), 250);
});
