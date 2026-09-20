# Hyperframes Composition Brief: Interlock — 45s Hype Cut

## Objective
Create a high-energy 45-second product demo/hype video for Interlock (phone app for developer ↔ AI-agent coordination, Team Insomniacs, iQOO Hackathon 2026).

## Output
- Composition directory: `brag-output-2026-09-20-164141/composition/`
- Rendered video: `brag-output-2026-09-20-164141/brag.mp4`
- Format: landscape — 1920x1080
- Duration: 45 seconds (explicit user direction)

## Source Material
- Project root: `C:\Users\theka\Downloads\IS`
- Primary files read: `interlock-architecture.md`, `PITCH.md`, `README.md`
- Product name: Interlock
- Tagline / strongest claim: "I'll tell you before you ask."
- Key UI moments to recreate: mic-tap → waveform → transcript → extracting loader → structured intent card (scope: auth); WebSocket claim; face-down phone lighting up + shaking; full-screen red interrupt; two-way reply ("let me finish first"); claim-history feed; latency readout; Interlock lockup + app icon
- Copy that must appear verbatim:
  - `Two developers. Same codebase. No idea they're about to collide.`
  - `Starting on the auth refactor.`
  - `extracting intent...`
  - `scope: auth` / `summary: refactoring token validation`
  - `Karthik just claimed auth — you're about to duplicate this.`
  - `Before it became a problem.`
  - `let me finish first`
  - `No dashboards. No checking in. It just tells you.`
  - `Interlock`
  - `I'll tell you before you ask.`

## Creative Direction
- Tone preset: cinematic (nearest match for hype pacing / big-motion reveals)
- Creative direction: Linear/Vercel launch-video energy — confident, fast cuts, dark-mode UI, single red alert beat. No voiceover; on-screen text + UI motion carry the story.
- Interpretation: half-second beat-grid cutting in the opening, a hard cut into the wow moment, long readable holds on the alert (23–28s) and lockup (38–45s). Urgency from cutting rhythm, never flashing text. People represented abstractly via labeled devices (no stock footage).
- Angle: a near-miss story — two developers about to duplicate the auth refactor, and a buzz that arrives before the damage. The product is the timing.
- Hook: split-screen phones snap in on the beat grid; `Two developers. Same codebase.` overlays stack up.
- Outro / punchline: Interlock lockup + `I'll tell you before you ask.` + app icon with haptic pulse.
- Avoid: generic SaaS language, abstract filler, voiceover, flashing/unreadable text, emojis.

## Visual Identity
- Background: `#0b0f17`
- Text: `#e6e9f0` / secondary `#c3cad6`
- Accent: `#2563eb` (fills, lines, glows, pills with white text — contrast-safe)
- Alert: `#b91c1c` panel + `#ffffff` text + `#ef4444` halo
- Success: `#052e16` panel + `#4ade80` text + `#16a34a` border
- Display/body font: system-ui, sans-serif (no webfonts — lint `font_family_without_font_face`)
- Latency counter: monospace (ui-monospace) numerals

## Storyboard
Contract is `brag-output-2026-09-20-164141/brag-plan.md`.

Scene summary:
1. Collision You Can't See — 8s (0–8) — split phones snap in; 3 overlay lines on beats; shared `auth` highlight rhyme
2. Say It, Claimed — 10s (8–18) — mic tap → waveform → word-by-word transcript → extracting loader → intent card snap (16.02 lock) → latency settle (17.02)
3. The Buzz — 10s (18–28) — HARD CUT 18.02; desk w/ laptop + face-down phone; buzz+shake 21.01; alert slide-up 23.02; status flip; `Before it became a problem.`
4. Sorted in Seconds — 10s (28–38) — both phones; `let me finish first` tap 30.02; instant reply 32.02; feed scroll 33–37; overlay holds 34–37+
5. Interlock — 7s (38–45) — logo 38.52; tagline ~40; icon + haptic pulse ~41.5–42.5; bed fades 43–45; fade to black

## Audio
- Audio role: driving high-energy launch bed with crisp interface accents and one unmistakable warning hit
- Audio arc: full-energy open → precise/crisp setup ticks → ducked warning hit at alert → light satisfying payoff → bell close + fade
- Music: `happy-beats-business-moves-vol-1-by-ende-dot-app.mp3` (120.19 BPM; use 0–45s)
- Music treatment: bed at 0.34 from frame 0; duck under alert 23–24.5; clean fade 43–45
- Music cue guidance: preset `assets/music/cues/happy-beats-business-moves-vol-1-by-ende-dot-app.music-cues.json`; grid ≈0.5s (3.02…45.52); strong cluster 16.02–29.01. Locks (±0.15s): 16.02 intent snap, 18.02 hard cut, 21.01 buzz, 23.02 alert, 28.01 payoff cut, 38.52 logo beat. Small events snap ±0.10s. Readability wins ties; ~6 locks over 45s matches brag density.
- Audio-reactive treatment: subtle; blue glow, alert halo, logo breathe with bed. No equalizer/waveform decoration (mic waveform is diegetic UI, allowed).
- Audio-coupled moments: phone snaps (1.0/2.0), overlay lines, mic tap (9.0), transcript words, card snap (16.02), latency settle (17.02), hard-cut tick (18.02), buzz (21.01), alert hit (23.02), reply tap (30.02) + landing (32.02), feed ticks, logo bell (38.52), icon pulse (~42)
- SFX selection guidance: taps = `interface/click_003`; snaps = `casino/card-slide-1` + `interface/drop_001`; cuts = `impact/impactSoft_medium_001`; hard-cut tick = `interface/glitch_002`; buzz body = `impact/impactSoft_heavy_002` + tick; alert hit = `impact/impactSoft_heavy_002` at 0.8 (single, ducked bed); reply toggle = `interface/switch_002`; logo = `impact/impactBell_heavy_000`; pulse = `interface/drop_001` soft. Volumes 0.55–0.8, music 0.34.
- SFX analysis guidance: skill `assets/sfx/sfx-analysis.md` — low-risk for repeated ticks (click_003, drop_001), medium-risk isolated for reveals (card-slide-1, impactSoft_heavy_002, bell).
- Exact SFX choice: Hyperframes chooses final timestamps/density/volume from implemented animation.
- Audio files: copied into `composition/assets/` before build.

## Hyperframes Instructions
Load `hyperframes-core` (contract + `data-*` timing), `hyperframes-animation` (motion), `hyperframes-creative` (design, beats, audio-reactive), `hyperframes-keyframes` (seek-safe keyframes), `hyperframes-cli` (lint/check/render). /brag is its own workflow: do not enter the `hyperframes` entry-point intent interview or its generic promo workflow. Prefer native Hyperframes conventions.

Requirements:
- Show real product UI/copy from the brief in every scene.
- Every must-read line holds settled: short label ≥0.8s, sentences ≥0.3s/word (alert holds 23–28s, overlay holds 3s+).
- Exactly 45s total. Finite deterministic motion only (no `repeat:-1`, no clocks/random/network).
- Never tween `.clip` with autoAlpha/visibility — animate children. No CSS initial transform on GSAP-tweened nodes (use fromTo). Unique ids. Every `<audio>` has an id. No `crossorigin` on media.
- Music/SFX layer required (not disabled). Beat locks as listed; ignore any cue that hurts readability.
- `hyperframes check` is the single gate before render (0 errors; contrast AA 100%).
