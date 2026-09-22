// server/mcp.js — the MCP endpoint coding agents connect to (Cursor, Claude
// Code, …) and the auth-and-resolve middleware that guards it.
//
// Transport: MCP over HTTP, stateless JSON mode — the agent's config points at
//   wss(s)://<host>/mcp  with  headers: { Authorization: "Bearer <pairing_token>" }
// so the token is the ONLY credential: nothing inside the agent ever logs in.
// Every connection resolves through the pairing store to a {user_id, team_id}
// pair from the same backend user/team store — identity is never an argument.
//
// Tools (PRD §3.5): post_intent / check_intent / complete_intent. Each tool
// call is relayed to the live-interrupt WS backend as an authenticated client
// with the identity resolved from the token, so conflicts still interrupt the
// team exactly as they do for console agents.
import { Router } from 'express';

export const MCP_SERVER_INFO = { name: 'interlock-mcp', version: '1.0.0' };
export const MCP_PROTOCOL_VERSION = '2024-11-05';

/** Parse `Authorization: Bearer <token>` (case-insensitive scheme). */
export function extractBearerToken(header) {
  if (typeof header !== 'string') return null;
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match ? match[1].trim() : null;
}

/**
 * The auth-and-resolve middleware. A request is only allowed through when its
 * Bearer token resolves to a live pairing AND the resolved user still exists
 * in the identity directory AND is still a member of the resolved workspace.
 * On success `req.agentIdentity = { userId, teamId }` — downstream never sees
 * or needs the token again.
 */
export function createPairingGuard({ pairings, users, workspaces, logger = console } = {}) {
  return (req, res, next) => {
    const token = extractBearerToken(req.headers.authorization);
    if (!token) {
      res.setHeader('WWW-Authenticate', 'Bearer realm="interlock-mcp"');
      return res.status(401).json({ ok: false, error: 'invalid_token', detail: 'Missing Bearer pairing token' });
    }
    const resolved = pairings.resolve(token);
    if (!resolved) {
      // Unknown, malformed, or rotated-away token — same answer for all three.
      logger.warn?.(`[mcp] rejected connection: token does not resolve (ip=${req.ip ?? 'unknown'})`);
      res.setHeader('WWW-Authenticate', 'Bearer realm="interlock-mcp"');
      return res.status(401).json({ ok: false, error: 'invalid_token', detail: 'Pairing token is unknown or was regenerated' });
    }
    // Still wired to the live user/team store: a deleted account or a removed
    // workspace membership kills the credential even though the token is intact.
    if (!users.get(resolved.user_id)) {
      logger.warn?.(`[mcp] rejected pairing for unknown user ${resolved.user_id}`);
      return res.status(401).json({ ok: false, error: 'invalid_token', detail: 'Paired user no longer exists' });
    }
    const team = workspaces.get(resolved.team_id);
    if (!team || !workspaces.isMember(team, resolved.user_id)) {
      logger.warn?.(`[mcp] rejected pairing: ${resolved.user_id} is not a member of ${resolved.team_id}`);
      return res.status(401).json({ ok: false, error: 'invalid_token', detail: 'Paired user is no longer a member of this workspace' });
    }
    req.agentIdentity = { userId: resolved.user_id, teamId: resolved.team_id };
    return next();
  };
}

// ── Tool surface (names per PRD §3.5; `scopes` accepts one or many) ────────
const scopesProp = (description) => ({
  anyOf: [{ type: 'string' }, { type: 'array', items: { type: 'string' }, minItems: 1 }],
  description,
});

export const MCP_TOOLS = [
  {
    name: 'post_intent',
    description:
      'Claim one or more module scopes for work you are about to do. Attributed automatically to the paired user — never pass identity. Returns an ack, or an interrupt naming the conflicting holder when a scope is already claimed.',
    inputSchema: {
      type: 'object',
      properties: {
        scopes: scopesProp('Module scope(s) to claim, e.g. "auth" or ["auth", "api"]'),
        summary: { type: 'string', description: 'One-line description of the work' },
        rationale: { type: 'string', description: 'Why this work is happening now' },
      },
      required: ['scopes', 'summary', 'rationale'],
    },
  },
  {
    name: 'check_intent',
    description: 'Check who holds module scope(s) WITHOUT claiming them. Read-only.',
    inputSchema: {
      type: 'object',
      properties: { scopes: scopesProp('Module scope(s) to check') },
      required: ['scopes'],
    },
  },
  {
    name: 'complete_intent',
    description: 'Release previously claimed module scope(s) when the work is done.',
    inputSchema: {
      type: 'object',
      properties: { scopes: scopesProp('Module scope(s) to release') },
      required: ['scopes'],
    },
  },
];

/** Accept a string or string[] and normalize to a trimmed, de-duplicated list. */
export function normalizeScopes(raw) {
  const list = Array.isArray(raw) ? raw : [raw];
  const out = [];
  for (const item of list) {
    if (typeof item !== 'string') continue;
    const trimmed = item.trim().toLowerCase();
    if (trimmed && !out.includes(trimmed)) out.push(trimmed);
  }
  return out;
}

const jsonRpcError = (id, code, message) => ({ jsonrpc: '2.0', id, error: { code, message } });
const toolText = (payload, isError = false) => ({
  content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }],
  ...(isError ? { isError: true } : {}),
});

/**
 * Relay one backend message over a short-lived WebSocket client connection to
 * the live-interrupt backend, authenticated as the resolved identity via the
 * same ?user_id=&team_id= contract every other client uses. One connection per
 * tool call keeps the MCP surface stateless — no shared mutable session.
 */
async function relayToBackend({ backendUrl, identity, message, responseTypes, timeoutMs, log }) {
  const { default: WebSocket } = await import('ws'); // resolved lazily — the identity service itself never holds WS server state
  const url = new URL(backendUrl);
  url.searchParams.set('user_id', identity.userId);
  url.searchParams.set('team_id', identity.teamId);
  url.searchParams.set('client', 'mcp-agent');
  return new Promise((resolve, reject) => {
    const sock = new WebSocket(url.toString());
    const timer = setTimeout(() => {
      try { sock.terminate(); } catch { /* ignore */ }
      reject(new Error(`no response from the live backend within ${timeoutMs}ms`));
    }, timeoutMs);
    sock.on('open', () => sock.send(JSON.stringify({ ...message, user_id: identity.userId })));
    sock.on('message', (data) => {
      let msg;
      try { msg = JSON.parse(data.toString()); } catch { return; }
      if (responseTypes.includes(msg.type)) {
        clearTimeout(timer);
        try { sock.close(); } catch { /* ignore */ }
        resolve(msg);
      }
    });
    sock.on('error', (err) => {
      clearTimeout(timer);
      reject(new Error(`live backend unreachable at ${backendUrl}: ${err.message}`));
    });
    sock.on('close', () => {
      clearTimeout(timer);
      reject(new Error('live backend closed the connection before answering'));
    });
    log?.debug?.(`[mcp] relay ${message.type} for ${identity.userId}@${identity.teamId}`);
  });
}

/** Default backend relay (overridable in tests). */
export function createBackendRelay({ backendUrl, timeoutMs = 5000, logger = console } = {}) {
  return async ({ identity, message, responseTypes }) =>
    relayToBackend({ backendUrl, identity, message, responseTypes, timeoutMs, log: logger });
}

/** The JSON-RPC method dispatcher for one authenticated request. */
export function createMcpDispatcher({ relay, identity, logger = console }) {
  const callTool = async (params) => {
    const args = params?.arguments ?? {};
    const scopes = normalizeScopes(args.scope ?? args.scopes);
    if (!scopes.length) throw new Error('at least one scope is required');
    if (params?.name === 'post_intent') {
      const results = [];
      for (const scope of scopes) {
        results.push(
          await relay({
            identity,
            message: {
              type: 'post_intent',
              user_id: identity.userId, // attribution is set HERE, from the token — never by the agent
              scope,
              summary: String(args.summary ?? '').slice(0, 512),
              rationale: String(args.rationale ?? '').slice(0, 512),
              timestamp: Date.now(),
            },
            responseTypes: ['ack', 'interrupt', 'error'],
          }),
        );
      }
      return toolText(scopes.length === 1 ? results[0] : { results });
    }
    if (params?.name === 'check_intent') {
      const results = [];
      for (const scope of scopes) {
        results.push(
          await relay({
            identity,
            message: { type: 'check_intent', user_id: identity.userId, scope },
            responseTypes: ['scope_status', 'error'],
          }),
        );
      }
      return toolText(scopes.length === 1 ? results[0] : { results });
    }
    if (params?.name === 'complete_intent') {
      const results = [];
      for (const scope of scopes) {
        results.push(
          await relay({
            identity,
            message: { type: 'complete_intent', user_id: identity.userId, scope },
            responseTypes: ['complete_ack', 'error'],
          }),
        );
      }
      return toolText(scopes.length === 1 ? results[0] : { results });
    }
    return toolText({ error: `Unknown tool "${params?.name}"` }, true);
  };

  return async function dispatch(body) {
    const { id, method, params } = body ?? {};
    switch (method) {
      case 'initialize':
        return {
          jsonrpc: '2.0',
          id,
          result: {
            protocolVersion: typeof params?.protocolVersion === 'string' ? params.protocolVersion : MCP_PROTOCOL_VERSION,
            capabilities: { tools: {} },
            serverInfo: MCP_SERVER_INFO,
          },
        };
      case 'ping':
        return { jsonrpc: '2.0', id, result: {} };
      case 'tools/list':
        return { jsonrpc: '2.0', id, result: { tools: MCP_TOOLS } };
      case 'tools/call': {
        try {
          return { jsonrpc: '2.0', id, result: await callTool(params ?? {}) };
        } catch (err) {
          logger.warn?.(`[mcp] tools/call failed for ${identity.userId}@${identity.teamId}: ${err?.message ?? err}`);
          return { jsonrpc: '2.0', id, result: toolText({ error: `MCP error: ${err?.message ?? err}` }, true) };
        }
      }
      default:
        return typeof id === 'number' || typeof id === 'string'
          ? jsonRpcError(id, -32601, `Method not found: ${method}`)
          : null; // unknown notification — nothing to say
    }
  };
}

/** Router mounted at /mcp by app.js. */
export function createMcpRouter({ guard, relay, logger = console } = {}) {
  const router = Router();
  router.use((req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
  });

  router.post('/', guard, async (req, res) => {
    const body = req.body;
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return res.status(400).json(jsonRpcError(null, -32600, 'Expected a single JSON-RPC 2.0 request object'));
    }
    if (body.jsonrpc !== '2.0' || typeof body.method !== 'string') {
      return res.status(400).json(jsonRpcError(body?.id ?? null, -32600, 'Invalid JSON-RPC 2.0 request'));
    }
    // Notifications (no id) get 202 Accepted with no body, per the spec.
    if (body.id === undefined && body.method !== 'initialize') {
      return res.status(202).json({ jsonrpc: '2.0', result: null });
    }
    const dispatch = createMcpDispatcher({ relay, identity: req.agentIdentity, logger });
    const response = await dispatch(body);
    if (!response) return res.status(202).json({ jsonrpc: '2.0', result: null });
    return res.json(response);
  });

  // Stateless JSON mode: there is no SSE stream to hold open, and no session
  // state server-side (every call re-presents the token).
  const notAllowed = (req, res) => {
    res.setHeader('Allow', 'POST');
    return res
      .status(405)
      .json({ ok: false, error: 'method_not_allowed', detail: 'POST JSON-RPC 2.0 requests with a Bearer pairing token' });
  };
  router.get('/', notAllowed);
  router.all('/:anything', notAllowed);
  return router;
}

