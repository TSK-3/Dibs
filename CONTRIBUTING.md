# Contributing to Interlock

Thanks for your interest in contributing! This guide gets you from a fresh clone
to a running development environment in a few minutes.

## Project structure

Interlock is a monorepo with three independently runnable components:

| Path | What it is | Stack |
|---|---|---|
| `/` (root) | Live-interrupt WebSocket backend | Node.js, `ws` |
| `/interlock` | Web console + OAuth identity service | React 19, Vite, Tailwind 4, Express |
| `/mobile` | Expo mobile app + on-device speech-to-intent | Expo / React Native |

## Local development

### 1. Backend (root)

```bash
npm install
npm test        # integration, lifecycle, and hardening tests
npm start       # ws://localhost:8080/ws + browser test bench at /
```

### 2. Web console

```bash
cd interlock
npm install
npm run dev:full   # identity service (:8787) + Vite app (:3000) + backend (:8090)
```

Open `http://localhost:3000`. Sign-in requires real OAuth credentials — copy
`interlock/.env.example` to `interlock/.env.local` and follow the setup steps in
[`interlock/README.md`](interlock/README.md). An unconfigured provider is
disabled in the UI and fails closed server-side; everything else (workspaces,
the live mesh, the agent CLI) works without any credentials.

### 3. Run an agent against the mesh

```bash
node scripts/agent.mjs --user cursor-ide --team <workspaceId> --scope auth
```

## Testing

Every pull request must keep the test suites green:

```bash
npm test                       # root backend
cd interlock && npm test       # identity service + workspace stores
cd interlock && npm run lint   # TypeScript typecheck
cd interlock && npm run build  # SPA production build
```

## Pull request guidelines

- Keep the wire protocol (`post_intent`, `interrupt`, `complete_intent`, …)
  backward-compatible. Field names are the contract between all three clients —
  update the protocol docs in the root `README.md` if anything changes.
- New server behavior needs tests. The suites use `node --test` with stubbed
  `fetch` — no network access required.
- Match existing code style: ESM, no linter-config churn, dependency-free
  persistence (JSON snapshots) unless you have a very good reason.
- Update the relevant `README.md` when you add a command, endpoint, or
  environment variable.

## Reporting issues

Open a GitHub issue with: what you ran, what you expected, what happened, and
the relevant log output (`LOG_LEVEL=debug` helps a lot). Security issues —
please don't open a public issue; contact the maintainers directly.
