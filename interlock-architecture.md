# Interlock (working title)
### iQOO Hackathon 2026 — City Battles — Team Insomniacs
### Developer Tools Track

---

## 1. The Problem

Teams using AI coding agents (Cursor, Copilot, OpenCode, etc.) have no way to know
in real time when two people's agents are about to work on overlapping code. Today
this surfaces later — as a merge conflict, wasted tokens, or duplicated effort —
long after the damage is done. Existing coordination tools for this (Vibsync,
Bothread, AutoBot-AI, Agent-MCP) work agent-to-agent, over a dashboard someone has
to actively check. That's a **pull** model: ask, and it tells you.

## 2. The Idea

Interlock is a **push** model: you speak your intent, and if it collides with what
a teammate already claimed, *their phone buzzes right now* — before either of you
wastes the work. Nobody has to check anything. The system interrupts you.

**One-line pitch:** *"I'll tell you before you ask."*

**What's actually new here, stated honestly:** claim/lock systems for coding agents
already exist. What doesn't exist is getting that signal to a *human*, hands-free,
fast enough to matter, on the device already in their pocket. That's the real
differentiator — not "we invented conflict detection," but "we're first to make the
interrupt land on a person in time to matter."

## 3. End-to-End Flow

1. User speaks: *"starting on the auth refactor"*
2. On-device STT transcribes offline (proof: works in airplane mode)
3. On-device small LLM extracts structured intent — `{scope, summary, rationale}` —
   via grammar-constrained decoding against a closed taxonomy of repo modules
4. Structured intent posted to backend over WebSocket
5. Backend checks the claim against all other active claims for exact scope overlap
6. If overlap: targeted push interrupt to the conflicting teammate's phone —
   haptic buzz + full-screen alert, naming who claimed what and why
7. If no overlap: silent ack, claim recorded
8. Claim releases on explicit `complete_intent` or auto-expires after a timeout

---

## 4. System Architecture

```
┌─────────────────┐          ┌─────────────────┐
│   Phone A        │          │   Phone B        │
│  (Tejashwin's    │          │  (Tejashwin's    │
│   app shell)      │          │   app shell)      │
│                   │          │                   │
│  ┌─────────────┐ │          │ ┌─────────────┐ │
│  │ STT (offline)│ │          │ │ STT (offline)│ │
│  └──────┬──────┘ │          │ └──────┬──────┘ │
│         │         │          │        │         │
│  ┌──────▼──────┐ │          │ ┌──────▼──────┐ │
│  │ On-device LLM│ │          │ │ On-device LLM│ │
│  │ (Surya's     │ │          │ │  pipeline)   │ │
│  │  pipeline,   │ │          │ │              │ │
│  │  GBNF-       │ │          │ │              │ │
│  │  constrained)│ │          │ │              │ │
│  └──────┬──────┘ │          │ └──────┬──────┘ │
│         │         │          │        │         │
└─────────┼─────────┘          └────────┼─────────┘
          │   WebSocket                 │   WebSocket
          │   (post_intent)             │   (post_intent)
          └───────────┬─────────────────┘
                       │
              ┌────────▼─────────┐
              │  Backend (Node)   │
              │  — Karthik's      │
              │    ownership      │
              │                   │
              │  ┌─────────────┐ │
              │  │ In-memory    │ │
              │  │ claim store  │ │
              │  │ + JSON       │ │
              │  │ snapshot     │ │
              │  └──────┬──────┘ │
              │         │         │
              │  ┌──────▼──────┐ │
              │  │ Scope-      │ │
              │  │ overlap     │ │
              │  │ matcher     │ │
              │  └──────┬──────┘ │
              │         │         │
              │  ┌──────▼──────┐ │
              │  │ Interrupt    │ │
              │  │ dispatcher   │ │
              │  └──────┬──────┘ │
              │         │         │
              │  ┌──────▼──────┐ │
              │  │ MCP tool     │ │
              │  │ interface    │ │
              │  │ (stretch)    │ │
              │  └─────────────┘ │
              └────────┬─────────┘
                       │  interrupt push (targeted)
                       ▼
              Phone whose scope collided
              → haptic buzz + full-screen alert
```

**Design principle behind the collapse:** one backend process instead of split
services, in-memory store instead of Postgres/pgvector. This is a deliberate risk
cut for a 30-hour build, not a technical limitation of the idea — the pitch and the
"what's next" answer can say so plainly if a judge pushes on scale.

---

## 5. Tech Stack

| Layer | Choice | Why |
|---|---|---|
| Phone app | React Native (Expo) | Team's existing strength is React/Node, not native Android; fastest path to a working app |
| STT | `@react-native-voice/voice` / `expo-speech-recognition` | Wraps Android's built-in offline `SpeechRecognizer` — provably on-device |
| On-device LLM | Qwen2.5-0.5B-Instruct, GGUF Q4_K_M (~350MB) | Best instruction-following at this size; fallback: Llama 3.2 1B Q4 |
| LLM runtime | `llama.rn` | React Native bindings for llama.cpp, fully on-device |
| Structured output | GBNF grammar-constrained decoding | Makes the model structurally incapable of invalid JSON — the single highest-leverage technical decision in the build |
| Backend | Node.js, WebSocket | Single process, no split services |
| State | In-memory + JSON snapshot | No database — deliberate scope cut |
| Haptics/push | `expo-haptics`, `expo-notifications` | The buzz has to fire even from a locked/backgrounded phone |
| Agent integration | MCP tool interface | Stretch goal — lets a real coding agent post claims directly instead of a human speaking them |

---

## 6. Message Contract (authoritative)

**Client → Server, new intent:**
```json
{
  "type": "post_intent",
  "user_id": "karthik",
  "scope": "auth",
  "summary": "Refactoring token validation",
  "rationale": "Cleaning up auth module before demo",
  "timestamp": 1758000000000
}
```

**Server → Client, ack (no conflict):**
```json
{ "type": "ack", "status": "claimed", "scope": "auth" }
```

**Server → Client, interrupt (conflict found):**
```json
{
  "type": "interrupt",
  "from_user": "karthik",
  "scope": "auth",
  "summary": "Refactoring token validation",
  "message": "Karthik just claimed auth — you're about to duplicate this"
}
```

**Client → Server, task done:**
```json
{ "type": "complete_intent", "user_id": "karthik", "scope": "auth" }
```

Scope is a **closed enum**, matching both the LLM's GBNF grammar and the backend's
matcher exactly — free-text scope would never match cleanly between two people.

---

## 7. Feature Set

### Core (must-have for the demo)
- Voice → on-device transcription → on-device structured intent extraction
- Real-time push interrupt with haptic + full-screen alert
- Live on-device latency readout, visible throughout the demo
- Silent fallback chain (invalid model output → retry → keyword match) so nothing
  ever shows an error state on stage

### High-value additions (build if time allows)
- **Two-way reply** — the interrupted person can respond "go ahead" or "let me
  finish first" instead of just receiving a one-way alert; turns a notification
  system into a coordination system
- **Claim auto-expiry** — claims release automatically after a timeout if never
  explicitly completed, preventing stale locks
- **Swipe-to-dismiss false positives** — one-gesture dismissal if an interrupt isn't
  actually relevant
- **Claim history / activity feed** — scrollable log of who claimed what, when;
  doubles as visible proof of genuine dogfooding

### Roadmap (pitch as "what's next," don't build live)
- Hierarchical scope (`auth/login` vs `auth/signup`) instead of a flat enum
- Conflict severity tiers — exact overlap interrupts immediately, adjacent scope
  shows a lower-urgency badge instead
- Presence indicators (active/idle) before any claim is even posted
- Post-hoc savings metric — "N duplicate-work events prevented, ~X hours saved"
- Completed MCP integration so real agents post claims without a human speaking
- Wake-word hands-free trigger
- Lock-screen widget for live team claim status

---

## 8. Team & Ownership

| Person | Owns |
|---|---|
| **Karthik** | Backend, WebSocket server, claim store, scope-overlap matcher, interrupt dispatch, MCP interface (stretch), pitch & submission |
| **Tejashwin** | Phone app shell, WebSocket client, UI/UX, haptics & notifications — the physical "wow moment" |
| **Surya** | STT integration, on-device LLM, GBNF grammar, prompt design, fallback chain — the on-device proof |

Full individual PRDs with build order and acceptance criteria exist separately for
each person; this document is the shared reference all three build against.

---

## 9. Competitive Positioning (for judge Q&A)

**Existing tools that do something adjacent:**
- **Vibsync** — MCP coordination layer, agents `check_conflicts`/`claim` before
  editing
- **Bothread** — local MCP server, shared rooms, claim denial on conflict
- **AutoBot-AI** — agents announce/reserve scope with identity and intent
- **Agent-MCP** — live dashboard, "no more merge conflicts from simultaneous edits"

**Honest framing when asked "isn't this just X?":** *"Agent-side claim/lock systems
exist and work well — Vibsync and Bothread do this today. What's missing is getting
that signal to a human who's away from their laptop, hands-free, fast enough to
actually stop them before they start. That's the gap we're closing."*

---

## 10. Acceptance Criteria (system-level)

- [ ] Two phone clients can each post an intent and receive an `ack`
- [ ] An overlapping scope from client B triggers an `interrupt` push to client A
      within ~1 second
- [ ] STT + on-device LLM pipeline works with wifi fully off
- [ ] Grammar-constrained output is valid JSON 20/20 times across varied test
      sentences
- [ ] Server survives client disconnect/reconnect without losing state
- [ ] Haptic + full-screen alert fires even from a locked/backgrounded phone
- [ ] End-to-end latency (speech end → claim posted) is measured and displayed live

---

## 11. Build Order (cross-team)

1. Backend `post_intent`/`ack` round trip, no matching logic yet — **Karthik**
2. STT standalone, confirmed offline — **Surya**
3. Phone app scaffold + WebSocket client on a hardcoded fake payload — **Tejashwin**
4. Scope-overlap matcher + `interrupt` push — **Karthik**
5. On-device LLM + GBNF grammar + few-shot prompt tuning — **Surya**
6. Full pipeline integration: real transcript → real model output → real socket
   message → real interrupt — **all three**
7. Haptics/notifications polish, reconnect handling, latency readout — **Tejashwin
   + Karthik**
8. High-value additions (two-way reply, auto-expiry) if time remains — **all three**
9. Deck, submission, judge Q&A prep — **Karthik**, in parallel throughout

---

## 12. Open Items

- [ ] Dashboard problem statement — switch from FinTech/Commerce to Developer Tools
      before Phase 1 deadline (22 Sep 2026)
- [ ] Pitch deck/document (PDF/PPT, ≤25MB) — required for submission, not yet built
- [ ] Submission form fields — Android proficiency, LLM proficiency, prior builds,
      "what makes you stand out"
- [ ] Final project name — leaning toward *Interlock*, not locked in
