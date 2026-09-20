// src/mcp/mcp-stdio.js — MCP tool wrapper (PRD §3.5, stretch goal).
// Wraps post_intent / check_intent / complete_intent as MCP tools so a real
// coding agent (Cursor, Copilot) can claim scopes directly, instead of a human
// speaking. Speaks newline-delimited JSON-RPC 2.0 over stdio and relays to the
// WS backend as a regular client — so conflicts still buzz the team's phones.
//
// Run:   node src/mcp/mcp-stdio.js
// Env:   WS_URL        (default ws://127.0.0.1:8080/ws)
//        MCP_USER_ID   (default "coding-agent")
//        MCP_TEAM_ID   (default "insomniacs")
//        MCP_TIMEOUT_MS (default 5000)
import readline from 'node:readline';
import process from 'node:process';
import WebSocket from 'ws';
import { SCOPES } from '../config.js';

const WS_URL = process.env.WS_URL || 'ws://127.0.0.1:8080/ws';
const USER_ID = process.env.MCP_USER_ID || 'coding-agent';
const TEAM_ID = process.env.MCP_TEAM_ID || 'insomniacs';
const TIMEOUT_MS = Number(process.env.MCP_TIMEOUT_MS || 5000);

// stdout is the protocol channel — every log line goes to stderr only.
const log = (...a) => console.error('[mcp]', ...a);
const reply = (id, result) => process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id, result }) + '\n');
const replyError = (id, code, message) =>
  process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id, error: { code, message } }) + '\n');

// ── WS relay client ────────────────────────────────────────────────────────
let ws = null;
let pending = null; // { pred, resolve } — one op in flight at a time
let chain = Promise.resolve();

const withLock = (fn) => {
  const run = chain.then(fn, fn);
  chain = run.then(() => {}, () => {});
  return run;
};

function connect() {
  return new Promise((resolve, reject) => {
    const url = new URL(WS_URL);
    url.searchParams.set('user_id', USER_ID);
    url.searchParams.set('team_id', TEAM_ID);
    const sock = new WebSocket(url.toString());
    const timer = setTimeout(() => {
      try { sock.terminate(); } catch { /* ignore */ }
      reject(new Error(`cannot reach backend at ${WS_URL} (is it running? npm start)`));
    }, TIMEOUT_MS);
    sock.on('open', () => {
      clearTimeout(timer);
      log(`connected to ${WS_URL} as ${USER_ID}@${TEAM_ID}`);
      resolve(sock);
    });
    sock.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
    sock.on('message', (data) => {
      let msg;
      try { msg = JSON.parse(data.toString()); } catch { return; }
      if (pending && pending.pred(msg)) {
        const p = pending;
        pending = null;
        p.resolve(msg);
      }
    });
    sock.on('close', () => { ws = null; log('backend connection closed'); });
  });
}

async function ensureConnected() {
  if (ws && ws.readyState === WebSocket.OPEN) return ws;
  ws = await connect();
  return ws;
}

function sendAndAwait(payload, okTypes) {
  return withLock(async () => {
    const sock = await ensureConnected();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pending = null;
        reject(new Error(`no response from backend within ${TIMEOUT_MS}ms`));
      }, TIMEOUT_MS);
      pending = {
        pred: (m) => okTypes.includes(m.type),
        resolve: (m) => { clearTimeout(timer); resolve(m); },
      };
      sock.send(JSON.stringify(payload));
    });
  });
}

// ── MCP tools (PRD §3.5 names: post_intent / check_intent / complete_intent) ──
const scopeProp = (desc) => ({ type: 'string', enum: SCOPES, description: desc });

const TOOLS = [
  {
    name: 'post_intent',
    description:
      'Claim a module scope for your work. If a teammate (human or agent) already claimed the same scope, the response is the conflict details — coordinate before writing code.',
    inputSchema: {
      type: 'object',
      properties: {
        scope: scopeProp('Module being worked on (team-wide closed enum)'),
        summary: { type: 'string', description: 'One line describing the work' },
        rationale: { type: 'string', description: 'Why this work is happening' },
      },
      required: ['scope', 'summary', 'rationale'],
    },
  },
  {
    name: 'check_intent',
    description:
      'Check whether a module scope is currently claimed by teammates, WITHOUT claiming it. Returns availability and holder details.',
    inputSchema: {
      type: 'object',
      properties: { scope: scopeProp('Module to check') },
      required: ['scope'],
    },
  },
  {
    name: 'complete_intent',
    description: 'Release a previously claimed module scope when the work is done.',
    inputSchema: {
      type: 'object',
      properties: { scope: scopeProp('Module to release') },
      required: ['scope'],
    },
  },
];

const toolText = (response) => ({ content: [{ type: 'text', text: JSON.stringify(response, null, 2) }] });

async function callTool(params) {
  const name = params?.name;
  const args = params?.arguments ?? {};
  if (name === 'post_intent') {
    const response = await sendAndAwait(
      {
        type: 'post_intent',
        user_id: USER_ID,
        scope: String(args.scope),
        summary: String(args.summary),
        rationale: String(args.rationale),
        timestamp: Date.now(),
      },
      ['ack', 'interrupt', 'error'],
    );
    return toolText(response);
  }
  if (name === 'check_intent') {
    const response = await sendAndAwait(
      { type: 'check_intent', user_id: USER_ID, scope: String(args.scope) },
      ['scope_status', 'error'],
    );
    return toolText(response);
  }
  if (name === 'complete_intent') {
    const response = await sendAndAwait(
      { type: 'complete_intent', user_id: USER_ID, scope: String(args.scope) },
      ['complete_ack', 'error'],
    );
    return toolText(response);
  }
  return { content: [{ type: 'text', text: `Unknown tool "${name}"` }], isError: true };
}

// ── JSON-RPC 2.0 over stdio (newline-delimited, per MCP stdio transport) ──
const rl = readline.createInterface({ input: process.stdin, terminal: false });

rl.on('line', (line) => {
  if (!line.trim()) return;
  let msg;
  try {
    msg = JSON.parse(line);
  } catch {
    log('unparseable stdin line (ignored)');
    return;
  }
  if (msg.method === undefined) return; // a response — we never send requests
  const { id, method, params } = msg;
  switch (method) {
    case 'initialize':
      reply(id, {
        protocolVersion: typeof params?.protocolVersion === 'string' ? params.protocolVersion : '2024-11-05',
        capabilities: { tools: {} },
        serverInfo: { name: 'live-interrupt-mcp', version: '1.0.0' },
      });
      break;
    case 'notifications/initialized':
      break; // notification — no reply
    case 'ping':
      reply(id, {});
      break;
    case 'tools/list':
      reply(id, { tools: TOOLS });
      break;
    case 'tools/call':
      callTool(params ?? {})
        .then((result) => reply(id, result))
        .catch((err) =>
          reply(id, { content: [{ type: 'text', text: `MCP error: ${err.message}` }], isError: true }),
        );
      break;
    default:
      if (id !== undefined) replyError(id, -32601, `Method not found: ${method}`);
  }
});

rl.on('close', () => {
  // stdin ended — but an in-flight tool call may still be mid round-trip.
  // Drain gracefully: wait for the op chain to settle (bounded), then exit.
  const deadline = Date.now() + TIMEOUT_MS + 1000;
  const drain = () => {
    const busy = pending !== null || ws?.readyState === WebSocket.CONNECTING;
    if (!busy || Date.now() > deadline) {
      try { ws?.close(); } catch { /* ignore */ }
      process.exit(0);
      return;
    }
    setTimeout(drain, 50);
  };
  drain();
});

log(`live-interrupt MCP ready (tools: post_intent, check_intent, complete_intent) — backend ${WS_URL}`);
