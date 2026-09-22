// api/index.js — the Vercel serverless entry point for the Interlock identity
// service. It builds the exact same Express app the long-running entry
// (server/index.js) serves locally; vercel.json routes /api/* here while the
// static build in dist/ is served from the edge.
//
// Cold-start durability: serverless instances share nothing. When Upstash
// (Redis REST) is configured via env, the user directory and workspaces are
// preloaded once per instance and every mutation is mirrored back, so
// sessions, teams, and invite codes survive cold starts and work across
// instances. Without it the app falls back to the local file-backed stores,
// which is fine for `vercel dev` but does NOT persist across instances.
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const API_DIR = path.dirname(fileURLToPath(import.meta.url));
const APP_ROOT = path.resolve(API_DIR, '..');

// Env parity with server/index.js: read .env.local / .env when they exist
// (local CLI runs). On Vercel the dashboard injects the real values.
import dotenv from 'dotenv';
dotenv.config({ path: [path.join(APP_ROOT, '.env.local'), path.join(APP_ROOT, '.env')], quiet: true });

const { createApp } = await import('../server/app.js');
const { loadConfig, resolveSessionSecret } = await import('../server/config.js');
const { createLogger } = await import('../server/logger.js');
const { UserStore } = await import('../server/users.js');
const { WorkspaceStore } = await import('../server/workspaces.js');
const { PairingStore } = await import('../server/pairing.js');
const { cloudBackendFromEnv } = await import('../server/cloudStore.js');
const { postgresBackendFromEnv } = await import('../server/postgresStore.js');

// One boot per instance; a warm function reuses the app across invocations.
let cachedApp = null;

async function getApp() {
  if (cachedApp) return cachedApp;

  const config = loadConfig();
  const logger = createLogger({ level: config.logLevel, json: config.logJson });

  // Production refuses to boot without SESSION_SECRET — surface that as a
  // clean 503 from every request instead of an unhandled rejection.
  let sessionSecret;
  try {
    sessionSecret = resolveSessionSecret({ logger, production: config.production, filePath: config.sessionSecretFile });
  } catch (err) {
    logger.error(`[auth] cannot start: ${err.message}`);
    cachedApp = (req, res) =>
      res.status(503).json({ ok: false, error: 'server_error', detail: 'identity service not configured — set SESSION_SECRET (see DEPLOY.md)' });
    return cachedApp;
  }

  const options = { config, logger, sessionSecret };

  const cloud = postgresBackendFromEnv(process.env, { logger }) ?? cloudBackendFromEnv(process.env, { logger });
  if (cloud) {
    logger.log(`[auth] durable storage: ${cloud.kind} — preloading users + workspaces + pairings`);
    const [usersSnapshot, workspacesSnapshot, pairingsSnapshot] = await Promise.all([
      cloud.load('users'),
      cloud.load('workspaces'),
      cloud.load('pairings'),
    ]);
    options.users = new UserStore({
      logger,
      encryptionKey: sessionSecret,
      initialSnapshot: usersSnapshot,
      remoteSave: (snapshot) => cloud.save('users', snapshot),
    });
    options.workspaces = new WorkspaceStore({
      logger,
      initialSnapshot: workspacesSnapshot,
      remoteSave: (snapshot) => cloud.save('workspaces', snapshot),
    });
    // Pairing tokens are sealed with the session-secret-derived key, so the
    // snapshot only makes sense on an instance holding the same secret —
    // exactly like the sealed provider tokens inside the user directory.
    options.pairings = new PairingStore({
      logger,
      encryptionKey: sessionSecret,
      initialSnapshot: pairingsSnapshot,
      remoteSave: (snapshot) => cloud.save('pairings', snapshot),
    });
  } else if (config.production) {
    logger.warn(
      '[auth] no durable storage configured — users and workspaces live in this instance only and reset on cold start. ' +
        'Set UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN so team create/join works across instances (see DEPLOY.md).',
    );
  }

  cachedApp = createApp(options);
  return cachedApp;
}

export default async function handler(req, res) {
  try {
    const app = await getApp();
    return app(req, res);
  } catch (err) {
    // A cold-start failure must never become an unhandled rejection.
    console.error('[auth] request bootstrap failed:', err?.stack ?? err);
    if (!res.headersSent) res.status(500).json({ ok: false, error: 'server_error' });
  }
}
