# Brag Plan: Interlock

## What is this app?

Interlock turns a spoken development update into a structured claim and immediately alerts both people when two active claims overlap.

## The angle

The problem is familiar and expensive: two people (or their coding agents) begin the same work without knowing it. Interlock changes the interaction from checking a dashboard later to receiving a human-facing interrupt at the moment it matters.

## Hook (first 2–3 seconds)

`Two agents. One module. No warning.` appears over two parallel claim cards converging on `auth`.

## Key moments (the middle)

- A spoken update becomes an offline transcript and a three-field, grammar-constrained intent.
- A live WebSocket claim enters the shared scope store.
- A second `auth` claim collides and produces a full-screen, haptic-style interrupt on both phones.

## Outro / punchline

`Interlock` holds on screen with the line: `Know before you duplicate.`

## User flow worth showing

Speak an update → extract `{ scope, summary, rationale }` locally → post an intent → detect a matching active scope → deliver the interrupt.

## Tone

- Preset: app-store
- Creative direction: a clean, credible developer-tool launch film with one moment of unmistakable urgency
- Interpretation: restrained dark UI, generous spacing, crisp feature-card motion, and a single red alert beat for the conflict.

## Format: landscape — 1920x1080
## Duration: 20 seconds

## Visual identity (from the project)

- Background: `#0b0f17`
- Accent: `#2563eb`
- Text: `#e6e9f0`
- Display font: system-ui, sans-serif
- Body font: system-ui, sans-serif
- Strongest visual element: the dark client test bench with its blue action controls, connected-state pill, and red interrupt event.

## Share copy (draft)

Interlock turns spoken development intent into a real-time signal, so overlapping work is interrupted before it becomes a merge conflict.

## Audio direction

- Role: upbeat, low-profile product-launch bed with crisp interface accents
- Music: `happy-beats-business-moves-vol-10-by-ende-dot-app.mp3` (109.96 BPM)
- Music treatment: fade in under the hook; keep music below copy and let the conflict alert cut through; short, clean fade at the outro
- Music cue guidance: use the beat grid around 2.46s, 6.82s, 11.47s, and 15.82s; reserve the 15.82s strong cue for the interrupt reveal and 18.01s for the final Interlock lockup
- Audio-reactive treatment: subtle; let a blue status glow and the final lockup breathe with the bed, without waveform decoration
- SFX posture: sparse, motion-matched interface taps, one warning pulse, and one resolved landing tone
- Audio-coupled moments: typed hook, intent-card arrival, collision alert, final lockup
- Restraint rule: no voiceover and no continuous UI sound effects.

## Storyboard

### Scene 1 — Collision Course — 3s

Two clean, dark claim cards slide in from opposite sides: `Agent A → auth` and `Agent B → auth`. The hook appears: `Two agents. One module. No warning.`

Sequential/interaction: yes — the two cards arrive one after another, then converge.

Audio intent: immediate but composed; a soft beat-start and two short card arrivals.

Audio-coupled idea: two subtle key/tap accents on the card arrivals.

Music: starts at 0s, clean upbeat bed.

Transition mood: smooth wipe → Scene 2

### Scene 2 — Speak the Intent — 4s

Show a phone-style interface. A waveform and transcript type in: `Starting on the auth refactor.` It resolves into an intent card with `scope: auth`, `summary`, and `rationale`; a small `On-device` badge confirms the local pipeline.

Sequential/interaction: yes — transcript, then scope, summary, and rationale appear in sequence and hold together.

Audio intent: precise and reassuring.

Audio-coupled idea: restrained typing ticks for the transcript; the final intent card lands on the 6.82s beat-grid window.

Music: steady, underneath the extraction animation.

Transition mood: clean slide → Scene 3

### Scene 3 — Shared State — 4s

The structured intent travels through a blue WebSocket line into the dark service panel. A compact claim-store card records `auth · active`; a `Connected` pill turns green.

Sequential/interaction: yes — intent packet, socket line, and active-claim card arrive one by one.

Audio intent: forward motion with a quiet confirmation pulse.

Audio-coupled idea: packet travel and a single confirmation ding when the active claim is visible around 11.47s.

Music: maintain momentum.

Transition mood: smooth wipe → Scene 4

### Scene 4 — Interrupt — 5s

A second phone posts the same `auth` scope. The scene pauses briefly, then both phone cards receive a full-width red alert: `Active claim detected` and `Interrupt delivered in real time.` The alert lands on the 15.82s strong cue and holds long enough to read.

Sequential/interaction: yes — second post, matching scope highlight, then both alerts fire together.

Audio intent: one controlled, unmistakable warning pulse; no chaos.

Audio-coupled idea: warning pulse at the conflict reveal and a tiny haptic-like double tick.

Music: briefly duck under the alert, then recover.

Transition mood: soft crossfade → Scene 5

### Scene 5 — Interlock — 4s

The red alert resolves into the blue Interlock lockup. Final copy: `Know before you duplicate.` A small line reads `On-device intent. Real-time coordination.`

Sequential/interaction: none — the lockup settles and holds.

Audio intent: confident close.

Audio-coupled idea: final logo/lockup lands near the 18.01s strong cue, with one soft success tone.

Music: final warm sustain then a clean fade.

Transition mood: fade to black

**Music mood for this video:** upbeat, clean, technical.

**Audio summary:** A polished low-volume music bed supports the story; interface details and one warning pulse make the collision memorable without turning the video into a notification demo.
