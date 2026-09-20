# Pitch Deck Outline — Live Interrupt (Team Insomniacs)

Keep to ~10 slides. Every slide answers a judge question before it's asked.

1. **Title** — Live Interrupt · Team Insomniacs · iQOO Hackathon 2026. Tagline: *"Your agent hears about the conflict before it writes the code."*
2. **The problem** — Teams run multiple AI coding agents on one codebase. Two agents start refactoring the same module simultaneously → merged PRs collide, hours vanish. Existing tools (Vibsync, Bothread, AutoBot-AI) are *dashboard* based — you find out by looking. Nobody looks.
3. **The insight** — The interrupt should come to *you*, human-to-human, in real time — like a phone call, not a status page.
4. **Demo slide** — screenshot/GIF of the two-phone flow: Tejashwin posts "auth" → Karthik's phone buzzes in <1s. (Record this with the test bench: `http://localhost:8080/` on two phones.)
5. **How it works** — 3 boxes: 🎤 on-device intent extraction (Surya) → ⚡ scope-overlap backend (Karthik) → 📱 app + buzz (Tejashwin). Emphasize: no DB by design, single process, ~5ms conflict latency.
6. **The architecture choice** — "We deleted the database." In-memory + JSON snapshot, written on every mutation. Crash-safe, zero infra, runs on a laptop during the demo. Deliberate scope-cut, not an accident.
7. **MCP stretch** — the same loop works for *agents themselves*: Cursor/Copilot call `post_intent` as a tool. Live interrupt for human ↔ human AND agent ↔ agent.
8. **Traction / demo proof** — 12 automated tests covering the acceptance criteria; conflict delivered in 5ms; state survives restarts (show the snapshot restore moment — it's dramatic).
9. **Roadmap** — fuzzy scope matching, claim TTLs, GitHub PR-status hooks, multi-team federation.
10. **Team + ask** — who built what; "vote for the tool that saves your next merge conflict."

## Judge Q&A prep

- **"Why exact matching, not fuzzy?"** → Predictability. A closed enum synced with the on-device model means zero false positives; a judge watching the demo sees deterministic behaviour. Fuzzy matching is on the roadmap once the model's module list stabilizes.
- **"What happens when the server dies?"** → Snapshot is written on every mutation and restored on boot; corrupt snapshots are backed up and the server starts empty rather than crashing. Verified by test.
- **"What about venue wifi?"** → Heartbeat reaps dead sockets; claims are keyed by identity, not by socket, so reconnects restore everything — the client gets a full `state` message on reconnect.
- **"Why no database?"** → 30-hour budget, single-process demo, snapshot writes are ~microseconds for our data volume. The right architecture is the one you can debug at 2am.
- **"How is this different from a shared dashboard?"** → Push vs pull. The interrupt arrives whether or not anyone opened a dashboard — that's the whole moat versus Vibsync/Bothread/AutoBot-AI.
- **"Scale?"** → Single-process in-memory is fine for a team (tens of users, hundreds of claims). The store is already isolated behind one class — swap in Redis/Postgres later without touching the protocol.

## Submission checklist (§3.6)

- [ ] **Category switched to Developer Tools** (do this FIRST — it was flagged as blocking)
- [ ] Record the two-phone demo video (use `npm run demo` narration as the script; show the 5ms interrupt number on screen)
- [ ] Export deck as PDF, **≤ 25MB** (compress images; the GIF on slide 4 is the usual culprit)
- [ ] Submission fields: team name, project one-liner, category, demo link/video, repo link
- [ ] Push repo; verify `npm install && npm test` works from a clean clone
- [ ] Deadline: **22 Sep** — submit day before
- [ ] Prep: each teammate can run the demo alone (`npm start` + two browser tabs) in case one laptop dies
