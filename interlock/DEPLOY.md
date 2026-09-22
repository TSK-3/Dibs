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
| `SESSION_SECRET` | `openssl rand -hex 32` | Signs sessions and seals provider tokens. **Required in production** — the service refuses to boot without it. Also seals agent-pairing tokens at rest. |
| `AUTH_PUBLIC_URL` | `https://your-domain.com` | Builds the OAuth `redirect_uri` the providers must have registered (step 4) — and the default MCP URL shown on the Pair Agent screen. |
| `APP_URL` | `https://your-domain.com` | Where the browser returns after sign-in. |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | from Google Cloud Console | Gmail sign-in. |
| `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` | from GitHub OAuth App | GitHub sign-in. |
| `TRUST_PROXY` | `1` | The service sits behind Vercel's edge, so rate limiting sees real client IPs. |
| `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` | from Upstash (step 3) | Durable storage for users + teams + pairing tokens. **Required for agent pairing to survive cold starts.** |
| `WS_BACKEND_URL` | `wss://<live-mesh-host>/ws` | Where the MCP endpoint relays tool calls (step 7). Unset = `ws://127.0.0.1:8080/ws` (local only) — on Vercel the relay fails until this is set. |
| `MCP_PUBLIC_URL` *(optional)* | `https://your-domain.com/mcp` | Override the URL shown in the paste-ready config block. Defaults to `$AUTH_PUBLIC_URL/mcp` (or `https://$VERCEL_URL/mcp` on previews). |
| `VITE_LIVE_WS_URL` *(optional)* | `wss://…` | Live mesh hosted elsewhere (step 5). |

Notes:

- On Vercel, if `AUTH_PUBLIC_URL` or `APP_URL` is omitted, both values
  automatically fall back to Vercel's `VERCEL_URL` for that deployment. Set
  these variables explicitly for a custom domain, and register the matching
  callback URL with each OAuth provider.
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
   `[auth] durable storage: upstash-rest — preloading users + workspaces + pairings`.
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
| Pair Agent screen shows a token + config block | `url` starts with `https://your-domain.com/mcp` |
| `curl -s -X POST https://your-domain.com/mcp -H 'content-type: application/json' -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'` | `401 {"ok":false,"error":"invalid_token",…}` — the endpoint is live and locked |
| Same request WITH `-H 'Authorization: Bearer <token from the screen>'` | `{"jsonrpc":"2.0",…,"result":{"tools":[post_intent, check_intent, complete_intent]}}` |
| Paste the config into Cursor / Claude Code, ask the agent to check a scope | tool call succeeds (needs step 7's live mesh + `WS_BACKEND_URL`) |
| Regenerate the token, retry with the old one | `401` on the next call |

## 7. The live agent mesh (WebSocket)

Vercel serverless functions **cannot hold WebSocket connections open**, so the
root `src/server.js` backend needs a host that can (Render, Railway, Fly).

- **Skip it for launch** — the console detects the missing socket and shows the
  Fleet Dashboard offline; team create/join is plain HTTP and unaffected.
- **Host it** — deploy the repo root as a Node service (`npm start`, it honors
  `$PORT`), then set `VITE_LIVE_WS_URL=wss://<host>/ws` in Vercel and rebuild.

## 8. Agent pairing (MCP) on Vercel

The Pair Agent screen hands each user a token + a paste-ready MCP config. The
agent connects to **`https://your-domain.com/mcp`** — MCP over HTTP (POST
JSON-RPC), which is the only transport a serverless function can serve. The
`/mcp` path is rewritten to the same function as `/api/*` in
[`vercel.json`](vercel.json); nothing extra to configure.

For it to work end to end:

1. **Durable storage (step 3) must be on.** Pairing tokens live in the same
   Upstash snapshot family (`interlock:v1:pairings`): a token issued on one
   instance resolves on every cold start. Without durable storage, a cold start
   forgets every token and agents get 401s.
2. **The live mesh must be hosted (step 7).** Every `post_intent` /
   `check_intent` / `complete_intent` tool call opens a short client connection
   to `$WS_BACKEND_URL`. Set `WS_BACKEND_URL=wss://<live-mesh-host>/ws` — the
   default points at `127.0.0.1:8080`, which does not exist on Vercel.
3. `SESSION_SECRET` must never change between deploys: it seals the pairing
   tokens at rest, and a new secret makes every stored token unreadable
   (resolution fails closed → 401s until users regenerate).

Paste-ready URL rules:

- Production + custom domain → `https://your-domain.com/mcp` (the default from
  `AUTH_PUBLIC_URL`).
- Preview deployments → `https://<project>-<hash>.vercel.app/mcp` — set
  `MCP_PUBLIC_URL` per deployment if you need preview pairing to resolve
  against itself.
- If you front `/mcp` with a WebSocket-speaking proxy, set `MCP_PUBLIC_URL`
  explicitly; the endpoint itself always speaks HTTP.

Consistency notes (same last-write-wins family as teams, fine at demo scale):

- **Regenerate propagation**: the rotation is durable immediately and enforced
  on the rotating instance and every *cold* instance. A *warm* instance that
  saw the token before the rotation can keep accepting it until it restarts or
  is recycled — Vercel recycles functions within minutes. Rotate + wait a beat
  if an agent must lose access that second.
- Resolve is read-only against remote storage, so agent traffic can never
  clobber a concurrent rotation.

## Troubleshooting

| Symptom | Cause / fix |
|---|---|
| `redirect_uri_mismatch` at the provider | Registered URI doesn't byte-match the one in the boot log. |
| Everyone gets `unknown_identity` after a while / teams vanish | Durable storage not configured — step 3. |
| `invalid_code` although the code is correct | Create + join landed on different instances → step 3. |
| `429 rate_limited` while testing | Per-IP budget; wait out the window or raise `AUTH_RATE_MAX`. |
| Sign-in bounces back to the wrong host | `APP_URL` / `AUTH_PUBLIC_URL` still point at another URL. |
| `https://…/mcp` returns the HTML app, not JSON | Deploy predates the `/mcp` rewrite in `vercel.json` — redeploy. |
| Agent gets 401 with a token fresh from the screen | Durable storage off (step 3) and the issuing instance went cold — tokens only survive cold starts with Upstash/Postgres configured. |
| Agent gets 401 right after you rotated the token on another device | Expected — that's the point. Re-paste the new config block. |
| Agent 401s across the board after a redeploy | `SESSION_SECRET` changed → every sealed token is unreadable. Keep the secret stable; users regenerate if needed. |
| Tool calls return "live backend unreachable" | `WS_BACKEND_URL` unset or the mesh host is down (step 7). |
| Tool calls time out | The WS backend is reachable but slow — raise `MCP_TIMEOUT_MS` (default 5000). |
