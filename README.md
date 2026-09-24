# Interlock

**Real-time intent coordination for teams whose AI coding agents share a codebase.**
Publish what you're about to work on; the moment someone else's intent targets the
same scope, *both of you* get an interrupt — before the duplicated effort or the
merge conflict, not after.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

## What's in this repo

Three independently runnable components:

| Component | Path | What it does |
|---|---|---|
| **Live-interrupt backend** | `/` (root) | WebSocket service: intent publishing, exact scope matching, targeted interrupts, snapshot recovery, MCP stdio wrapper. |
| **Web console** | [`interlock/`](interlock/README.md) | React + Vite console with real Google/GitHub OAuth, team workspaces with invite codes, GitHub repo selection, and a live Fleet Dashboard wired to the backend. |
| **Mobile app** | [`mobile/`](mobile/README.md) | Expo app with on-device speech recognition and local, grammar-constrained intent extraction. |

## Quick start (web console, end to end)

Requirements: **Node.js 18.17+** (21+ for the agent CLI's global `WebSocket`).

```bash
# 1. Backend
npm install

# 2. Web console (starts identity service :8787, Vite app :3000, backend :8090)
cd interlock
npm install
npm run dev:full
```

Open **http://localhost:3000**. Optional: for Google/GitHub sign-in, copy
`interlock/.env.example` → `interlock/.env.local` and add your OAuth credentials
([setup guide](interlock/README.md)). Providers without credentials are disabled
in the UI and fail closed server-side — everything else works out of the box.

Launch an agent against the mesh from a second terminal:

```bash
node scripts/agent.mjs --user cursor-ide --team <workspaceId> --scope auth
```

The Fleet Dashboard then shows live roster, claims, collisions, and interrupts —
all real protocol traffic, no mocks.

## Backend quick start (standalone)

```bash
npm install
npm start        # ws://localhost:8080/ws + browser test bench at /
npm test         # integration, lifecycle, and hardening tests
npm run demo     # narrated end-to-end demonstration
```

## Features

- WebSocket-based intent publishing and targeted interrupt delivery.
- Exact, closed-enum scope matching (opt-in open/hierarchical file-path scopes).
- In-memory active claims with an atomic JSON snapshot for restart recovery.
- State synchronization for reconnecting clients.
- Real OAuth 2.0 sign-in (Google + GitHub, PKCE, HttpOnly session cookies).
- Team workspaces with 6-digit invite codes, GitHub repo binding, and member rosters.
- Optional auth token, rate limiting, connection caps, health checks, and metrics.
- An MCP stdio wrapper for agent integrations.
- On-device speech recognition and local intent extraction in the mobile app.

## Protocol

Connect a client using query parameters:

```text
ws://host:8080/ws?user_id=client-a&team_id=team-1
```

The same identity may instead be provided through a `hello` message after connecting.

### Publish an intent

```json
{
  "type": "post_intent",
  "user_id": "client-a",
  "scope": "auth",
  "summary": "Refactor token validation",
  "rationale": "Simplify the authorization flow",
  "timestamp": 1730000000000
}
```

If the scope has no active claim, the server responds with:

```json
{ "type": "ack", "status": "claimed", "scope": "auth" }
```

If another client already holds that scope, both clients receive an interrupt:

```json
{
  "type": "interrupt",
  "from_user": "client-a",
  "scope": "auth",
  "summary": "Refactor token validation",
  "message": "An active claim already exists for auth"
}
```

Release a completed intent with:

```json
{ "type": "complete_intent", "user_id": "client-a", "scope": "auth" }
```

Additional messages include `check_intent` / `scope_status`, `request_state` / `state`, `complete_ack`, `claim_expired`, and structured `error` responses.

## Configuration (backend)

All settings are optional environment variables (see [`.env.example`](.env.example)).

| Variable | Default | Description |
|---|---|---|
| `PORT` / `HOST` | `8080` / `0.0.0.0` | HTTP and WebSocket bind address. |
| `SCOPES` | Built-in enum | Comma-separated list of allowed scopes. |
| `SCOPES_OPEN` | off | Set `1` to accept arbitrary file-path scopes. |
| `SCOPES_FILE` | — | Path to a JSON array or `{ "scopes": [] }` file. |
| `SNAPSHOT_PATH` | `snapshots/claims-snapshot.json` | Claim snapshot location. |
| `CLAIM_TTL_MS` | `0` | Optional active-claim expiration period. |
| `AUTH_TOKEN` | — | Shared token required during connection when configured. |
| `RATE_CAPACITY` / `RATE_REFILL_PER_SEC` | `30` / `10` | Per-connection rate-limit settings. |
| `MAX_CLIENTS` | `500` | Maximum concurrent WebSocket connections. |
| `PING_INTERVAL_MS` | `30000` | Socket health-check interval in milliseconds. |
| `LOG_LEVEL` / `LOG_JSON` | `info` / off | Logging configuration. |

Web-console configuration (OAuth, sessions, Vercel deployment) is documented in
[`interlock/README.md`](interlock/README.md) and [`interlock/DEPLOY.md`](interlock/DEPLOY.md).

Use the same scope list in the backend and mobile pipeline so extracted intents are always accepted by the service.


## Architecture

```text
mobile client / web client / MCP client
                │
                ▼
       WebSocket protocol layer
                │
                ▼
       scope matcher + claim store
                │
        ┌───────┴────────┐
        ▼                ▼
 JSON snapshot      interrupt events
```

Key backend modules:

```text
src/server.js           HTTP and WebSocket server
src/protocol.js         Message validation and handlers
src/store.js            Active claims and snapshot persistence
src/matcher.js          Scope-overlap matching
src/config.js           Runtime configuration and scope enum
src/metrics.js          Service counters and gauges
src/mcp/mcp-stdio.js    MCP stdio interface
public/index.html       Browser-based test bench
```

## Operational endpoints

| Endpoint | Purpose |
|---|---|
| `/` | Browser test bench. |
| `/health` | Service health status. |
| `/config` | Active non-secret configuration and scopes. |
| `/stats` | Runtime counters and gauges. |

For deployments outside a trusted network, configure `AUTH_TOKEN` and use a secure WebSocket endpoint (`wss://`).

## Contributing

See [`CONTRIBUTING.md`](CONTRIBUTING.md) for the local development setup, test
requirements, and PR guidelines.

## License

[MIT](LICENSE)

