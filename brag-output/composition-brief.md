# Hyperframes Composition Brief: Interlock

## Objective
Create a short launch-style brag video for Interlock (Team Insomniacs, iQOO Hackathon 2026).

## Output
- Composition directory: `brag-output/composition/`
- Rendered video: `brag-output/brag.mp4`
- Format: landscape — 1920x1080
- Duration: 20 seconds

## Source Material
- Project root: `C:\Users\theka\Downloads\IS`
- Primary files read: `interlock-architecture.md`, `PITCH.md`, `README.md`, `public/index.html` (test bench)
- Product name: Interlock
- Tagline / strongest claim: "I'll tell you before you ask." / "Know before you duplicate."
- Key UI or visual moment to recreate: the dark client test bench with blue action controls, Connected-state pill, claim-store card (`auth · active`), and the red interrupt event (`Active claim detected`)
- Copy that must appear verbatim:
  - `Two agents. One module. No warning.`
  - `Starting on the auth refactor.`
  - `scope: auth`
  - `Active claim detected`
  - `Interrupt delivered in real time.`
  - `Interlock`
  - `Know before you duplicate.`
  - `On-device intent. Real-time coordination.`

## Creative Direction
- Tone preset: app-store
- Creative direction: a clean, credible developer-tool launch film with one moment of unmistakable urgency
- Interpretation: restrained dark UI, generous spacing, crisp feature-card motion, single red alert beat for the conflict. Pacing is composed, not frantic. Readability first.
- Angle: Two people (or their coding agents) begin the same work without knowing it. Interlock changes the interaction from checking a dashboard later to receiving a human-facing interrupt at the moment it matters.
- Hook: `Two agents. One module. No warning.` over two converging `auth` claim cards (first 2–3s)
- Outro / punchline: Interlock lockup + `Know before you duplicate.`
- Avoid:
  - Generic SaaS language ("streamline your workflow" banned)
  - Abstract filler visuals
  - Unrelated visual redesign

## Visual Identity
- Background: `#0b0f17`
- Text: `#e6e9f0`
- Accent: `#2563eb`
- Alert red: `#b91c1c` background with `#ffffff` text (contrast-safe), glow `#ef4444`
- Success green: `#16a34a` pill with `#ffffff` text
- Display font: system-ui, sans-serif (no webfont — lint `font_family_without_font_face`)
- Body font: system-ui, sans-serif
- Visual references from the project: dark test bench, blue WebSocket action controls, Connected pill, JSON `post_intent` / `interrupt` message contract, closed scope enum

## Storyboard
Use the storyboard in `brag-output/brag-plan.md` as the creative contract.

Scene summary:
1. Collision Course — 3s (0–3) — two claim cards `Agent A → auth`, `Agent B → auth` converge; hook line reads
2. Speak the Intent — 4s (3–7) — phone UI, waveform + typed transcript `Starting on the auth refactor.`, resolves to intent card `{scope, summary, rationale}` + `On-device` badge
3. Shared State — 4s (7–11) — intent packet travels blue WebSocket line into service panel; claim-store card `auth · active`; `Connected` pill green
4. Interrupt — 5s (11–16) — second phone posts same `auth`; matching scope highlight; full-width red alert `Active claim detected` + `Interrupt delivered in real time.`, holds readable
5. Interlock — 4s (16–20) — red resolves to blue lockup `Interlock` + `Know before you duplicate.` + `On-device intent. Real-time coordination.`

## Audio
- Audio role: upbeat, low-profile product-launch bed with crisp interface accents
- Audio arc: composed start → precise extraction ticks → forward-motion confirmation → single warning pulse (ducked bed) → confident resolved close
- Music: `happy-beats-business-moves-vol-10-by-ende-dot-app.mp3` (109.96 BPM, 60s; use 0–20s)
- Music treatment: fade in under hook; keep bed at 0.32 below copy; duck briefly under conflict alert; short clean fade at outro
- Music cue guidance: preset `assets/music/cues/happy-beats-business-moves-vol-10-by-ende-dot-app.music-cues.json`; beat grid 0.27, 0.82, 1.37, 1.90, 2.46, 3.01, 3.55, 4.10, 4.64, 5.19, 5.74, 6.28, 6.82, 7.35, 7.79, 8.22, 8.73, 9.29, 9.83, 10.38, 10.93, 11.47, 12.02, 12.56, 13.11, 13.64, 14.20, 14.73, 15.28, 15.82, 16.38, 16.93, 17.47, 18.01, 18.55, 19.10, 19.64. Strong cues in window include 15.82 and 18.01. Plan: card arrivals on early beats; intent card lands near 6.82; claim confirmation near 11.47; warning re-pulse beat-locked at 15.82 (±0.15s); final lockup beat-locked at 18.01 (±0.15s). 1–3 strong locks only. Readability wins over snapping.
- Audio-reactive treatment: subtle; blue status glow + final lockup breathe with bed RMS. No waveform/equalizer visuals, no music-note graphics, no strobing.
- Audio-coupled moments:
  - hook cards arrival — card slide accents
  - transcript typing + intent-card landing — typing ticks + soft landing
  - packet travel + claim confirmation — travel tick + confirmation ding near 11.47
  - collision alert — one warning pulse at reveal + tiny haptic double tick; re-pulse at 15.82 strong cue
  - final lockup near 18.01 — one soft success tone
- SFX selection guidance: app-store light layer at 0.65–0.75 volume; card-like reveals use card/click family; major payoff uses one announcement cue; keep palette coherent (interface + casino + one impact bell). Prefer low HF-risk files for repeated moments.
- SFX analysis guidance: `<skill-dir>/assets/sfx/sfx-analysis.md` — prefer `interface/click_003.ogg`, `interface/drop_001.ogg`, `casino/card-slide-1.ogg`, `impact/impactSoft_medium_001.ogg`, `impact/impactBell_heavy_000.ogg` (all low/medium risk, isolated use)
- Exact SFX choice: Hyperframes chooses filenames, timestamps, density, volume based on implemented animation.
- Audio files: copy chosen music + Hyperframes-selected SFX into `brag-output/composition/assets/`

## Hyperframes Instructions
Load the composition-building Hyperframes domain skills — `hyperframes-core` (composition contract + `data-*` timing), `hyperframes-animation` (motion), `hyperframes-creative` (design spec, beats, audio-reactive), `hyperframes-keyframes` (seek-safe keyframes), and `hyperframes-cli` (lint/check/render). /brag is its own workflow: do not enter the `hyperframes` entry-point intent interview and do not route into its generic promo / launch-video workflow. Prefer native Hyperframes conventions over anything in `/brag`.

Requirements:
- Show at least one real UI, copy, or visual element from the source project.
- Keep all text readable in the final render.
- Keep the video within 15-25 seconds (exactly 20s).
- Include the planned music/SFX layer unless audio was explicitly disabled or documented as intentionally silent.
- Treat /brag audio notes as guidance, not a fixed cue sheet. Choose SFX after the visual animation exists.
- Treat music cue metadata as optional timing hints. Hyperframes decides exact animation timing and should ignore cues that hurt readability, scene pacing, or the product story.
- Major reveals may move toward nearby strong cues within about 0.15s. Smaller entrances may align to nearby beat points within about 0.10s. Use only 1-3 strong cue locks in a 15-25s video unless the edit clearly benefits from more.
- Use SFX to support motion and interaction: card sounds for card-like reveals, short announcement cues for major payoffs, key/click sounds for text or user actions, and restraint when the edit is already busy.
- Honor planned music treatment such as fade-outs, ducking, beat-aligned reveals, or letting a final SFX ring over the music, using the best Hyperframes-supported implementation.
- When music is present and the treatment is not `none`, consider Hyperframes audio-reactive workflow: extract audio data and use RMS/frequency bands for subtle, brand-specific motion. Good targets are glow, depth, background warmth, card presence, title emphasis, or other existing visual elements. Avoid waveform/equalizer visuals, musical-note graphics, generic particle systems, strobing, or heavy pulsing.
- Use local assets for audio and any required runtime/media dependencies when possible.
- Run `hyperframes check` before render — it is brag's single gate.
