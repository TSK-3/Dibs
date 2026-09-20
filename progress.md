# Progress — What We Built

**Team Insomniacs — iQOO Hackathon 2026 (Karthik's part: backend, interrupt logic)**

---

## The idea in one line

When two people (or two AI agents) are about to work on the same part of the code, this backend catches it **instantly** and buzzes both of them — before anyone wastes time.

---

## What is built and working ✅

### 1. The WebSocket server (the brain)

- One simple Node.js program. No database, no cloud, no complicated setup.
- Everyone connects with their name and team: `ws://localhost:8080/ws?user_id=karthik&team_id=insomniacs`
- Works with phones, laptops, tabs — multiple devices per person is fine.

### 2. The interrupt system (the main feature)

- Person A says "I'm working on auth" → server says "ok, claimed ✅"
- Person B later says "I'm working on auth" → **both phones get a warning at the same time**, telling them who they're about to collide with and what the other person is doing.
- Measured speed: the warning arrives in about **3 milliseconds**. The target was 1 second. We beat it by ~300x.
- Person A can say "I'm done with auth" → the spot frees up and someone else can claim it.

### 3. Memory that survives crashes

- Every claim is saved to a small JSON file on disk the moment it happens.
- If the server crashes or restarts, it reads the file and everything is still there. Nothing is lost.
- Even a broken/corrupted file can't kill the server — it gets moved aside and the server starts fresh.

### 4. Wifi-drop handling (for the demo venue)

- Venue wifi will drop connections. When someone reconnects with the same name, they get a full "here's what everyone on the team is doing right now" message, so their screen fills back in.
- The server pings quiet connections to detect dead ones and cleans them up.

### 5. Safety features (so the demo can't be embarrassing)

- **Password option** — can require a shared token so only our team can connect.
- **Flood protection** — if someone spams thousands of messages, they get politely slowed down instead of crashing the server.
- **Input checking** — weird names, unknown scopes, overly long text: all get clear error messages back, never a crash.
- **Crash safety** — if the server ever crashes, it saves everything first, then exits. A restart loses nothing.
- **Live stats page** — visit `/stats` to see real numbers: how many intents, conflicts, interrupts. Good for the pitch.

### 6. Test bench for the live demo

- Open `http://localhost:8080/` in two phone browsers. Type a name, press connect, speak an intent. Watch the other phone buzz. That's the demo.

### 7. MCP tools (bonus / stretch goal)

- Coding agents like Cursor or Copilot can claim scopes directly through 3 tools (`post_intent`, `check_intent`, `complete_intent`).
- So even an AI agent writing code triggers the same phone warnings. This was listed as "cut first if time runs short" — it's done anyway.

### 8. Narrated demo script

- `npm run demo` plays the entire story by itself: person claims → second person collides → both buzz → conflict resolved. Good for rehearsal and backup if live phones misbehave.

---

## The test results

**21 automated tests, all passing.** They check everything the PRD demands:

| PRD requirement | Status |
|---|---|
| Two clients can each post an intent and get an ack | ✅ tested |
| Overlapping scope pushes an interrupt to BOTH people in under 1 second | ✅ tested (~3ms) |
| Server survives disconnect/reconnect without losing state | ✅ tested |
| JSON snapshot restores state after a server restart | ✅ tested |
| Plus ~16 more tests: team separation, re-claims, bad input, crashes, floods, auth, stats | ✅ all passing |

---

## How to run it

```bash
npm install
npm start          # server + test bench on port 8080
npm test           # run all 21 tests
npm run demo       # watch the whole story play out
```

If port 8080 is blocked on your Windows machine: `PORT=9090 npm start` (this happens on some laptops — it's a Windows thing, not our bug).

---

## What the teammates need to know

- **Surya (speech model):** your module name must be one of the fixed list (auth, payments, ui, etc.). Get the exact list from `http://localhost:8080/config`. Everything else in the message is free text.
- **Tejashwin (app):** connect with the URL above. The server immediately sends a `state` message with everyone's claims — use it to fill the screen, and it arrives again after every reconnect. When an `interrupt` arrives, buzz the phone and show the `message` field — it already reads like a human sentence.

---

## What's left (honestly)

- [ ] Replace the default module list with Surya's exact final list (one line in config)
- [ ] One combined rehearsal with real phones + real voice
- [ ] Deck, pitch, and submission before **22 Sep** (the PRD's own deadline item — not code)

---

## Files, in plain words

| File | What it is |
|---|---|
| `src/server.js` | The main server — connections, safety, stats |
| `src/protocol.js` | Checks every message against the agreed format |
| `src/matcher.js` | Decides "is this a conflict?" and writes the warning |
| `src/store.js` | The memory + the save-to-disk part |
| `src/config.js` | All the settings in one place (scopes, ports, limits) |
| `src/ratelimit.js` | The flood protection |
| `src/metrics.js` | Counts things for the /stats page |
| `src/logger.js` | Clean logs |
| `src/mcp/mcp-stdio.js` | The agent tools (stretch goal) |
| `public/index.html` | The phone test bench page |
| `scripts/demo.js` | The self-playing demo |
| `test/` | The 21 tests |
