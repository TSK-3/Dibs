# Interlock — web console + identity service

The Interlock web console (React + Vite + Tailwind) together with the identity
service that signs people in with **Gmail (Google)** or **GitHub** over real
OAuth 2.0.

Two processes, one command:

| Process | Port | What it is |
|---|---|---|
| Web console | `3000` | Vite dev server for the SPA in `src/` |
| Identity service | `8787` | Express app in `server/`: OAuth, sessions, user directory |

The SPA only ever talks to `http://localhost:3000/api/...`; Vite proxies `/api`
to the identity service. Cookies are scoped to the host (not the port), so the
session cookie the callback sets on `localhost:8787` is sent to `localhost:3000`
— no CORS, no third-party-cookie workarounds.

## Quick start

```bash
npm install
npm run dev:full      # identity service + web console together
```

Open **http://localhost:3000**.

Credentials are required — there is no demo or guest sign-in. Until a provider's
`client_id` / `client_secret` are present, its button is disabled in the UI and
`/api/auth/<provider>/start` fails closed with `<provider>_not_configured`. The
identity service logs exactly which variables are missing at boot.

## Wire up real Gmail and GitHub sign-in

1. Copy the template: `cp .env.example .env.local`
2. **Google (Gmail)**: [Google Cloud Console](https://console.cloud.google.com/apis/credentials)
   → *Create credentials* → *OAuth client ID* → *Web application*.
   Authorized redirect URI:
   `http://localhost:8787/api/auth/google/callback`
3. **GitHub**: [Developer settings](https://github.com/settings/developers) →
   *OAuth Apps* → *New OAuth App*.
   Authorization callback URL:
   `http://localhost:8787/api/auth/github/callback`
4. Put the four values in `.env.local`:

```ini
GOOGLE_CLIENT_ID="…"
GOOGLE_CLIENT_SECRET="…"
GITHUB_CLIENT_ID="…"
GITHUB_CLIENT_SECRET="…"
```

5. Restart the service. The boot log prints the exact redirect URI each provider
   expects — if a sign-in fails with `redirect_uri_mismatch`, compare it there.

## How the sign-in works

1. The SPA calls `GET /api/auth/:provider/start?returnTo=…`. The service mints a
   random `state` and a PKCE verifier/challenge, then stores them in a
   short-lived signed `HttpOnly` cookie before redirecting to the provider.
2. The provider authenticates the user and redirects back to
   `GET /api/auth/:provider/callback?code=…&state=…`.
3. The callback verifies and burns the state cookie (single use), exchanges the
   code for an access token **server-side**, and fetches the profile from the
   provider — the browser never sees a provider token.
4. The profile is normalized and upserted into the identity directory with a
   deterministic id (`sha256(provider:providerId)`), so repeat sign-ins reuse the
   same record and only bump `lastLoginAt` / `loginCount`.
5. A signed (`HMAC-SHA256`, `v1.payload.signature`) session token is set as an
   `HttpOnly; SameSite=Lax` cookie and the browser is sent back to the SPA with
   `?auth=success` (or `?auth_error=<code>`).
6. On load the SPA calls `GET /api/auth/me` to hydrate the session;
   `POST /api/auth/logout` clears it.

Failures never leak: the SPA receives a stable error code (`state_mismatch`,
`provider_denied`, `provider_error`, `provider_unreachable`, `missing_code`,
`*_not_configured`, `server_error`) which it maps to human copy.

## API

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/health` | Liveness, provider configuration, identity count |
| `GET` | `/api/auth/providers` | Which buttons the UI may render (`configured`, `setupEnv`) |
| `GET` | `/api/auth/:provider/start` | Begin the OAuth round-trip (302) |
| `GET` | `/api/auth/:provider/callback` | Exchange code, upsert identity, mint session (302) |
| `GET` | `/api/auth/me` | Current session + profile (401 when signed out) |
| `POST` | `/api/auth/logout` | Clear the session cookie |

## Configuration

All optional; [`.env.example`](.env.example) lists everything.

| Variable | Default | Meaning |
|---|---|---|
| `AUTH_PUBLIC_URL` | `http://localhost:8787` | Base URL used to build provider redirect URIs |
| `APP_URL` | `http://localhost:3000` | Where the browser returns after sign-in |
| `SESSION_SECRET` | generated in dev | Session signing key (≥ 32 chars, **required in production**) |
| `SESSION_TTL_MS` | `43200000` | Session lifetime (12 h) |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | — | Gmail sign-in (**required** to enable it) |
| `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` | — | GitHub sign-in (**required** to enable it) |
| `COOKIE_SECURE` | off (on in production) | `Secure` session cookie |
| `TRUST_PROXY` | unset | Set behind a load balancer so rate limiting sees real IPs |
| `AUTH_RATE_MAX` / `AUTH_RATE_WINDOW_MS` | `120` / `300000` | Per-IP budget on the auth endpoints |
| `AUTH_SERVE_STATIC` | on | Serve `dist/` from the identity service too |

State lives in `.data/` (git-ignored): `users.json` (identity directory) and
`session-secret` (generated development key).

## Scripts

| Command | Description |
|---|---|
| `npm run dev:full` | Identity service **and** web console, one terminal |
| `npm run dev` | Web console only (`:3000`) |
| `npm run auth` | Identity service only, watch mode (`:8787`) |
| `npm run build` | Production build of the SPA into `dist/` |
| `npm start` | Identity service; also serves `dist/` when it exists |
| `npm test` | `node --test` suite for the identity service |
| `npm run lint` | `tsc --noEmit` |

## Tests

`npm test` covers the whole contract with the provider APIs stubbed: signed
session round-trips and tamper/expiry rejection, cookie serialization, open
redirect rejection, the rate limiter, the identity directory, profile
normalization for both providers, the complete Google and GitHub round-trips
(including PKCE and the verified-email fallback), forged/replayed state,
provider failures, "cancel" at the provider, and the fail-closed path for a
provider that has no credentials.

## Security notes

- Only `HttpOnly`, `SameSite=Lax` cookies carry sessions; nothing is kept in
  `localStorage`.
- `state` and the PKCE verifier live in a signed, single-use cookie — a callback
  without it is rejected before the provider is ever contacted.
- PKCE (`S256`) is used with Google; GitHub uses the confidential-client flow, so
  `client_secret` never leaves the server.
- `returnTo` accepts same-origin paths only, so the callback cannot be turned
  into an open redirect.
- Production refuses to boot without a strong `SESSION_SECRET` and rate-limits
  the auth endpoints per IP.


