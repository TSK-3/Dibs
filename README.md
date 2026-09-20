# ⚡ Live Interrupt

**Team Insomniacs — iQOO Hackathon 2026**
A live interrupt system for teams whose AI coding agents share a codebase. When a teammate speaks their intent ("I'm refactoring auth"), it's transcribed on-device (Surya's model), extracted to JSON (Tejashwin's app), and posted here. If the scope overlaps with someone else's active claim, **both phones buzz immediately** — catching conflicts before wasted work.

## Quick start

```bash
npm install
npm start            # backend on ws://localhost:8080/ws
```

- **Test bench:** open `http://localhost:8080/` in two tabs/phones → connect as different users → post the same scope → watch both sides get interrupted.
- **Narrated script:** `npm run demo` (add `DEMO_EXIT=1` to auto-stop, `DEMO_PORT=9090` if 8080 is blocked).
- **Full test suite:** `npm test` — 21 end-to-end tests across 3 suites, all real WebSocket connections.
- **Live stats:** `curl http://localhost:8080/stats` — counters (intents, conflicts, interrupts) + gauges (connected clients).

> **Windows note:** if port 8080 is in a reserved range (`EACCES`), run `PORT=9090 npm start` or `netsh int ipv4 show excludedportrange protocol=tcp` to check.

## Running components

| Command | What it does |
|---|---|
| `npm start` / `npm run dev` | WebSocket backend + HTTP test bench (`/`, `/health`, `/config`, `/stats`) |
| `npm run demo` | Starts the backend in-process and narrates the whole loop |
| `npm test` | 21 integration/lifecycle/hardening tests (PRD §4 acceptance criteria + more) |
| `npm run mcp` | MCP stdio server — connects to the backend, exposes 3 agent tools |

## Message contract (PRD §3.4 — do not change field names)

**Client → server:**

```json
{ "type": "post_intent", "user_id": "karthik", "scope": "auth",
  "summary": "Refactoring token validation",
  "rationale": "Cleaning up auth before demo", "timestamp": 1730000000000 }

{ "type": "complete_intent", "user_id": "karthik", "scope": "auth" }
```

**Server → client:**

```json
{ "type": "ack", "status": "claimed", "scope": "auth" }

{ "type": "interrupt", "from_user": "tejashwin", "scope": "auth",
  "summary": "Adding OAuth login screen",
  "message": "Tejashwin just claimed auth — you're about to duplicate this" }
```

**Connect:** `ws://host:8080/ws?user_id=karthik&team_id=insomniacs`
(or connect bare and send `{"type":"hello","user_id":"…","team_id":"…"}`).
Identity rules: 1–64 chars, letters/digits/`.`/`_`/`-`, must start alphanumeric — identities become snapshot JSON keys, so they're validated at the door. Scopes are case/space-insensitive (`"AUTH"` ≡ `"auth"`); unknown or malformed input gets a structured `error {code, message}` back, never a silent drop.

**Additive extensions** (no core field changes): `check_intent` → `scope_status` (query without claiming — used by the MCP tools), `request_state` → `state` (full team snapshot for reconnecting clients), `complete_ack`, `error {code, message}`, `claim_expired`.

## Configuration (env vars)

| Var | Default | Purpose |
|---|---|---|
| `PORT` / `HOST` | `8080` / `0.0.0.0` | `0.0.0.0` so phones on venue wifi can connect |
| `SCOPES` | built-in 12-module list | Override closed enum: `SCOPES="auth,payments,ml"` |
| `SCOPES_FILE` | — | JSON file with the enum (sync with Surya's model) |
| `SNAPSHOT_PATH` | `snapshots/claims-snapshot.json` | Persistence file, written on every mutation |
| `CLAIM_TTL_MS` | `0` (off) | Set e.g. `1800000` to auto-expire stale claims |
| `PING_INTERVAL_MS` | `30000` | Dead-socket reaper interval |
| `AUTH_TOKEN` | — (open) | Set to require `?token=…` on every WS connection |
| `RATE_CAPACITY` | `30` | Token-bucket size per connection (burst allowance) |
| `RATE_REFILL_PER_SEC` | `5` | Bucket refill rate per connection |
| `MAX_CLIENTS` | `200` | Hard cap on concurrent WS clients |
| `MAX_FIELD_LENGTH` | `512` | Max `summary`/`rationale` chars |
| `LOG_LEVEL` / `LOG_JSON` | `info` / off | Structured logging (`LOG_JSON=1` for machine-readable) |

## Layout

```
src/config.js      scopes enum + every knob
src/store.js       in-memory claims + atomic JSON snapshot / restore
src/matcher.js     exact-match overlap → interrupt payloads
src/protocol.js    message contract validation + handlers
src/logger.js      structured JSON logging
src/metrics.js     counters + gauges (exposed at GET /stats)
src/ratelimit.js   per-connection token bucket (DDoS/accidental-flood guard)
src/server.js      single-process WS server: auth, rate limit, heartbeat,
                   crash handlers + graceful drain, reconnect-safe
src/mcp/mcp-stdio.js   MCP tool wrapper (JSON-RPC over stdio)
public/index.html  browser test bench (two phones, one page each)
scripts/demo.js    narrated end-to-end run
scripts/mcp-smoke.js   dev-only MCP verification
test/              21 e2e tests across integration / lifecycle / hardening
```

## Production hardening (beyond the PRD)

- **Auth:** set `AUTH_TOKEN` and every WS handshake must carry `?token=…`; bad tokens get closed with code 1008 + an `unauthorized` error message.
- **Rate limiting:** per-connection token bucket — floods get `error {code: "rate_limited", retry_after_ms}` instead of taking the demo down.
- **Client cap:** `MAX_CLIENTS` protects the single process; over-cap connections are closed politely.
- **Crash safety:** `uncaughtException`/`unhandledRejection` handlers snapshot state to disk before exiting non-zero, so a supervisor restart loses nothing.
- **Graceful drain:** on SIGINT/SIGTERM clients get `close 1001` (going away), the final snapshot is flushed, then sockets close cleanly.
- **Observability:** `/stats` exposes counters (`ws_connections_total`, `intents_posted_total`, `conflicts_detected_total`, `interrupts_sent_total`, …) and gauges (`connected_clients`, `active_claims`) — useful in the pitch to show real numbers.

## Integration notes for teammates

- **Surya (on-device model):** the `scope` field must be one of the closed enum values — get the list from `GET /config` (or `SCOPES` env) and constrain the model's output to it. Everything else in `post_intent` is free text.
- **Tejashwin (app):** connect with the query-param URL above; the server immediately replies with a `state` message containing the whole team's claims, so the UI can render on open and after any reconnect. `interrupt` → phone buzz + the `message` field is judge-friendly as-is.

## PRD §4 acceptance criteria — all verified

- [x] Two clients each post an intent and get an `ack`
- [x] Overlapping scope pushes `interrupt` to both sides in ≤1s (measured: **5ms**)
- [x] Disconnect/reconnect keeps state (`state` sync on reconnect)
- [x] JSON snapshot restores state after restart (corrupt snapshots backed up, never fatal)
