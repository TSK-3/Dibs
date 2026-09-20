// src/server.js — single-process Node.js WebSocket server (PRD §3.1–3.4).
// Deliberately NOT microservices: 30-hour budget, no infra overhead.
import http from 'node:http';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { WebSocketServer, WebSocket } from 'ws';
import {
  PORT, HOST, WS_PATH, MAX_MESSAGE_BYTES, PING_INTERVAL_MS,
  SCOPES, SCOPE_SET, SNAPSHOT_PATH, CLAIM_TTL_MS, ROOT_DIR,
  LOG_LEVEL, LOG_JSON, RATE_CAPACITY, RATE_REFILL_PER_SEC,
  MAX_CLIENTS, AUTH_TOKEN, ID_PATTERN, SCOPES_OPEN,
} from './config.js';
import { ClaimStore } from './store.js';
import { handleMessage, statePayload } from './protocol.js';
import { createPresence } from './presence.js';
import { createLogger } from './logger.js';
import { createMetrics } from './metrics.js';
import { createRateLimiter } from './ratelimit.js';

const DEMO_PAGE = path.join(ROOT_DIR, 'public', 'index.html');

/** Best-effort send that never throws, regardless of socket state. */
function safeSend(ws, obj) {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  try {
    ws.send(JSON.stringify(obj));
  } catch {
    /* socket died mid-send */
  }
}


export function startServer(options = {}) {
  const port = options.port ?? PORT;
  const host = options.host ?? HOST;
  const snapshotPath = options.snapshotPath ?? SNAPSHOT_PATH;
  const claimTtlMs = options.claimTtlMs ?? CLAIM_TTL_MS;
  const logger = options.logger ?? createLogger({ level: LOG_LEVEL, json: LOG_JSON });
  const scopes = options.scopes ?? SCOPES;
  const scopeSet = options.scopeSet ?? SCOPE_SET;
  const metrics = options.metrics ?? createMetrics();
  const rateLimiter = options.rateLimiter ??
    createRateLimiter({ capacity: RATE_CAPACITY, refillPerSec: RATE_REFILL_PER_SEC });
  const maxClients = options.maxClients ?? MAX_CLIENTS;
  const authToken = options.authToken ?? AUTH_TOKEN;

  const store = new ClaimStore({ snapshotPath, logger });
  const presence = options.presence ?? createPresence({ logger });

  // Same process also serves the browser test bench + tiny JSON endpoints.
  const httpServer = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');
    if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/index.html')) {
      try {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(readFileSync(DEMO_PAGE));
      } catch {
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end('demo page missing (public/index.html)');
      }
      return;
    }
    if (req.method === 'GET' && url.pathname === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, uptime_s: Math.round(process.uptime()), active_claims: store.claimCount() }));
      return;
    }
    if (req.method === 'GET' && url.pathname === '/config') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ scopes, claim_ttl_ms: claimTtlMs, ws_path: WS_PATH }));
      return;
    }
    if (req.method === 'GET' && url.pathname === '/stats') {
      metrics.setGauge('active_claims', store.claimCount());
      metrics.setGauge('connected_clients', wss.clients.size);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(metrics.snapshot(), null, 2));
      return;
    }
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('not found');
  });

  const wss = new WebSocketServer({ server: httpServer, path: WS_PATH });

  /** "team::user" → Set of live sockets (multi-device friendly) */
  const byUser = new Map();
  const keyOf = (teamId, userId) => `${teamId}::${userId}`;

  // Interrupts must reach every device a user has connected — phones, tabs, agents.
  const sendToUser = (teamId, userId, obj) => {
    const set = byUser.get(keyOf(teamId, userId));
    if (!set || set.size === 0) return false;
    const data = JSON.stringify(obj);
    let delivered = false;
    for (const ws of set) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(data);
        delivered = true;
      }
    }
    return delivered;
  };

  const register = (session) => {
    const key = keyOf(session.teamId, session.userId);
    let set = byUser.get(key);
    if (!set) {
      set = new Set();
      byUser.set(key, set);
    }
    set.add(session.ws);
  };

  const unregister = (session) => {
    const key = keyOf(session.teamId, session.userId);
    const set = byUser.get(key);
    if (!set) return;
    set.delete(session.ws);
    if (set.size === 0) byUser.delete(key);
  };

  const deps = {
    store, sendToUser, register, scopeSet, scopes, now: () => Date.now(), logger,
    presence, overlap: SCOPES_OPEN,
  };

  // Roster changes go to the whole team, on every live device. byUser keys are
  // `${teamId}::${userId}`, so a prefix scan finds the team's sockets cheaply.
  presence.subscribe(({ teamId, agents }) => {
    const data = JSON.stringify({ type: 'roster', team_id: teamId, agents });
    for (const [key, set] of byUser) {
      if (!key.startsWith(`${teamId}::`)) continue;
      for (const ws of set) {
        if (ws.readyState === WebSocket.OPEN) {
          try {
            ws.send(data);
          } catch {
            /* socket died mid-send */
          }
        }
      }
    }
  });

  wss.on('connection', (ws, req) => {
    metrics.inc('ws_connections_total');
    // Connection cap: shed load politely instead of degrading everyone.
    if (wss.clients.size > maxClients) {
      metrics.inc('ws_rejected_total', 1, { reason: 'client_cap' });
      logger.warn?.(`[ws] client cap reached (${maxClients}) — rejecting connection from ${req.socket.remoteAddress}`);
      try {
        ws.close(1013, 'server at capacity');
      } catch {
        /* ignore */
      }
      return;
    }

    const url = new URL(req.url, 'http://localhost');

    // Shared-secret auth (optional): ?token=… — enforced at the door.
    if (authToken) {
      const supplied = url.searchParams.get('token') ?? '';
      if (supplied !== authToken) {
        metrics.inc('ws_rejected_total', 1, { reason: 'bad_token' });
        logger.warn?.(`[ws] rejected connection with invalid token from ${req.socket.remoteAddress}`);
        safeSend(ws, { type: 'error', code: 'unauthorized', message: 'Invalid or missing token' });
        try {
          ws.close(1008, 'unauthorized');
        } catch {
          /* ignore */
        }
        return;
      }
      metrics.inc('ws_auth_ok_total');
    }

    const session = { ws, userId: null, teamId: null, identified: false, metrics };
    session.send = (obj) => safeSend(ws, obj);

    ws.isAlive = true;
    ws.on('pong', () => {
      ws.isAlive = true;
    });

    // Identity via query params (preferred). A `hello` message also works.
    const qUserId = url.searchParams.get('user_id');
    const qTeamId = url.searchParams.get('team_id');
    const qClient = url.searchParams.get('client');
    if (qUserId && qTeamId) {
      if (!ID_PATTERN.test(qUserId) || !ID_PATTERN.test(qTeamId)) {
        metrics.inc('ws_rejected_total', 1, { reason: 'bad_identity' });
        safeSend(ws, {
          type: 'error', code: 'bad_request',
          message: 'Invalid user_id/team_id — use 1-64 chars: letters, digits, . _ - (must start alphanumeric)',
        });
        try {
          ws.close(1008, 'invalid identity');
        } catch {
          /* ignore */
        }
        return;
      }
      session.userId = qUserId;
      session.teamId = qTeamId;
      session.client = qClient && ID_PATTERN.test(qClient) ? qClient : 'client';
      session.identified = true;
      register(session);
      presence.join({
        user_id: session.userId, team_id: session.teamId, connected_at: Date.now(), client: session.client,
      });
      session.send(statePayload(store, session, presence));
      logger.log?.(`[ws] ${qUserId}@${qTeamId} connected`);
    } else {
      logger.log?.('[ws] unidentified socket — waiting for hello message');
    }

    ws.on('message', (data, isBinary) => {
      if (isBinary) {
        safeSend(ws, { type: 'error', code: 'bad_request', message: 'Binary frames are not supported' });
        return;
      }
      if (data.length > MAX_MESSAGE_BYTES) {
        metrics.inc('ws_rate_limited_total', 1, { reason: 'message_too_large' });
        safeSend(ws, { type: 'error', code: 'message_too_large', message: `Message exceeds ${MAX_MESSAGE_BYTES} bytes` });
        return;
      }
      // Per-connection token bucket — keyed by socket, so identified or not.
      const rl = rateLimiter.tryTake(ws._rlKey ??= `conn:${req.socket.remotePort}`);
      if (!rl.ok) {
        metrics.inc('ws_rate_limited_total', 1, { reason: 'token_bucket' });
        safeSend(ws, {
          type: 'error', code: 'rate_limited',
          message: `Too many messages — slow down (retry in ~${Math.ceil(rl.retryAfterMs / 100) * 100}ms)`,
          retry_after_ms: rl.retryAfterMs,
        });
        return;
      }
      metrics.inc('ws_messages_total');
      handleMessage(session, data.toString('utf8'), deps);
    });

    // Disconnect handling (PRD §3.1): socket goes away, CLAIMS do not — they
    // live in the store keyed by identity, so a reconnect finds everything.
    // Presence DOES drop — but only when this was the user's last live socket.
    ws.on('close', () => {
      if (session.identified) {
        unregister(session);
        if (!byUser.has(keyOf(session.teamId, session.userId))) {
          presence.leave(session.teamId, session.userId);
        }
      }
    });
    ws.on('error', (err) => logger.warn?.(`[ws] socket error (${session.userId ?? 'unknown'}): ${err.message}`));
  });

  // Heartbeat: venue wifi silently drops sockets — reap the dead ones (PRD §3.1).
  const heartbeat = setInterval(() => {
    for (const ws of wss.clients) {
      if (ws.isAlive === false) {
        try {
          ws.terminate();
        } catch {
          /* ignore */
        }
        continue;
      }
      ws.isAlive = false;
      try {
        ws.ping();
      } catch {
        /* ignore */
      }
    }
  }, PING_INTERVAL_MS);

  // Optional claim expiry — default OFF (strict PRD behaviour); CLAIM_TTL_MS enables.
  let ttlTimer = null;
  if (claimTtlMs > 0) {
    ttlTimer = setInterval(() => {
      for (const e of store.pruneExpired(claimTtlMs)) {
        sendToUser(e.teamId, e.user_id, {
          type: 'claim_expired', scope: e.scope, user_id: e.user_id, expired_at: e.expiredAt,
        });
      }
    }, Math.min(60_000, Math.max(1_000, Math.floor(claimTtlMs / 4))));
  }

  // Periodic rate-bucket sweep so idle reconnects don't grow the map forever.
  const rateSweepTimer = setInterval(() => rateLimiter.sweep(), 120_000);
  rateSweepTimer.unref?.();

  return new Promise((resolve, reject) => {
    httpServer.once('error', reject);
    httpServer.listen(port, host, () => {
      httpServer.removeListener('error', reject);
      const actualPort = httpServer.address().port;
      logger.log?.(`[server] live-interrupt backend → ws://${host === '0.0.0.0' ? 'localhost' : host}:${actualPort}${WS_PATH}`);
      logger.log?.(`[server] snapshot → ${snapshotPath}`);
      logger.log?.(`[server] scopes (closed enum): ${scopes.join(', ')}`);
      if (authToken) logger.log?.('[server] auth: shared token REQUIRED (?token=…)');
      else logger.log?.('[server] auth: open (set AUTH_TOKEN to lock down)');
      resolve({
        port: actualPort,
        host,
        wsPath: WS_PATH,
        store,
        wss,
        httpServer,
        snapshotPath,
        metrics,
        close: async () => {
          clearInterval(heartbeat);
          if (ttlTimer) clearInterval(ttlTimer);
          clearInterval(rateSweepTimer);
          store.save(); // final snapshot on the way down
          for (const ws of wss.clients) {
            try {
              ws.close(1001, 'server shutting down');
            } catch {
              try { ws.terminate(); } catch { /* ignore */ }
            }
          }
          await new Promise((r) => wss.close(r));
          try {
            httpServer.closeAllConnections?.();
          } catch {
            /* ignore */
          }
          await new Promise((r) => httpServer.close(r));
        },
      });
    });
  });
}

// ── run directly: `node src/server.js` ────────────────────────────────────
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const handle = await startServer();
  console.log(`[server] test bench → http://localhost:${handle.port}/  (open on two phones/tabs)`);
  console.log(`[server] stats → http://localhost:${handle.port}/stats`);

  // Last line of defense: snapshot to disk, then exit non-zero. A supervisor
  // (pm2/systemd/nssm) restarts us; the snapshot means zero lost claims.
  const fatal = (kind) => (err) => {
    console.error(`[fatal] ${kind}:`, err?.stack ?? err);
    handle
      .close()
      .catch(() => {})
      .finally(() => process.exit(1));
  };
  process.on('uncaughtException', fatal('uncaughtException'));
  process.on('unhandledRejection', fatal('unhandledRejection'));

  const shutdown = (signal) => {
    console.log(`\n[server] ${signal} received — draining, saving snapshot, shutting down…`);
    handle
      .close()
      .then(() => process.exit(0))
      .catch(() => process.exit(1));
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}
