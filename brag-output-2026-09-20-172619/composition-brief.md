# Hyperframes Composition Brief: Interlock v4 ("Silence Is Default")

## Objective
45-second cinematic B&W product film. Thesis: silence is default, interruption is the only event. Frame-accurate per the shot list; the line motif threads every scene.

## Output
- Composition: `brag-output-2026-09-20-172619/composition/`
- Video: `brag-output-2026-09-20-172619/brag.mp4`
- 1920x1080, `data-fps="30"`, 45.0s exactly (1350 frames), H.264

## Source Material
`interlock-architecture.md` (contract, scope enum, on-device proof), `PITCH.md`, `README.md`. Product: Interlock. Tagline: "I'll tell you before you ask."

## Copy (verbatim)
`TWO AGENTS.` / `ONE CODEBASE.` / `NO IDEA.` · `auth/token-validation.ts` · `Starting on the auth refactor.` · `scope: auth` + `summary: refactoring token validation` · `184ms` · `Karthik just claimed auth —` / `you're about to duplicate this.` · `let me finish first` · `Locked in — you take auth.` · `NO DASHBOARDS.` / `NO CHECKING IN.` / `IT JUST TELLS YOU.` · `Interlock` · `I'll tell you before you ask.`

## Creative Direction
- Tone: cinematic, maximal restraint. Hard cuts at f240/420/660/780/900/1200 (8/14/22/26/30/40s) via scene `data-start` boundaries + specified in-scene sets.
- Text enters by hard cut (`tl.set`) or type-on only. No fades/floats on text. Containers don't ease in at cuts — scenes open already composed (cut into them).
- Camera: static except S2 push-in (1→1.045, f240–420). No other camera motion.
- No humans/faces/hands. No morph/warp/drift/breathe (except the specified 1px baseline breath). Simplify over risk.
- Motif line: S1 colored cursor underlines → S3 white waveform baseline → S4 breathing baseline → spike/break → S5 white divider → S6 wordmark gap pulse.

## Visual Identity (strict)
- `#000` root, `#0A0A0A` panels (shadow lift), `#2A2A2A` hairlines. Text `#FFF`/`#C9C9C9`/`#8C8C8C`, floor `#808080`.
- A-blue block `#4C8DFF`/label `#7AA5FF`; B-amber block `#B97F26`/label `#D9A441`. Cursor blocks, cursor-line underlines, selection edges, file markers, agent labels ONLY.
- system-ui + ui-monospace. Primary text ≥54px; code 40px; micro-labels 34px tracked caps. Primary text inside 10% safe inset.
- Grade: static SVG-noise grain overlay (`#grain`, ~0.05, entire film), faint radial vignette on S1/S2 wides only. No bloom/flare/glass/particles/bokeh/DoF/shimmer.

## Storyboard (contract: brag-plan.md frame table)
1. S1 Cold open 0–8 (f0–240): IDE composed at f0 (5 lines/side live), streams hard-cut 1.2–3.0, cursors blink finite then travel, sharp caption set 0.5, static camera. Clicks on 92bpm grid (0.65–7.18).
2. S2 Convergence 8–14 (f240–420): panes composed at cut; cursors travel 8.5–11; grey glow 11.5; stillness 12.5+; push-in. Click 8.0 on cut; sparse clicks; silence from 11.2.
3. S3 Capture 14–22 (f420–660): whip bars sweep 14.0–14.16 + cut click; mic rings 14.3/14.9; waveform stagger; 30 chars stagger 0.09 from 15.5; card hard-cut 19.0; latency sets 19.0–21.2 (`041/089/132/167/184ms`).
4. S4a Breath 22–26 (f660–780): white frame 22.0–22.034 (silent), black to 22.3, phone hard-cuts in, 2px baseline breathes ±1px (sets 22.5–25.5). Silence.
5. S4b Interrupt 26–30 (f780–900): spike 25.97 (0.06s), white frame 26.0–26.034, shake sets (3/-3/0), thump 26.0 @0.9, alert hard-cuts 26.05, holds to 30. HERO f810.
6. S5 Resolution 30–40 (f900–1200): white divider match-cut (present at cut); minis hard-cut 30.1/30.3; bubbles 33.0/34.2; hard internal cut 36.5 (sets); amber dims via set (keeps color); blue streams (hard-cut lines + smooth cursor); caption 3-line hard-cut 37.2, holds.
7. S6 Close 40–45 (f1200–1350): black hold to 40.5; wordmark hard-cut 40.5; tagline hard-cut 41.5; gap pulse sets 43.5/43.65; hold. Silence throughout.

## Audio (diegetic only, no bed — explicit)
- 92bpm grid clicks S1 (A-files 024/027–031 bright leaning, B-files 001–008 dark leaning), cut click f240, sparse S2, whip click f420.
- Silence 13.35–14.0 (full beat+). Rising sine `tone/rising-tone.wav` 14.2, `data-duration="7"`, ends exactly 21.2 on `184ms`.
- Silence 21.2–26.0. Thump `impact/impactSoft_heavy_002` @26.0 vol 0.9, unmatched.
- Ticks only: mic press `click_003` 14.3, card `drop_001` 19.5, send `click_003` 33.0, receive `switch_002` 34.2. S5 keys 37/38/39 low. NOTHING 40–45.
- Every `<audio>` has id; slots 1–2s (benign `clip_media_fit` warnings expected).

## Hyperframes Instructions
Load `hyperframes-core`, `hyperframes-animation`, `hyperframes-creative`, `hyperframes-keyframes`, `hyperframes-cli`. /brag workflow only. Native conventions prevail.
- One paused root timeline `window.__timelines["main"]`. Finite deterministic motion only (sets, explicit tweens; no repeat/clocks/random/network).
- Never tween `.clip` visibility. No CSS initial transforms on tweened nodes (fromTo or clean `.to`). Unique ids. No `crossorigin`.
- Flash frames: `tl.set` pairs exactly one frame apart (22.0→22.034, 26.0→26.034).
- Intentional layering (cursor/tag over code, scroll/clip masks) declared at construction with `data-layout-allow-overlap` / `data-layout-allow-overflow`.
- Gate: `hyperframes check` 0 errors, contrast AA 100%.
