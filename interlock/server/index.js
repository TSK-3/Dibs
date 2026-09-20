// server/index.js — bootstrap for the Interlock identity service.
//
// dotenv has to run before ./config.js reads process.env, and ESM imports are
// hoisted — so the env files are loaded first and the rest is imported lazily.
import path from 'node:path';
import dotenv from 'dotenv';
import { APP_ROOT } from './paths.js';

dotenv.config({
  path: [path.join(APP_ROOT, '.env.local'), path.join(APP_ROOT, '.env')],
  quiet: true,
});

const { createApp } = await import('./app.js');
const { loadConfig } = await import('./config.js');
const { createLogger } = await import('./logger.js');
const { PROVIDERS, credentialsFor } = await import('./providers.js');
const { buildRedirectUri } = await import('./oauth.js');

const config = loadConfig();
const logger = createLogger({ level: config.logLevel, json: config.logJson });

let app;
try {
  app = createApp({ config, logger });
} catch (err) {
  logger.error(`[auth] cannot start: ${err.message}`);
  process.exit(1);
}

const server = app.listen(config.port, config.host, () => {
  const base = `http://localhost:${config.port}`;
  logger.log(`[auth] Interlock identity service → ${base}`);
  logger.log(`[auth] browser app (CLIENT_URL) → ${config.clientUrl}`);
  logger.log(
    `[auth] session cookie: ${config.sessionCookie} (HttpOnly, SameSite=Lax` +
      `${config.cookieSecure ? ', Secure' : ''}, ${config.sessionTtlMs / 3_600_000}h)`,
  );

  // Print the exact strings to paste into the Google / GitHub app settings —
  // getting the redirect URI wrong is the #1 cause of OAuth frustration.
  for (const provider of Object.values(PROVIDERS)) {
    const { configured } = credentialsFor(provider, process.env);
    logger.log(
      `[auth] ${provider.id.padEnd(6)} ${(configured ? 'configured' : 'NOT configured').padEnd(14)}` +
        ` redirect_uri: ${buildRedirectUri(provider.id, config.publicUrl)}`,
    );
  }

  const unconfigured = Object.values(PROVIDERS).filter(
    (provider) => !credentialsFor(provider, process.env).configured,
  );
  if (unconfigured.length) {
    logger.warn(
      `[auth] ${unconfigured.length} provider(s) cannot complete a sign-in yet — ` +
        unconfigured.map((p) => `${p.label}: set ${p.clientIdEnv} and ${p.clientSecretEnv}`).join(' · '),
    );
  }
  logger.log(`[auth] health → ${base}/api/health`);
});

const shutdown = (signal) => {
  logger.log(`[auth] ${signal} received — closing listener`);
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 3_000).unref?.();
};

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
