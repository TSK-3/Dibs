// src/protocol.js — message contract enforcement + per-type handlers (PRD §3.4).
// The four core message shapes are copied verbatim from prd-karthik.md.
// Additive extensions (no core field changes, documented in README):
//   hello / check_intent → scope_status / request_state → state /
//   complete_ack / error / claim_expired — check_intent exists so the §3.5
//   MCP tools can query a scope WITHOUT claiming it.
import { findConflicts, interruptForHolder, interruptForPoster } from './matcher.js';
import { ID_PATTERN, MAX_FIELD_LENGTH } from './config.js';

const FIELD_SPECS = {
  post_intent: { user_id: 'string', scope: 'string', summary: 'string', rationale: 'string', timestamp: 'number' },
  complete_intent: { user_id: 'string', scope: 'string' },
  check_intent: { user_id: 'string', scope: 'string' },
  hello: { user_id: 'string', team_id: 'string' },
};

function sendErr(session, code, message, extra = {}) {
  session.metrics?.inc('protocol_errors_total', 1, { code });
  session.send({ type: 'error', code, message, ...extra });
}

/** Scopes are normalized (trim + lowercase) so "Auth " and "auth" match. */
function normalizeScope(raw) {
  return typeof raw === 'string' ? raw.trim().toLowerCase() : raw;
}

function validateFields(msg, spec) {
  const missing = [];
  const wrongType = [];
  for (const [field, kind] of Object.entries(spec)) {
    const v = msg[field];
    if (v === undefined || v === null) missing.push(field);
    else if (kind === 'number' ? typeof v !== 'number' || !Number.isFinite(v) : typeof v !== kind) {
      wrongType.push(field);
    }
  }
  if (missing.length || wrongType.length) {
    const detail = [
      missing.length ? `missing: ${missing.join(', ')}` : null,
      wrongType.length ? `wrong type: ${wrongType.join(', ')}` : null,
    ]
      .filter(Boolean)
      .join(' — ');
    return { ok: false, detail };
  }
  return { ok: true };
}

function checkIdentity(session, msg) {
  if (msg.user_id !== session.userId) {
    sendErr(
      session,
      'identity_mismatch',
      `user_id "${msg.user_id}" does not match this connection's identity "${session.userId}"`,
    );
    return false;
  }
  return true;
}

function checkScope(session, msg, scopeSet) {
  if (!scopeSet.has(msg.scope)) {
    sendErr(
      session,
      'unknown_scope',
      `Scope "${msg.scope}" is not in the closed enum. Allowed: ${[...scopeSet].join(', ')}`,
      { scope: msg.scope, allowed: [...scopeSet] },
    );
    return false;
  }
  return true;
}

/** Identities become object keys, log lines, and snapshot JSON — keep them tame. */
function checkIdentityFormat(userId, session) {
  if (!ID_PATTERN.test(userId)) {
    return {
      ok: false,
      message: `Invalid user_id "${String(userId).slice(0, 32)}" — use 1-64 chars: letters, digits, . _ - (must start alphanumeric)`,
    };
  }
  return { ok: true };
}

// Welcome/sync payload — sent on connect and on request_state. Lets a
// reconnecting client rebuild its UI from server truth (PRD §3.1 reconnects).
export function statePayload(store, session) {
  const yours = store.getUserClaims(session.teamId, session.userId);
  const team = store.getTeamClaims(session.teamId);
  return {
    type: 'state',
    team_id: session.teamId,
    user_id: session.userId,
    your_claims: yours.map(({ scope, claim }) => ({
      scope,
      summary: claim.summary,
      rationale: claim.rationale,
      timestamp: claim.timestamp,
    })),
    team_claims: team.map(({ scope, user_id, claim }) => ({
      scope,
      user_id,
      summary: claim.summary,
      rationale: claim.rationale,
      timestamp: claim.timestamp,
    })),
  };
}

export function handleMessage(session, raw, deps) {
  const { store, scopeSet, register, logger } = deps;

  let msg;
  try {
    msg = JSON.parse(raw);
  } catch {
    return sendErr(session, 'bad_json', 'Payload is not valid JSON');
  }
  if (!msg || typeof msg !== 'object' || Array.isArray(msg) || typeof msg.type !== 'string') {
    return sendErr(session, 'bad_request', 'Message must be a JSON object with a string "type" field');
  }

  // hello — late identity for clients that can't set query params.
  if (msg.type === 'hello') {
    if (session.identified) {
      return sendErr(session, 'already_identified', 'Connection already identified via query params or a previous hello');
    }
    const v = validateFields(msg, FIELD_SPECS.hello);
    if (!v.ok) return sendErr(session, 'bad_request', `Invalid hello — ${v.detail}`);
    const idCheck = checkIdentityFormat(msg.user_id, session);
    if (!idCheck.ok) return sendErr(session, 'bad_request', idCheck.message);
    session.userId = msg.user_id;
    session.teamId = msg.team_id;
    session.identified = true;
    register(session);
    logger.log?.(`[ws] ${session.userId}@${session.teamId} connected via hello`);
    return session.send(statePayload(store, session));
  }

  if (!session.identified) {
    return sendErr(
      session,
      'not_identified',
      'Identify first: connect with ?user_id=&team_id= or send {"type":"hello","user_id":"...","team_id":"..."}',
    );
  }

  switch (msg.type) {
    case 'post_intent':
      return handlePostIntent(session, msg, deps);
    case 'complete_intent':
      return handleCompleteIntent(session, msg, deps);
    case 'check_intent':
      return handleCheckIntent(session, msg, deps);
    case 'request_state':
      return session.send(statePayload(store, session));
    default:
      return sendErr(session, 'bad_request', `Unknown message type "${msg.type}"`);
  }
}

function handlePostIntent(session, msg, deps) {
  const { store, sendToUser, scopeSet, now } = deps;
  const v = validateFields(msg, FIELD_SPECS.post_intent);
  if (!v.ok) return sendErr(session, 'bad_request', `Invalid post_intent — ${v.detail}`);
  if (!checkIdentity(session, msg)) return;
  const scope = normalizeScope(msg.scope);
  if (!checkScope(session, { ...msg, scope }, scopeSet)) return;

  const summary = String(msg.summary);
  const rationale = String(msg.rationale);
  if (summary.length > MAX_FIELD_LENGTH || rationale.length > MAX_FIELD_LENGTH) {
    return sendErr(
      session,
      'field_too_long',
      `summary and rationale must each be ≤ ${MAX_FIELD_LENGTH} characters`,
      { max_length: MAX_FIELD_LENGTH },
    );
  }

  const { userId, teamId } = session;
  const claim = {
    scope,
    user_id: userId,
    summary,
    rationale,
    timestamp: msg.timestamp,
    received_at: now(),
  };

  const conflicts = findConflicts(store, teamId, userId, scope);
  store.setClaim(teamId, userId, claim); // poster's claim recorded either way
  session.metrics?.inc('intents_posted_total');
  if (conflicts.length > 0) session.metrics?.inc('conflicts_detected_total');

  if (conflicts.length === 0) {
    return session.send({ type: 'ack', status: 'claimed', scope });
  }

  // Conflict (PRD §3.3): BOTH sides get an interrupt, same schema.
  let interruptsSent = 0;
  for (const holder of conflicts) {
    if (sendToUser(teamId, holder.user_id, interruptForHolder({ posterId: userId, posterSummary: claim.summary, scope }))) {
      interruptsSent++;
    }
  }
  session.metrics?.inc('interrupts_sent_total', interruptsSent);
  for (const holder of conflicts) {
    session.send(interruptForPoster({ holderId: holder.user_id, holderSummary: holder.claim.summary, scope }));
  }
}

function handleCompleteIntent(session, msg, deps) {
  const { store, scopeSet } = deps;
  const v = validateFields(msg, FIELD_SPECS.complete_intent);
  if (!v.ok) return sendErr(session, 'bad_request', `Invalid complete_intent — ${v.detail}`);
  if (!checkIdentity(session, msg)) return;
  const scope = normalizeScope(msg.scope);
  if (!checkScope(session, { ...msg, scope }, scopeSet)) return;
  const removed = store.removeClaim(session.teamId, msg.user_id, scope);
  return session.send({ type: 'complete_ack', status: removed ? 'released' : 'not_found', scope });
}

function handleCheckIntent(session, msg, deps) {
  const { store, scopeSet } = deps;
  const v = validateFields(msg, FIELD_SPECS.check_intent);
  if (!v.ok) return sendErr(session, 'bad_request', `Invalid check_intent — ${v.detail}`);
  if (!checkIdentity(session, msg)) return;
  const scope = normalizeScope(msg.scope);
  if (!checkScope(session, { ...msg, scope }, scopeSet)) return;
  const others = store.getHolders(session.teamId, scope).filter((h) => h.user_id !== session.userId);
  return session.send({
    type: 'scope_status',
    scope,
    available: others.length === 0,
    claimed_by_others: others.map((h) => h.user_id),
    holders: others.map(({ user_id, claim }) => ({
      user_id,
      summary: claim.summary,
      rationale: claim.rationale,
      timestamp: claim.timestamp,
    })),
  });
}
