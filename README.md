# Interlock

Interlock is a real-time intent-coordination system for teams working in the same codebase. Clients publish a structured development intent; when another active intent targets the same scope, the service immediately notifies both participants. This makes overlapping work visible before it becomes duplicated effort or a merge conflict.

The repository contains two independently runnable components:

- The Node.js WebSocket service at the repository root.
- The Expo mobile application and on-device speech-to-intent pipeline in [`mobile/`](mobile/README.md).

## Features

- WebSocket-based intent publishing and targeted interrupt delivery.
- Exact, closed-enum scope matching.
- In-memory active claims with an atomic JSON snapshot for restart recovery.
- State synchronization for reconnecting clients.
- Optional authentication, rate limiting, connection caps, health checks, and metrics.
- An MCP stdio wrapper for agent integrations.
- On-device speech recognition and local, grammar-constrained intent extraction in the mobile application.

## Quick start

Requirements: Node.js 18.17 or later.

```bash
npm install
npm start
```

The server starts on `ws://localhost:8080/ws`. Open `http://localhost:8080/` in two browser tabs to use the included test bench.

## Commands

| Command | Description |
|---|---|
| `npm start` | Start the WebSocket service and HTTP test bench. |
| `npm run dev` | Start the service in watch mode. |
| `npm test` | Run the integration, lifecycle, and hardening tests. |
| `npm run demo` | Run the narrated end-to-end demonstration. |
| `npm run mcp` | Start the MCP stdio integration. |

To run the mobile application, change to `mobile/`, install its dependencies, and follow the [mobile setup guide](mobile/README.md).

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

## Configuration

All settings are optional environment variables.

| Variable | Default | Description |
|---|---|---|
| `PORT` / `HOST` | `8080` / `0.0.0.0` | HTTP and WebSocket bind address. |
| `SCOPES` | Built-in enum | Comma-separated list of allowed scopes. |
| `SCOPES_FILE` | — | Path to a JSON array or `{ "scopes": [] }` file. |
| `SNAPSHOT_PATH` | `snapshots/claims-snapshot.json` | Claim snapshot location. |
| `CLAIM_TTL_MS` | `0` | Optional active-claim expiration period. |
| `AUTH_TOKEN` | — | Shared token required during connection when configured. |
| `RATE_CAPACITY` / `RATE_REFILL_PER_SEC` | `30` / `10` | Per-connection rate-limit settings. |
| `MAX_CLIENTS` | `500` | Maximum concurrent WebSocket connections. |
| `PING_INTERVAL_MS` | `30000` | Socket health-check interval in milliseconds. |
| `LOG_LEVEL` / `LOG_JSON` | `info` / off | Logging configuration. |

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
