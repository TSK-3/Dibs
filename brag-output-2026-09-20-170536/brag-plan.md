# Brag Plan: Interlock — 45s Monochrome Film

## What is this app?

Interlock is a coordination layer that stops AI coding agents from duplicating work: a human declares intent on a phone, the claim registers, and the colliding party gets a full-screen interrupt before the damage.

## The angle

A black-and-white Apple/Linear-style launch film where contrast is the accent. The story is told entirely through screens, cursors, and UI state changes — no faces, no hands, no voiceover. The only color in the film is functional: two agent cursor accents (blue / amber) so the viewer can track who is who. Restraint is the brand.

## Hook (first 2–3 seconds)

Full-screen dark IDE, two colored cursors already moving and typing in different files. No title, no sting — just keystrokes. Bottom-left caps: `TWO AGENTS. ONE CODEBASE. NO IDEA.`

## Key moments (the middle)

- Both cursors converge on `auth/token-validation.ts` from opposite ends; split-screen holds the unresolved tension.
- Phone capture: press-and-hold mic pulse, letter-by-letter transcript, structured card resolving, latency counter ticking top-right and settling — the on-device proof, prominent.
- Single white-flash frame + low thump: second phone buzzes face-down; full-screen black alert with stark white text.
- Split phones exchange `let me finish first`; back in the IDE one cursor dims and pauses, the other works on.

## Outro / punchline

Cut to black. `Interlock` in wide-tracked white, tagline in grey. One white-to-black pulse in the wordmark negative space. Stillness.

## User flow worth showing

Parallel agent edits → converging cursors → spoken intent → structured claim + latency proof → white-flash buzz → full-screen interrupt → two-way reply → one cursor yields → lockup.

## Tone

- Preset: cinematic (restrained grade of it — editorial, still, contrast-driven)
- Creative direction: black-and-white product film; hard deliberate cuts; diegetic sound only; motion-graphics precision, zero AI-video tells.
- Interpretation: slow push-in on the IDE, then hard cuts only. Stillness does the heavy lifting; the flash frame + thump is the single loudest moment in the film.

## Format: landscape — 1920x1080, 30fps
## Duration: 45 seconds (explicit user direction; extends brag's 15–25s default)

## Visual identity (user-specified, overrides project palette)

- Background: `#000000` / near-black `#0A0A0A`, flat — no gradients, no ambient glows
- Text: `#FFFFFF` primary; greys `#C9C9C9` body, `#8C8C8C` secondary, `#808080` dimmest text (AA floor on black)
- Agent A accent: cool electric blue — cursor/label `#7AA5FF` (text-safe), cursor block `#4C8DFF`
- Agent B accent: muted amber — cursor/label `#D9A441`, cursor block `#B97F26`
- These two accents appear ONLY on cursor blocks, line-selection glows, and floating `Agent A` / `Agent B` labels. Everything else is strictly black/white/grey.
- Display font: system-ui geometric stack, tight tracking on labels; wordmark with generous letter-spacing
- No human figures, faces, or hands in any frame. No morphing geometry, no drifting UI, no warping text.

## Share copy (draft)

Shot in black and white: two agents, one file, and a phone call that arrives before the collision. Interlock — I'll tell you before you ask.

## Audio direction

- Role: DIEGETIC ONLY — no music track by explicit direction. Quiet throughout so the buzz thump lands as the loudest single moment.
- Elements: faint rhythmic mechanical keyboard clicks under the IDE (keypress WAVs, low volume, varied); soft tone under mic capture; one sharp low thump synced exactly to the 22.0s white flash; sparse low device ticks (mic press, card resolve, reply send); total silence 40–45s.
- SFX: `keyboard/keypress-*.wav` (003/007/011/015/019/023/027/031), `interface/bong_001` (soft tone), `impact/impactSoft_heavy_002` (the thump, 0.9 — loudest), `interface/click_003`, `interface/drop_001`, `interface/switch_002` (sparse device ticks only)
- Audio-coupled moments: keystroke visuals, mic press, transcript letters (sparse), card resolve, white flash + 2–3px shake, alert landing, reply send/receive, wordmark fade (silence).
- Restraint rule: no voiceover, no bed, no ambience. If it isn't on screen making the sound, it stays quiet.

## Storyboard

### Scene 1 — Cold Open — 8s (0–8)

Full dark IDE: file tree left, code center. Blue cursor (Agent A) types in `api/routes.ts`; amber cursor (Agent B) types in `utils/helpers.ts`. Code lines stream in staggered. Slow push-in (scale 1→1.03, 0–8). Cursors blink finite, then solid. Key clicks throughout. Overlay bottom-left grey caps at 1.5s: `TWO AGENTS. ONE CODEBASE. NO IDEA.` Holds.

Sequential: tree → cursors → streaming lines → overlay.

Audio: faint keypress rhythm only.

Transition: hard cut → Scene 2

### Scene 2 — Collision Forming — 6s (8–14)

Split-screen: left pane Agent A's file, right pane Agent B's file. Both cursors travel toward `auth/token-validation.ts` (tree highlight flips per side), landing on the same line range with subtle grey row glow + colored line bars. Everything stops moving at ~12.5s. Two beats of stillness — unresolved tension. Sparse clicks, then quiet.

Sequential: panes in, cursor travel, filename convergence, grey highlight, stillness.

Transition: hard cut → Scene 3

### Scene 3 — Capture — 8s (14–22)

Phone screen centered, white-on-black. Press-and-hold mic button (white ring expands 14.3–15.5, greyscale waveform bars). Transcript types letter-by-letter, monospace: `Starting on the auth refactor.` (15.5–18.5). Structured card resolves beneath (19–20): `scope: auth`. Latency counter top-right ticks (19–21) and settles bold white `184ms` (21.2). Hold.

Sequential: mic pulse → letters → card → counter settle.

Audio: soft tone under capture, sparse letter ticks, soft resolve tick.

Transition: HARD CUT, sharpest edit in the film → Scene 4

### Scene 4 — Interrupt — 10s (22–32)

Frame 1 (22.0): single pure-white flash frame + 2–3px two-frame shake + low thump (loudest moment). Settles to desk: laptop mid-edit left, phone face-down right, both lit only by alert glow. Full-screen black alert, stark white: `Karthik just claimed auth — you're about to duplicate this.` (22.5–32, long readable hold). No faces anywhere.

Sequential: flash → desk reveal → alert → hold.

Audio: thump at 22.0 exactly, then near-silence.

Transition: hard cut → Scene 5

### Scene 5 — Resolution — 8s (32–40)

Split phones (32–36.5): `let me finish first` sent, matching confirmation lands. Hard internal cut (36.5) back to IDE: Agent B cursor dims to 35% (keeps amber), Agent A streams new lines uninterrupted. Grey caption: `NO DASHBOARDS. NO CHECKING IN. IT JUST TELLS YOU.` (37–40).

Sequential: exchange → IDE return → dim/yield → caption.

Audio: two sparse device ticks (send/receive), few soft key clicks under A, then quiet.

Transition: cut to black → Scene 6

### Scene 6 — Close — 5s (40–45)

Black. `Interlock` fades in, white, wide tracking (40.5–41.5). Tagline grey: `I'll tell you before you ask.` (42). Single pulse: the gap between `Inter` and `lock` flashes white-to-black once (~43.5). Otherwise still. Hold to 45.

Sequential: wordmark → tagline → one pulse → stillness.

Audio: silence.

**Music mood for this video:** none — diegetic sound only, by design.

**Audio summary:** Keyboards whisper, a soft tone breathes under capture, one thump cracks the film in half at 22s, and the close plays in total silence.
