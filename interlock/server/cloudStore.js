// server/cloudStore.js — optional durable storage for the identity service.
//
// Locally, the stores (users.js, workspaces.js) snapshot to .data/*.json and
// that is enough for one process. On a serverless host like Vercel there is no
// persistent disk and every cold instance starts empty — which would silently
// log everyone out and drop every team. This module adapts the exact same JSON
// snapshot format to Upstash Redis over its REST API (the same backend Vercel
// KV is built on) using plain fetch, so no dependency is added.
//
// Activation (optional — unset keeps the local file-backed behavior):
//   UPSTASH_REDIS_REST_URL    e.g. https://your-db.upstash.io
//   UPSTASH_REDIS_REST_TOKEN  the REST token shown in the Upstash console
//
// Consistency model: every mutating request writes the full snapshot of the
// writing instance (last write wins) and every cold start reads it back. That
// keeps the existing synchronous store code untouched and is exactly right for
// a demo-scale deployment; DEPLOY.md documents the caveats.

export const CLOUD_KEY_PREFIX = 'interlock:v1:';

/**
 * Returns a backend when both Upstash REST variables are configured, or null
 * when durable storage is off (local file mode). Partial configuration is
 * treated as a mistake, not a silent fallback.
 */
export function cloudBackendFromEnv(env = process.env, { logger = console, fetchImpl } = {}) {
  const url = typeof env.UPSTASH_REDIS_REST_URL === 'string' ? env.UPSTASH_REDIS_REST_URL.trim() : '';
  const token = typeof env.UPSTASH_REDIS_REST_TOKEN === 'string' ? env.UPSTASH_REDIS_REST_TOKEN.trim() : '';
  if (!url && !token) return null;
  if (!url || !token) {
    logger.warn?.('[cloud-store] UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN must be set together — durable storage disabled');
    return null;
  }
  return createUpstashRestBackend({ url: url.replace(/\/+$/, ''), token, logger, fetchImpl });
}

/** Upstash REST adapter: one POST per command, body is a command array. */
export function createUpstashRestBackend({ url, token, logger = console, fetchImpl = fetch } = {}) {
  if (!/^https:\/\/[\w.-]+/.test(url)) throw new Error('the Upstash REST URL must be an https:// URL');
  if (!token) throw new Error('the Upstash REST token is required');

  const keyFor = (name) => `${CLOUD_KEY_PREFIX}${name}`;

  const command = async (args) => {
    let response;
    try {
      response = await fetchImpl(url, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(args),
      });
    } catch (err) {
      throw new Error(`upstash unreachable: ${err?.message ?? err}`);
    }
    if (!response.ok) throw new Error(`upstash HTTP ${response.status}`);
    let body = null;
    try {
      body = await response.json();
    } catch {
      body = null;
    }
    if (!body || body.error) throw new Error(`upstash error: ${body?.error ?? 'empty response'}`);
    return body.result;
  };

  return {
    kind: 'upstash-rest',

    /** The stored snapshot, or null — a failed read degrades to empty, never a crash. */
    async load(name) {
      try {
        const raw = await command(['GET', keyFor(name)]);
        if (typeof raw !== 'string' || !raw) return null;
        try {
          return JSON.parse(raw);
        } catch (err) {
          logger.warn?.(`[cloud-store] ${name} snapshot unreadable (${err.message}) — starting empty`);
          return null;
        }
      } catch (err) {
        logger.warn?.(`[cloud-store] load(${name}) failed: ${err.message} — starting empty`);
        return null;
      }
    },

    /** Best-effort write; failures are logged and the in-memory store stays authoritative. */
    async save(name, snapshot) {
      try {
        await command(['SET', keyFor(name), JSON.stringify(snapshot)]);
        return true;
      } catch (err) {
        logger.error?.(`[cloud-store] save(${name}) failed: ${err.message}`);
        return false;
      }
    },
  };
}
