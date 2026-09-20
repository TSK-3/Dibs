# Implementation Plan — Interlock web console: real GitHub repos, real workspaces, real agent fleet

[Overview]
Make the Interlock web console fully functional end to end, replacing every mock in the three workspace views with real server-backed behavior. Today only the sign-in surface is real (OAuth + sessions). The Team & Workspace view fakes repo selection and invite-code verification, Connect Agents renders six hardcoded agents, and the Fleet Dashboard shows hardcoded stats/claims/trace. This plan wires the console to (1) the GitHub API through the identity service's stored access token so the repo dropdown lists the user's real (public) repositories, (2) a new server-persisted workspace service (create/join/invite-code/members) so team creation and 6-digit join verification are real, and (3) the repo's existing live-interrupt WebSocket backend (root `src/server.js`, port 8080) so agents, claims, collisions, and the wire trace are real protocol traffic, exercisable from a new agent CLI script.

Context and constraints:
- **Repo visibility decision (user-confirmed): public repos only.** The current GitHub OAuth scopes (`read:user`, `user:email`) already list the account's public repos via `GET /user/repos`; no OAuth scope changes and no re-consent screen. One re-login is still required once (the access token was previously discarded after profile fetch; it must now be persisted server-side).
- Access tokens stay server-side, encrypted at rest with a key derived from the session secret; the browser only ever receives public repo/workspace data through the same-origin `/api` proxy.
- The WS backend already speaks `post_intent`/`complete_intent`/`check_intent`/`interrupt` per `(team_id, scope)` with a snapshot-persisted claim store. Its closed scope enum and exact-match semantics are kept as defaults; this plan adds an opt-in open/hierarchical scope mode (`SCOPES_OPEN=1`) so the console can claim real file paths.
- Persistence stays dependency-free JSON snapshots (`.data/` for identity/workspaces, `snapshots/` for claims), matching the existing `UserStore`/`ClaimStore` pattern.

[Types]
All TypeScript additions live in `interlock/src/types.ts` (or co-located lib files) and mirror the server JSON exactly.

- `RepoSummary` — `{ id: number; fullName: string; private: boolean; htmlUrl: string; description: string | null; defaultBranch: string; updatedAt: string; ownerLogin: string }`
- `WorkspaceMember` — `{ userId: string; name: string; username: string | null; avatarUrl: string | null; provider: string }`
- `WorkspaceRepo` — `{ fullName: string; private: boolean; defaultBranch: string | null; htmlUrl: string | null }`
- `Workspace` — `{ id: string; name: string; repo: WorkspaceRepo; ownerUserId: string; members: WorkspaceMember[]; createdAt: string; updatedAt: string }` (server never returns the invite-code hash)
- `WorkspaceCreateInput` — `{ name: string; repo: WorkspaceRepo }`
- `LiveAgent` — `{ user_id: string; team_id: string; connected_at: number; client: string }`
- `RosterMessage` — `{ type: 'roster'; team_id: string; agents: LiveAgent[] }`
- `LiveClaim` — `{ scope: string; user_id: string; summary: string; rationale: string; timestamp: number; received_at: number }`
- `WireTraceEvent` (exists) — reused as the dashboard trace row; a `source: 'ws'` discriminator is added so live events can be told apart from bootstrapped state.

Server-side (JS): workspace record shape `{ id, name, repo, ownerUserId, members: WorkspaceMember[], inviteCodeHash: string, createdAt, updatedAt }`; presence entry `{ user_id, team_id, connected_at, client }`.

[Files]
New files:
- `interlock/server/github.js` — GitHub API access through the stored token; `listRepos`, `normalizeRepo`, error mapping (`github_token_missing`, `github_unreachable`, `github_rate_limited`).
- `interlock/server/workspaces.js` — `WorkspaceStore` (Map + atomic JSON snapshot at `interlock/.data/workspaces.json`), invite-code hashing (sha256 + timing-safe compare), membership logic.
- `interlock/server/secretbox.js` — AES-256-GCM encrypt/decrypt for provider tokens at rest, key derived from the session secret.
- `interlock/server/workspaces.test.js`, `interlock/server/github.test.js` — service tests following the `server/auth.test.js` harness patterns.
- `interlock/src/lib/apiClient.ts` — shared same-origin JSON `apiFetch<T>` + error-code → message map (extends the pattern in `authClient.ts`).
- `interlock/src/lib/githubClient.ts` — `fetchRepos(): Promise<RepoSummary[]>` hitting `/api/github/repos`.
- `interlock/src/lib/workspaceClient.ts` — `createWorkspace`, `listWorkspaces`, `getWorkspace`, `joinWorkspace`, `regenerateInvite`, `deleteWorkspace` + response types.
- `interlock/src/state/WorkspaceContext.tsx` — active-workspace provider: list, create, join, refresh, select (localStorage `interlock.activeWorkspaceId`), error/loading.
- `interlock/src/state/LiveContext.tsx` — WebSocket session provider: connection status, roster, team claims, wire-trace ring buffer (200 events), live metrics, `claim/release/check` actions.
- `interlock/src/live/liveClient.ts` — dependency-free WS client (auto-reconnect with exponential backoff + jitter, event emitter, `request_state` on open, URL derived from `window.location` `/ws`).
- `interlock/src/components/views/RepoSelect.tsx` — searchable combobox for real repos (keyboard navigable, public badge, updated date, loading/empty/error states).
- `scripts/agent.mjs` (repo root) — real CLI agent: connects to `ws://localhost:8080/ws`, posts an intent, holds the claim, prints interrupts, sends `complete_intent` on exit. Uses Node 22 global `WebSocket`, zero deps.
- `src/presence.js` (repo root) — per-team roster: `join`, `leave`, `roster(teamId)`, change-notification hook.
- `test/presence.test.js`, `test/open-scopes.test.js` (repo root, matching the existing `node --test` glob) — presence + open-scope/hierarchical matcher tests.

Modified files:
- `interlock/server/users.js` — `upsertFromProfile(profile, { providerToken, now })` persists encrypted `providerToken`; add `getProviderToken(userId, provider)`.
- `interlock/server/app.js` — pass the token from `exchangeCodeForToken` into `upsertFromProfile`; add `requireSession` helper; new routes `GET /api/github/repos` and the six `/api/workspaces*` routes (detailed under Functions).
- `interlock/server/providers.js` — no scope change (public-only decision); comment documenting that `GET /user/repos` returns public repos under `read:user`.
- `interlock/src/App.tsx` — wrap with `WorkspaceProvider` + `LiveProvider`; drop `INITIAL_AGENTS/INITIAL_MATRIX/INITIAL_WIRE_TRACE` state; gate Connect Agents/Fleet views on an active workspace.
- `interlock/src/components/views/TeamWorkspaceView.tsx` — full rebuild: create (name + `RepoSelect`) / join (6-digit code, server-verified) when no active workspace; real workspace card (members, repo link, invite-code reveal/copy, regenerate, delete) when active. Removes the fake PIN acceptance and the hardcoded "Team Insomniacs Verified" card.
- `interlock/src/components/views/ConnectAgentsView.tsx` — rebuild: live roster list + per-agent-type launcher cards with real copyable CLI commands (`node scripts/agent.mjs --user … --team <workspaceId> --scope …`); console's own connection state from `LiveContext`.
- `interlock/src/components/views/FleetDashboardView.tsx` — rebuild: claims matrix from live `state` (`request_state` + event-driven updates), Claim modal → real `post_intent`, Release → `complete_intent`, wire trace from live WS traffic, stat cards from `/live/stats` metrics (Active Agents, Active Claims, Conflicts Detected, Interrupts Sent).
- `interlock/src/data/mockData.ts` — strip all mock exports; keep only `BRAND_LOGO_URL`.
- `interlock/src/types.ts` — add the types above; extend `WireTraceEvent` with `source`.
- `interlock/vite.config.ts` — proxy `/ws` → `ws://localhost:8080` (`ws: true`) and `/live` → `http://localhost:8080` (rewrite `/live` → `/`) for `/live/stats|health|config`.
- `interlock/scripts/dev.mjs` — spawn a third child `[live]`: `node src/server.js` with `cwd` = repo root and `env.SCOPES_OPEN = '1'`.
- `interlock/server/auth.test.js` — add token-persistence assertion to the callback round-trip test.
- `interlock/README.md`, root `README.md` — document new endpoints, the agent CLI, `SCOPES_OPEN`, and the one-time re-login requirement.

Deleted/moved: none (mock exports are removed from `mockData.ts`, the file itself is retained for `BRAND_LOGO_URL`).

Configuration updates:
- `interlock/.env.local` — unchanged (GitHub credentials already set).
- No new required env vars; optional `LIVE_WS_URL` override documented for the agent CLI.

[Functions]
New functions (name — file — signature — purpose):
- `encryptSecret` / `decryptSecret` — `interlock/server/secretbox.js` — `(plaintext, keyHex) => string` / `(payload, keyHex) => string` — AES-256-GCM; output format `v1.<iv>.<tag>.<ciphertext>` (base64url parts).
- `normalizeRepo` — `interlock/server/github.js` — `(raw) => RepoSummary` — maps GitHub repo JSON to the wire shape.
- `listRepos` — `interlock/server/github.js` — `async ({ accessToken, fetchImpl = fetch, perPage = 100, maxPages = 2 }) => RepoSummary[]` — `GET /user/repos?sort=updated&per_page=…&page=…` with proper `Authorization`/`Accept`/`User-Agent` headers; throws coded errors (`github_token_missing`, `github_unreachable`, `github_rate_limited`).
- `requireSession` — `interlock/server/app.js` — `(req) => sessionPayload | null` — shared guard for the new API routes (401 JSON on miss).
- `WorkspaceStore.create` — `interlock/server/workspaces.js` — `({ ownerUser, name, repo }, { now }) => { workspace, inviteCode }` — id `wsp_` + 12 hex chars; invite code = crypto-random 6-digit; only the sha256 hash is stored.
- `WorkspaceStore.findByCode(code)` / `join(code, user)` / `listForUser(userId)` / `regenerateCode(id, userId)` / `remove(id, userId)` — membership + timing-safe code comparison; `join` is idempotent for existing members.
- `main` — `scripts/agent.mjs` — arg-parsed CLI loop: connect, `post_intent`, print `ack`/`interrupt`/`error`, `complete_intent` on SIGINT; exit codes usable in CI.
- `createPresence` — `src/presence.js` — `({ logger }) => { join(entry), leave(teamId, userId), roster(teamId), subscribe(fn) }` — broadcasts roster deltas.
- `scopeOverlaps` — `src/matcher.js` — `(a, b) => boolean` — segment-aware prefix overlap (`auth` ↔ `auth/login.tsx`), used when open mode is on.
- `LiveClient.connect/send/on/close` — `interlock/src/live/liveClient.ts` — reconnect with backoff (1s → 30s cap, ±30% jitter), single-flight reconnect, `request_state` on (re)open.
- `useLive()` — `interlock/src/state/LiveContext.tsx` — `{ status, roster, claims, trace, stats, claim(scope, summary, rationale), release(scope), check(scope) }`.
- `useWorkspace()` / `useGitHubRepos()` — React hooks over the new clients.

Modified functions:
- `UserStore.upsertFromProfile` (`interlock/server/users.js`) — accepts optional `providerToken`; stores `{ accessToken: encryptSecret(…), scope, tokenType, fetchedAt }` on the record; never logged.
- `UserStore.getProviderToken(userId, provider)` (new method) — decrypts on read; returns null when absent or provider mismatch.
- OAuth callback handler (`interlock/server/app.js`) — currently discards the token from `exchangeCodeForToken`; now passes it into `upsertFromProfile`.
- `statePayload` (`src/protocol.js`) — includes `agents: presence.roster(teamId)` alongside claims (signature gains `presence`).
- `handlePostIntent` / `handleCheckIntent` / `handleCompleteIntent` (`src/protocol.js`) — scope validation branches on open mode; conflict discovery uses `scopeOverlaps` so a file-path claim collides with its module claim.
- `findConflicts` (`src/matcher.js`) — overlap-aware when `deps.overlap` is enabled; exact-match default preserved.
- `startServer` (`src/server.js`) — wires presence into connection open/close (only once identity is known), broadcasts roster on join/leave, passes presence into `handleMessage` deps and `statePayload`.

Removed functions: none. The fake behaviors they powered (`handleConnect` setTimeout toggle, client-side PIN "verification", hardcoded stats) disappear with their view rewrites. No data migration needed — new stores start empty.

[Classes]
New classes:
- `WorkspaceStore` — `interlock/server/workspaces.js` — mirrors `UserStore`: in-memory Map + atomic snapshot (`save()` tmp-file rename with Windows fallback, `restore()` corrupt-file backup), fields per the Types section, `inviteCodeHash` never serialized to API responses.
- `LiveClient` — `interlock/src/live/liveClient.ts` — event-emitter WS wrapper; methods above; exponential backoff (1s → 30s cap, ±30% jitter), single-flight reconnect.
- `createPresence` (factory returning a closure) — `src/presence.js` — `Map<teamId, Map<userId, entry>>` + subscriber notification list.

Modified classes:
- `UserStore` (`interlock/server/users.js`) — token persistence + `getProviderToken`.
- `ClaimStore` (`src/store.js`) — unchanged (already supports per-team claims; snapshot format untouched).
- Express app factory `createApp` (`interlock/server/app.js`) — new route registrations; unchanged auth semantics; rate limiting extended to the new mutating routes (reuses `rateLimited`).

Removed classes: none.

[Dependencies]
- No new npm packages. Everything uses existing deps (`ws` at root; Node 22 global `WebSocket` for the agent CLI; Node built-ins `crypto`/`fs` for the workspace store and secretbox).
- Node runtime stays ≥ 18.17 (repo engines field) for the services; the agent CLI's global `WebSocket` requires Node ≥ 21 (dev machine runs 22.14 — documented in the script header).
- Optional env additions (all defaulted): `SCOPES_OPEN=1` set by `dev.mjs` for local dev; `LIVE_WS_URL` override for the agent CLI.

[Testing]
- `interlock/server/github.test.js` — stubbed `fetchImpl` (pattern from `auth.test.js`): repo normalization, pagination cap, 401/403/429 → coded errors, `github_token_missing` when the session identity has no stored token, non-GitHub session → 403.
- `interlock/server/workspaces.test.js` — create (id/code shape, hash never in API payload), join (valid code, invalid code → `invalid_code`, duplicate join idempotent), regenerate (old code dead, new code returned once), authorization (non-member GET → 404, non-owner DELETE/regenerate → 403), persistence (save/restore round-trip), input validation (name length, repo shape).
- `interlock/server/auth.test.js` — extend the callback round-trip: after sign-in the stored record contains an (encrypted) `providerToken` and `GET /api/github/repos` serves from the stubbed GitHub API.
- Root repo — presence tests (roster broadcast on connect/disconnect, roster included in `state`, close before identify doesn't crash) and open-scope tests (`SCOPES_OPEN` accepts `auth/login.tsx`, rejects malformed scopes, `scopeOverlaps` segment matching, conflict + interrupts fire for overlapping file vs module claims). The existing closed-enum tests stay green (default mode unchanged).
- Run: `npm test` in repo root and in `interlock/`.
- Manual E2E (post-implementation): `npm run dev:full` (3 processes) → sign in with GitHub → create a workspace with a real repo → `node scripts/agent.mjs --user claude-cli --team <id> --scope auth` → roster shows the agent → claim `auth` from the dashboard → CLI claims `auth/login.tsx` → both sides receive real interrupts → dashboard stats reflect `/live/stats`. Screenshot all three views as evidence.

[Implementation Order]
1. `secretbox.js` + `users.js` token persistence + `app.js` callback wiring + extended `auth.test.js` — foundation for GitHub data (no UI yet).
2. `server/github.js` + `GET /api/github/repos` + `github.test.js` — repo data available.
3. `server/workspaces.js` + workspace routes + `workspaces.test.js` — team creation real.
4. SPA data layer: `apiClient.ts`, `githubClient.ts`, `workspaceClient.ts`, `WorkspaceContext.tsx`.
5. `TeamWorkspaceView.tsx` rebuild + `RepoSelect.tsx`; `App.tsx` wiring for workspace gating. (User-facing milestone: real repo dropdown + real join codes.)
6. Root backend: `presence.js`, open-scope config + matcher/protocol extensions, `server.js` wiring + tests.
7. `scripts/agent.mjs` CLI.
8. SPA live layer: `liveClient.ts`, `LiveContext.tsx`, vite proxy additions, `ConnectAgentsView.tsx` + `FleetDashboardView.tsx` rebuilds; strip mocks from `App.tsx`/`mockData.ts`.
9. `dev.mjs` three-process startup + README/env documentation.
10. Full verification: both test suites green, live E2E with the agent CLI, screenshots of all three views.

Operational note: after implementation the user signs out and signs in once so the identity service can persist the GitHub token issued during that login (previous sessions predate token persistence). Public repos only, per the confirmed decision — no OAuth scope or consent changes.



