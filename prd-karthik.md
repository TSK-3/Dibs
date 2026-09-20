# PRD — Karthik: Backend, Interrupt Logic & Pitch
## iQOO Hackathon 2026 — Team Insomniacs

---

## 1. The Idea (shared context for all three PRDs)

We're building a **live interrupt system** for people whose AI coding agents work on
a shared codebase. Today, if two teammates each set an agent loose on overlapping
work, nobody finds out until a merge conflict or duplicated effort shows up later.
Existing tools (Vibsync, Bothread, AutoBot-AI) solve this agent-to-agent, on a
dashboard you have to check. We solve it **human-to-human, on the phone, in real
time**: you speak your intent, and if it overlaps with what a teammate already
claimed, their phone buzzes *right now* — before either of you wastes the work.

**Flow:** speak → on-device transcription → on-device small-model extraction into
structured JSON (scope/summary/rationale) → posted to backend → backend checks scope
overlap against active claims → if overlap, targeted push to the conflicting
teammate's phone.

**Differentiator to hold onto under judge pressure:** the claim/lock mechanic itself
isn't new — several MCP tools do it agent-side already. What's new is getting the
signal to a *person*, hands-free, in real time, fast enough to matter. "I'll tell you
before you ask."

---

## 2. Your Ownership

You own the system's brain — the backend that decides what counts as a conflict and
who gets interrupted — plus the pitch. This PRD is the contract the other two build
against, so get the schema right early and communicate any change to both of them
immediately.

## 3. What You're Building

### 3.1 WebSocket Server
- Node.js, single process (deliberately not split into microservices — 30-hour
  budget doesn't allow the infra overhead)
- Accepts connections from phone clients, keyed by `user_id` + `team_id`
- Handles reconnects gracefully — venue wifi *will* drop mid-demo

### 3.2 In-Memory Store + JSON Snapshot
- Active claims: `{ scope, user_id, summary, rationale, timestamp }`
- Snapshot to disk on every write (cheap insurance against a crash mid-demo)
- No database — this is a deliberate scope cut, don't second-guess it under time
  pressure

### 3.3 Scope-Overlap Matcher
- Core logic: on `post_intent`, check the store for any other active claim with the
  same `scope` value
- Scope is a **closed enum** (matches the module list Surya's model is constrained
  to) — exact string match, not fuzzy. Simplicity here is a feature, not a shortcut.
- On overlap: emit an `interrupt` message to the claiming user's socket AND the
  original claimant's socket, so both sides see it

### 3.4 Message Contract (authoritative — share this verbatim with Tejashwin & Surya)

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

**Server → Client, acknowledgment (no conflict):**
```json
{
  "type": "ack",
  "status": "claimed",
  "scope": "auth"
}
```

**Server → Client, interrupt push (conflict found):**
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
{
  "type": "complete_intent",
  "user_id": "karthik",
  "scope": "auth"
}
```

Do not change field names without updating this file and telling both teammates —
this schema is the seam the whole system depends on.

### 3.5 MCP Tool Interface (stretch goal, only after 3.1–3.4 work end-to-end)
- Wrap the same `post_intent` / `check_intent` / `complete_intent` logic as MCP tools
- Lets a real coding agent (Cursor, Copilot) call in directly instead of a human
  speaking
- Cut this first if time runs short — it is not required for the core demo

### 3.6 Pitch & Submission
- Dashboard: switch problem statement from FinTech/Commerce to Developer Tools
  (blocking, do before Phase 1 deadline)
- Build the required deck/document (PDF/PPT, ≤25MB)
- Fill submission fields: Android proficiency, LLM proficiency, prior builds (you
  have real material — MochaTrade/VeriTone, SIH), "what makes you stand out"
- Prep answers for likely judge questions: competitor differentiation, on-device
  proof, conflict-resolution edge cases (see prior conversation for the full list)
- Own the live narration during the demo

## 4. Acceptance Criteria
- [ ] Two phone clients can each post an intent and see an `ack`
- [ ] Posting an overlapping scope from client B triggers an `interrupt` push to
      client A within ~1 second
- [ ] Server survives a client disconnect/reconnect without losing state
- [ ] JSON snapshot on disk can restore state after a server restart
- [ ] Deck and dashboard submission complete before 22 Sep deadline

## 5. Build Order
1. WebSocket server + `post_intent`/`ack` round trip (no matching logic yet)
2. Scope-overlap matcher + `interrupt` push
3. Reconnect handling + JSON snapshot
4. Integration test with Tejashwin's app once his client can send real messages
5. MCP wrapper (only if time remains)
6. Deck + pitch prep, in parallel with the above once core loop works
