# Deploying Interlock to Vercel (custom domain)

One Vercel project runs the whole console: the built SPA is served from the
edge, and the identity service (Express, `server/`) runs as a serverless
function behind the same origin — `/api/*` behaves exactly like the Vite dev
proxy does locally, cookies included.

Team workspaces (create / join by 6-digit code) need one extra piece on Vercel:
**durable storage** (Upstash Redis, free tier). Serverless instances share
nothing and the filesystem is ephemeral — without it, a cold start would sign
everyone out (`unknown_identity`) and lose every team.

## 0. Push and verify locally

```bash
git add -A && git commit -m "Prepare Vercel deployment" && git push origin webintegration
cd interlock
npm test          # all green — includes the cross-instance team create/join test
npm run lint      # tsc --noEmit
npm run build     # vite build → dist/
```

## 1. Create the Vercel project

1. [vercel.com](https://vercel.com) → **Add New… → Project** → import `TSK-3/Dibs`.
2. **Root Directory: `interlock`** — the app lives in the subdirectory; the repo
   root is the WebSocket backend, which is *not* part of this deployment.
3. Framework preset: **Vite** (build `vite build`, output `dist/` — already
   pinned in [`vercel.json`](vercel.json), which also routes `/api/*` to the
   function and everything else to the SPA).

## 2. Environment variables

Project → Settings → Environment Variables (scope: **Production**):

| Variable | Value | Why |
|---|---|---|
| `SESSION_SECRET` | `openssl rand -hex 32` | Signs sessions and seals provider tokens. **Required in production** — the service refuses to boot without it. |
| `AUTH_PUBLIC_URL` | `https://your-domain.com` | Builds the OAuth `redirect_uri` the providers must have registered (step 4). |
| `APP_URL` | `https://your-domain.com` | Where the browser returns after sign-in. |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | from Google Cloud Console | Gmail sign-in. |
| `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` | from GitHub OAuth App | GitHub sign-in. |
| `TRUST_PROXY` | `1` | The service sits behind Vercel's edge, so rate limiting sees real client IPs. |
| `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` | from Upstash (step 3) | Durable storage for users + teams. |
| `VITE_LIVE_WS_URL` *(optional)* | `wss://…` | Live mesh hosted elsewhere (step 5). |

Notes:

- Vercel sets `NODE_ENV=production` automatically → session cookies get
  `Secure` without any extra configuration.
- On Vercel the SPA is served from the CDN, so the API function's built-in
  static serving is simply skipped.

## 3. Durable storage for teams (Upstash, free tier)

Either add the **Upstash integration** from the Vercel dashboard (Storage →
Marketplace → Upstash Redis — it fills both env vars in automatically), or:

1. [console.upstash.com](https://console.upstash.com) → **Create database**
   (Regional, free tier is fine).
2. Copy the **REST API** URL and token into the two `UPSTASH_REDIS_REST_*`
   variables.
3. Redeploy. The function log should print:
   `[auth] durable storage: upstash-rest — preloading users + workspaces`.
   Without it you'll see the "no durable storage" warning instead.

Consistency note (fine at demo scale, documented on purpose): every mutation
writes the writing instance's full snapshot; simultaneous writes from two
instances resolve last-write-wins. For guaranteed correctness at larger scale,
swap the stores for a real database.

## 4. OAuth redirect URIs for the custom domain

Register **exactly** these with the providers:

- **Google** — [Cloud Console → Credentials](https://console.cloud.google.com/apis/credentials) → your OAuth client → *Authorized redirect URIs*:
  `https://your-domain.com/api/auth/google/callback`
- **GitHub** — [Developer settings → OAuth Apps](https://github.com/settings/developers) → *Authorization callback URL*:
  `https://your-domain.com/api/auth/github/callback`
- Also add your domain under Google's *OAuth consent screen → Authorized domains*.
- Keep the `localhost` URIs — they can coexist. If you want sign-in through the
  `*.vercel.app` preview URL as well, add its callback URI too.

The boot log prints the exact `redirect_uri` per provider; if a sign-in fails
with `redirect_uri_mismatch`, compare byte-for-byte against that line.

## 5. Custom domain

1. Vercel → Project → **Settings → Domains** → Add `your-domain.com`.
2. Follow the shown DNS instructions at your registrar — apex via `A` record
   `76.76.21.21` or a subdomain `CNAME` to `cname.vercel-dns.com`.
3. HTTPS certificates are issued automatically; `COOKIE_SECURE` is already on
   in production.

## 6. Verify the deployment

| Check | Expect |
|---|---|
| `https://your-domain.com/api/health` | `{"ok":true,…}` with both providers `configured: true` |
| Sign in with Google / GitHub | redirected back, signed in |
| Create a team | 6-digit invite code shown once |
| Join from a second browser + second account with the code | both members listed |
| Reload, or come back hours later | still signed in, team still there (durable storage) |
| Owner rotates the invite code | old code dead, new code joins |
| Owner deletes the team | gone for everyone |

## 7. The live agent mesh (WebSocket)

Vercel serverless functions **cannot hold WebSocket connections open**, so the
root `src/server.js` backend needs a host that can (Render, Railway, Fly).

- **Skip it for launch** — the console detects the missing socket and shows the
  Fleet Dashboard offline; team create/join is plain HTTP and unaffected.
- **Host it** — deploy the repo root as a Node service (`npm start`, it honors
  `$PORT`), then set `VITE_LIVE_WS_URL=wss://<host>/ws` in Vercel and rebuild.

## Troubleshooting

| Symptom | Cause / fix |
|---|---|
| `redirect_uri_mismatch` at the provider | Registered URI doesn't byte-match the one in the boot log. |
| Everyone gets `unknown_identity` after a while / teams vanish | Durable storage not configured — step 3. |
| `invalid_code` although the code is correct | Create + join landed on different instances → step 3. |
| `429 rate_limited` while testing | Per-IP budget; wait out the window or raise `AUTH_RATE_MAX`. |
| Sign-in bounces back to the wrong host | `APP_URL` / `AUTH_PUBLIC_URL` still point at another URL. |
