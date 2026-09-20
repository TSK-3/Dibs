# Hyperframes Composition Brief: Interlock — 45s Monochrome Film

## Objective
Create a 45-second cinematic black-and-white product film for Interlock (coordination layer stopping AI coding agents from duplicating work). Apple/Linear launch-film grammar: sharp, editorial, restrained.

## Output
- Composition directory: `brag-output-2026-09-20-170536/composition/`
- Rendered video: `brag-output-2026-09-20-170536/brag.mp4`
- Format: landscape — 1920x1080, 30fps (`data-fps="30"`), 45 seconds exactly

## Source Material
- Project root: `C:\Users\theka\Downloads\IS`
- Primary files read: `interlock-architecture.md` (message contract, scope enum, on-device proof), `PITCH.md`, `README.md`
- Product name: Interlock
- Tagline: "I'll tell you before you ask."
- Key moments: dual cursors typing; convergence on `auth/token-validation.ts`; phone capture with latency proof; white-flash buzz + full-screen interrupt; reply exchange; yielding cursor; tracked-out lockup
- Copy that must appear verbatim:
  - `TWO AGENTS. ONE CODEBASE. NO IDEA.`
  - `auth/token-validation.ts`
  - `Starting on the auth refactor.`
  - `scope: auth`
  - `Karthik just claimed auth — you're about to duplicate this.`
  - `let me finish first`
  - `NO DASHBOARDS. NO CHECKING IN. IT JUST TELLS YOU.`
  - `Interlock`
  - `I'll tell you before you ask.`

## Creative Direction
- Tone preset: cinematic, restrained grade — stillness over motion, hard cuts only, no fades between scenes (single fade-in on the closing wordmark only)
- Interpretation: motion-graphics / screen-capture realism. NO human figures, faces, or hands in any frame. No morphing, no warping text, no drifting UI, no breathing decoratives. Every element is either static or on an explicit finite tween. If in doubt, simplify.
- Angle: contrast is the accent. The film is black/white/grey except two functional cursor colors.
- Hook: dark IDE, two colored cursors already typing, keystroke sound, caps overlay — no title, no sting.
- Outro: black frame, wide-tracked white wordmark, grey tagline, one gap-pulse, stillness.
- Avoid: color anywhere except the two cursor accents; gradients/glows beyond the specified cursor glow + alert glow; music; voiceover; emoji; boxed text (except the alert panel and specified pills/cards).

## Visual Identity (STRICT — overrides project palette)
- Background: `#000000`, panels `#0A0A0A`, hairlines `#2A2A2A`
- Text: `#FFFFFF` primary, `#C9C9C9` body/code, `#8C8C8C` secondary/comments, `#808080` dimmest permitted text (WCAG AA floor on black — nothing darker may carry text)
- Non-text decor (code bars, rails) may use darker greys freely
- Agent A blue: block `#4C8DFF`, label text `#7AA5FF`
- Agent B amber: block `#B97F26`, label text `#D9A441`
- These accents touch ONLY: cursor blocks, cursor line-selection glows, floating `Agent A`/`Agent B` labels, active-file markers. Nothing else.
- Fonts: system-ui geometric stack; labels tight tracking + uppercase; wordmark letter-spacing ~0.35em; transcript + code in ui-monospace stack (no webfonts — lint `font_family_without_font_face`)
- Code is monochrome syntax: white keywords, `#C9C9C9` plain, `#8C8C8C` comments. No color tokens ever.

## Storyboard
Contract is `brag-output-2026-09-20-170536/brag-plan.md`.

Scene summary:
1. Cold Open — 8s (0–8) — full IDE, both cursors type in different files, streaming lines, slow 1→1.03 push-in, caps overlay 1.5s+
2. Collision Forming — 6s (8–14) — split panes, cursors travel to same file/range, grey row glow, stillness from ~12.5
3. Capture — 8s (14–22) — phone UI: mic ring pulse, waveform, letter-by-letter transcript (15.5–18.5), card resolve (19–20), latency ticks top-right settling bold `184ms` (21.2)
4. Interrupt — 10s (22–32) — ONE white frame at 22.0 + 2–3px two-frame shake + thump; desk reveal; full-screen black alert, long hold
5. Resolution — 8s (32–40) — split-phone exchange (32–36.5), hard internal cut to IDE (36.5): B dims to 35% keeping amber, A streams on; grey caption 37–40
6. Close — 5s (40–45) — wordmark fade 40.5–41.5, tagline 42, single gap pulse ~43.5, still hold, silence

## Audio — DIEGETIC ONLY, NO MUSIC (explicit direction)
- Bed: none. Silence is a mix decision, not a gap.
- Elements: `keyboard/keypress-003/007/011/015/019/023/027/031` faint rhythmic clicks under IDE (0–14, sparse; few under A in S5); `interface/bong_001` soft tone under capture (14.2, low); `impact/impactSoft_heavy_002` THE thump at exactly 22.0, vol 0.9, loudest moment; sparse device ticks only where a screen makes the sound (`interface/click_003` mic press 14.3, letter ticks 16/17/18, `interface/drop_001` card resolve 19.5 low, reply send `interface/click_003` 33, receive `interface/switch_002` 34.2). NOTHING 40–45.
- Volumes: keypress 0.28–0.4, tone 0.35, ticks 0.4–0.55, thump 0.9.
- SFX analysis guidance: skill `assets/sfx/sfx-analysis.md` (low-risk repeated ticks, isolated reveals).
- Audio files copied into `composition/assets/` before build. No music file is referenced anywhere.

## Hyperframes Instructions
Load `hyperframes-core`, `hyperframes-animation`, `hyperframes-creative`, `hyperframes-keyframes`, `hyperframes-cli`. /brag workflow only — no entry-point interview, no generic promo workflow. Native Hyperframes conventions prevail.

Requirements:
- 45s exactly, `data-fps="30"`, one paused root timeline, `window.__timelines["main"]`.
- Finite deterministic motion ONLY: no `repeat:-1`, no clocks/random/network. Blinking = explicit finite `tl.set` toggles. Shake = explicit 2–3px finite steps. Flash = two `tl.set` calls one frame apart (22.0 → 22.034).
- Never tween `.clip` (autoAlpha/visibility banned) — animate children. No CSS initial transforms on tweened nodes (fromTo everywhere). Unique ids. Every `<audio>` has an id. No `crossorigin`.
- Letter-by-letter transcript: hand-authored per-character spans, staggered reveal (deterministic, seek-safe).
- Text contrast: all text ≥ `#808080` on black or a documented pass; cursor-label colors as specified.
- `hyperframes check` is the single gate: 0 errors, contrast AA 100%. Layout infos for intentional masks (feed/clip regions) get `data-layout-allow-overflow` at construction.
