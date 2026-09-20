// server/app.js — the identity HTTP surface for Interlock.
//
// Endpoints
//   GET  /api/health                       liveness + provider state
//   GET  /api/auth/providers               which buttons the UI should render
//   GET  /api/auth/:provider/start         → 302 to Google / GitHub (PKCE + state)
//   GET  /api/auth/:provider/callback      code → token → profile → session → 302
//   GET  /api/auth/me                      current session, 401 when signed out
//   POST /api/auth/logout                  clear the session cookie
//
// The browser never sees a provider access token: the code exchange happens
// here, server-side, and the client only ever receives an HttpOnly session
// cookie plus the public profile of the account that signed in.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import { loadConfig, resolveSessionSecret } from './config.js';
import { createLogger } from './logger.js';
import { DIST_DIR } from './paths.js';
import { UserStore } from './users.js';
import { createSessionCodec, serializeCookie, clearCookie, parseCookies } from './session.js';
import { PROVIDERS, ProviderError, describeProviders, getProvider, maskToken } from './providers.js';
import {
  buildAuthorizeUrl,
  buildRedirectUri,
  createPkcePair,
  createStateValue,
  exchangeCodeForToken,
  fetchProfile,
} from './oauth.js';

/**
 * Only same-origin, path-absolute return targets are allowed, so a crafted
 * `?returnTo=https://evil.example` can never turn our callback into an open
 * redirect. Anything unexpected degrades to the app root.
 */
export function safeReturnTo(value, fallback = '/') {
  if (typeof value !== 'string' || value.length > 512) return fallback;
  if (!value.startsWith('/') || value.startsWith('//')) return fallback;
  if (!/^\/[A-Za-z0-9\-._~!$&'()*+,;=:@%/?#[\]]*$/.test(value)) return fallback;
  return value;
}

/** Fixed-window per-IP limiter — the auth endpoints are the only ones exposed. */
export function createFixedWindowLimiter({ max, windowMs, clock = Date.now } = {}) {
  const hits = new Map();
  return {
    check(key, now = clock()) {
      const entry = hits.get(key);
      if (!entry || entry.resetAt <= now) {
        hits.set(key, { count: 1, resetAt: now + windowMs });
        return { allowed: true, remaining: Math.max(0, max - 1) };
      }
      entry.count += 1;
      if (entry.count > max) return { allowed: false, remaining: 0, retryAfterMs: entry.resetAt - now };
      return { allowed: true, remaining: Math.max(0, max - entry.count) };
    },
    sweep(now = clock()) {
      for (const [key, entry] of hits) if (entry.resetAt <= now) hits.delete(key);
    },
    size: () => hits.size,
  };
}

/** The session payload is public data — still, keep the wire shape explicit. */
const publicUser = (user) => ({
  id: user.id,
  provider: user.provider,
  providerLabel: user.providerLabel,
  name: user.name,
  username: user.username,
  email: user.email,
  emailVerified: user.emailVerified,
  avatarUrl: user.avatarUrl,
  createdAt: user.createdAt,
  lastLoginAt: user.lastLoginAt,
  loginCount: user.loginCount,
});

export function createApp(options = {}) {
  const config = { ...loadConfig(), ...(options.config ?? {}) };
  const logger = options.logger ?? createLogger({ level: config.logLevel, json: config.logJson });
  const env = options.env ?? process.env;
  const fetchImpl = options.fetchImpl ?? fetch;
  const providers = options.providers ?? PROVIDERS;
  const users = options.users ?? new UserStore({ filePath: config.usersFile, logger });

  const sessionSecret = options.sessionSecret ?? resolveSessionSecret({
    logger,
    production: config.production,
    filePath: config.sessionSecretFile,
  });
  const sessionCodec = options.sessionCodec ??
    createSessionCodec({ secret: sessionSecret, ttlMs: config.sessionTtlMs });
  // A separate signing context for the OAuth round-trip, so a state token can
  // never be replayed as a session token.
  const stateCodec = createSessionCodec({
    secret: `${sessionSecret}:oauth-state`,
    ttlMs: config.stateTtlMs,
    issuer: 'interlock-oauth-state',
  });

  const limiter = createFixedWindowLimiter({ max: config.rateMax, windowMs: config.rateWindowMs });
  setInterval(() => limiter.sweep(), Math.max(30_000, config.rateWindowMs)).unref?.();

  const app = express();
  app.disable('x-powered-by');
  if (config.trustProxy) app.set('trust proxy', config.trustProxy);
  app.use(express.json({ limit: '16kb' }));

  // Baseline browser hardening for a cookie-authenticated surface.
  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('X-Frame-Options', 'DENY');
    next();
  });

  const cookieOptions = () => ({ path: '/', secure: config.cookieSecure });

  const rateLimited = (req, res, next) => {
    const key = req.ip ?? req.socket?.remoteAddress ?? 'unknown';
    const verdict = limiter.check(key);
    if (!verdict.allowed) {
      logger.warn(`[auth] rate limit hit for ${key}`);
      res.setHeader('Retry-After', String(Math.ceil((verdict.retryAfterMs ?? 1000) / 1000)));
      return res.status(429).json({ ok: false, error: 'rate_limited' });
    }
    return next();
  };

  const issueSession = (res, user, { returnTo = '/' } = {}) => {
    const { token } = sessionCodec.issue({
      sub: user.id,
      sid: crypto.randomUUID(),
      provider: user.provider,
    });
    res.append('Set-Cookie', serializeCookie(config.sessionCookie, token, {
      ...cookieOptions(),
      maxAgeMs: config.sessionTtlMs,
    }));
    logger.info(`[auth] session issued: ${user.id} via ${user.provider}`);
    // Hand the browser back to the SPA — this ends the OAuth round-trip.
    return redirectToClient(res, {
      status: 'success',
      provider: user.provider,
      returnTo,
    });
  };

  const redirectToClient = (res, { status, error, provider, returnTo = '/' } = {}) => {
    const url = new URL(`${config.clientUrl}${safeReturnTo(returnTo)}`);
    if (status) url.searchParams.set('auth', status);
    if (error) url.searchParams.set('auth_error', error);
    if (provider) url.searchParams.set('auth_provider', provider);
    return res.redirect(302, url.toString());
  };

  const readSession = (req) => {
    const token = parseCookies(req.headers.cookie)[config.sessionCookie];
    return token ? sessionCodec.read(token) : null;
  };

  /** Validate and burn the one-time state cookie that guards the callback. */
  const consumePendingState = (req, res, providerId) => {
    const pending = stateCodec.read(parseCookies(req.headers.cookie)[config.stateCookie]);
    res.append('Set-Cookie', clearCookie(config.stateCookie, cookieOptions())); // single use
    const queryState = typeof req.query.state === 'string' ? req.query.state : null;
    if (!pending || pending.provider !== providerId || !queryState || pending.state !== queryState) {
      return { error: 'state_mismatch' };
    }
    return { pending };
  };

  const api = express.Router();

  // ── discovery + session ──────────────────────────────────────────────────
  api.get('/health', (req, res) => {
    const providerInfo = describeProviders({ env, providers });
    res.json({
      ok: true,
      env: config.env,
      uptime_s: Math.round(process.uptime()),
      identities: users.count(),
      providers: providerInfo.map(({ id, configured }) => ({ id, configured })),
    });
  });

  api.get('/auth/providers', (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.json({
      ok: true,
      providers: describeProviders({ env, providers }),
    });
  });

  api.get('/auth/me', (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    const session = readSession(req);
    if (!session) return res.status(401).json({ ok: false, error: 'no_session' });
    const user = users.get(session.sub);
    if (!user) {
      // The directory no longer knows this subject (fresh .data) — drop the cookie.
      res.append('Set-Cookie', clearCookie(config.sessionCookie, cookieOptions()));
      return res.status(401).json({ ok: false, error: 'unknown_identity' });
    }
    return res.json({
      ok: true,
      user: publicUser(user),
      session: { id: session.sid, provider: session.provider, issuedAt: session.iat, expiresAt: session.exp },
    });
  });

  api.post('/auth/logout', (req, res) => {
    if (readSession(req)) logger.info('[auth] session cleared on request');
    res.append('Set-Cookie', clearCookie(config.sessionCookie, cookieOptions()));
    return res.json({ ok: true });
  });

  // ── OAuth round-trips ────────────────────────────────────────────────────

  const unknownProvider = (res, id) =>
    res.status(404).json({ ok: false, error: 'unknown_provider', provider: id });

  /** Step 1: bounce the browser to the provider with a fresh state + PKCE pair. */
  api.get('/auth/:provider/start', rateLimited, (req, res) => {
    const entry = getProvider(req.params.provider, { env, providers });
    if (!entry) return unknownProvider(res, req.params.provider);
    const { provider, credentials } = entry;

    const returnTo = safeReturnTo(req.query.returnTo, '/');
    const { verifier, challenge } = createPkcePair();
    const state = createStateValue();

    // verifier + returnTo must survive the provider round-trip without being
    // readable from the URL, so they travel in a short-lived signed cookie.
    const { token: stateToken } = stateCodec.issue({ provider: provider.id, state, verifier, returnTo });
    res.append('Set-Cookie', serializeCookie(config.stateCookie, stateToken, {
      ...cookieOptions(),
      maxAgeMs: config.stateTtlMs,
    }));

    if (!credentials.configured) {
      // Fail closed: no credentials means this provider cannot complete a
      // sign-in, and the operator is told exactly which variables are missing.
      logger.error(
        `[auth] ${provider.id} is not configured — set ${provider.clientIdEnv} and ${provider.clientSecretEnv}`,
      );
      return redirectToClient(res, { error: `${provider.id}_not_configured`, provider: provider.id, returnTo });
    }

    const authorizeUrl = buildAuthorizeUrl({
      provider,
      credentials,
      redirectUri: buildRedirectUri(provider.id, config.publicUrl),
      state,
      codeChallenge: challenge,
    });
    logger.info(`[auth] → ${provider.id} authorize (returnTo=${returnTo})`);
    return res.redirect(302, authorizeUrl);
  });

  /** Any callback failure ends up back in the SPA with a stable error code. */
  const handleCallbackFailure = (res, err, provider, returnTo) => {
    if (err instanceof ProviderError) {
      logger.error(`[auth] ${provider.id} ${err.code}: ${err.message}`);
      return redirectToClient(res, {
        error: err.code === 'network' ? 'provider_unreachable' : 'provider_error',
        provider: provider.id,
        returnTo,
      });
    }
    logger.error(`[auth] unexpected failure in ${provider.id} callback: ${err?.stack ?? err}`);
    return redirectToClient(res, { error: 'server_error', provider: provider.id, returnTo });
  };

  /** Step 2: verify state, exchange the code, upsert the identity, mint a session. */
  api.get('/auth/:provider/callback', rateLimited, async (req, res) => {
    const entry = getProvider(req.params.provider, { env, providers });
    if (!entry) return unknownProvider(res, req.params.provider);
    const { provider, credentials } = entry;

    const { pending, error } = consumePendingState(req, res, provider.id);
    if (!pending) {
      logger.warn(`[auth] rejected ${provider.id} callback: ${error}`);
      return redirectToClient(res, { error, provider: provider.id });
    }

    // The user pressed "cancel"/"deny" at the provider.
    if (typeof req.query.error === 'string') {
      logger.warn(`[auth] ${provider.id} denied: ${req.query.error} ${req.query.error_description ?? ''}`.trim());
      return redirectToClient(res, { error: 'provider_denied', provider: provider.id, returnTo: pending.returnTo });
    }

    if (!credentials.configured) {
      return redirectToClient(res, {
        error: `${provider.id}_not_configured`,
        provider: provider.id,
        returnTo: pending.returnTo,
      });
    }

    const code = typeof req.query.code === 'string' ? req.query.code : '';
    if (!code) {
      return redirectToClient(res, { error: 'missing_code', provider: provider.id, returnTo: pending.returnTo });
    }

    try {
      const token = await exchangeCodeForToken({
        provider,
        credentials,
        code,
        redirectUri: buildRedirectUri(provider.id, config.publicUrl),
        codeVerifier: pending.verifier,
        fetchImpl,
        logger,
      });
      const profile = await fetchProfile({ provider, accessToken: token.accessToken, fetchImpl });
      if (!profile.emailVerified) {
        logger.warn(`[auth] ${provider.id} account ${profile.providerId} has an unverified email address`);
      }
      const user = users.upsertFromProfile(profile);
      return issueSession(res, user, { returnTo: pending.returnTo });
    } catch (err) {
      return handleCallbackFailure(res, err, provider, pending.returnTo);
    }
  });

  // Every /api miss is JSON — never the SPA shell.
  api.use((req, res) => res.status(404).json({ ok: false, error: 'not_found', path: req.path }));
  app.use('/api', api);

  // ── single-process deploy shape: serve the built SPA from here too ────────
  if (config.serveStatic && fs.existsSync(DIST_DIR)) {
    app.use(express.static(DIST_DIR, { index: false, maxAge: '1h' }));
    app.get(/^\/(?!api\/).*/, (req, res) =>
      res.sendFile(path.join(DIST_DIR, 'index.html'), { headers: { 'Cache-Control': 'no-store' } }));
    logger.debug?.(`[auth] serving built frontend from ${DIST_DIR}`);
  }

  // eslint-disable-next-line no-unused-vars -- Express identifies error handlers by arity
  app.use((err, req, res, next) => {
    logger.error(`[auth] unhandled error on ${req.method} ${req.originalUrl}: ${err?.stack ?? err}`);
    if (res.headersSent) return;
    res.status(500).json({ ok: false, error: 'server_error' });
  });

  app.locals.config = config;
  app.locals.users = users;
  app.locals.sessionCodec = sessionCodec;
  app.locals.logger = logger;
  return app;
}

