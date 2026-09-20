# Brag Plan: Interlock — v4 Monochrome Film ("Silence Is Default")

## Creative thesis (serves everything below)

Silence is the default state; interruption is the only event. A system this quiet and restrained earns the one moment it makes noise. Any shot or sound not serving that contrast was cut.

## The line (recurring motif, felt not noticed)

One thin horizontal line threads the film: the cursor's underline in the IDE → the flat waveform baseline on the phone → the line that spikes and breaks at the interrupt → the split-screen divider → the negative space in the wordmark. Makes the film feel authored, not assembled.

## Frame-accurate shot list (30fps, 1350 frames, 1920x1080)

| Frames | Time | Shot |
|---|---|---|
| f0–90 | 0:00–0:03 | Cold open mid-motion: cursors already typing, code already live. Caption hard-cuts sharp: `TWO AGENTS. / ONE CODEBASE. / NO IDEA.` First frame reads muted. |
| f90–240 | 0:03–0:08 | Parallel work, static camera. No push-in yet. |
| f240 | 0:08 | Smash cut to split-screen, hard on a keyboard click. |
| f240–420 | 0:08–0:14 | Convergence on `auth/token-validation.ts`. Slow push-in starts — the only camera move before the interrupt. Stillness from ~12.5. |
| f420 | 0:14 | Whip-pan (motion-blurred bars) into capture. |
| f420–660 | 0:14–0:22 | Capture: mic pulse, waveform + baseline, letter-by-letter transcript, card resolves, latency ticks to `184ms`. |
| f660 | 0:22 | Single white frame, then hard cut to black. Silent. |
| f660–780 | 0:22–0:26 | Second phone, alive: breathing 2px baseline (1px amplitude). Held-breath beat. |
| f780–900 | 0:26–0:30 | Interrupt: baseline spikes, white flash, 3px shake, thump, full-screen alert holds. |
| f900 | 0:30 | Match cut: alert border becomes the split-screen divider. |
| f900–1200 | 0:30–0:40 | Resolution: reply exchange, IDE return, one cursor dims, other continues. |
| f1200 | 0:40 | True cut to black, half-second hold. |
| f1200–1350 | 0:40–0:45 | Close: wordmark hard-cuts in, tagline follows, one gap pulse, hold to black. |

## Hero frame

f810 (0:27): the interrupt alert, composed as a standalone still — complete and legible with zero motion context. Poster + likely deck slide.

## What this app?

Interlock stops AI coding agents duplicating work: speak intent → structured claim → full-screen interrupt before the collision.

## The angle

Contrast is the accent. Black/white/grey throughout; the only color is two functional cursor accents (blue Agent A, amber Agent B). No faces, hands, voiceover, music, or generative motion artifacts — pure motion-graphics / screen-capture realism.

## Hook

Frame one: dark IDE, two colored cursors already moving, code live, caps caption. No title, no sting.

## Key moments

Convergence held in stillness → letter-by-letter capture with prominent `184ms` proof → white flash + thump → alert hold → yielding cursor → still lockup.

## Outro

Black. `Interlock` hard-cuts in wide-tracked, grey tagline, one white-to-black gap pulse. Stillness + silence.

## Tone

- Preset: cinematic, maximally restrained grade
- Direction: editorial B&W product film; hard cuts only (one wordmark fade removed — hard cut); text hard-cuts or types on, never eases/floats; camera moves only where specified (S2 push-in); UI static unless specified in motion.

## Format: landscape 1920x1080, 30fps. Duration: 45s (explicit direction).

## Visual identity (strict)

- `#000000` root, `#0A0A0A` panels, `#2A2A2A` hairlines; text `#FFFFFF` / `#C9C9C9` / `#8C8C8C`, dimmest text `#808080`
- Agent A: block `#4C8DFF`, label `#7AA5FF`. Agent B: block `#B97F26`, label `#D9A441`. Accents touch cursor blocks, cursor-line underlines, selection edges, active-file markers, agent labels ONLY.
- system-ui + ui-monospace stacks, no webfonts. Primary reading text ≥54px; code 40px mono; secondary micro-labels 34px tracked caps.
- Grade: fine static film grain over everything (digital-cinema noise floor), faint vignette on wide shots only, lifted shadows via panels. No bloom/flare/glass/particles/bokeh/DoF/shimmer. Sharp throughout.
- Safe margins: primary text inside 10% inset; all text ≥4.5:1 on black.

## Share copy (draft)

Silence, then one buzz that saves an afternoon. Interlock watches your agents' claims and interrupts before two of them do the same work. I'll tell you before you ask.

## Audio direction — rhythm, not decoration; diegetic only, no bed ever

- 92 BPM edit pulse (0.652s grid): S1 clicks breathe on it; the five hard cuts land on the specified frames.
- Dry keypresses under IDE, Agent-A-leaning moments use brighter-character files (024–031), Agent-B-leaning use darker ones (001–008) — audio echo of the color split.
- Hard silence one full beat before the mic (13.35–14.0), then a single thin rising sine (generated, 300→~900Hz, 14.2–21.2) that cuts off exactly as `184ms` resolves.
- Total silence 21.2–26.0 (hangs slightly too long), then one dry low thump at 26.0 — unmatched in volume, the only percussive moment.
- Sparse device ticks only: mic press, card resolve, reply send/receive. Near-silence through the close. Nothing 40–45.
- Files: `keyboard/keypress-*.wav` (varied per agent leaning), generated `tone/rising-tone.wav`, `impact/impactSoft_heavy_002` (thump, 0.9), `interface/click_003`, `interface/drop_001`, `interface/switch_002`.
- Audio-coupled: keystroke visuals, whip cut, mic press, card snap, flash frame + shake, alert landing, reply pair, wordmark (silence).

## Storyboard (beats only — full detail in composition)

1. Cold open 0–8: mid-motion IDE, sharp caption, static camera.
2. Convergence 8–14: split panes, cursor travel, grey glow, push-in, stillness.
3. Capture 14–22: whip in, mic rings, waveform + baseline, 30 typed chars, card hard-cut, latency `041→089→132→167→184ms`.
4. Held breath 22–26: flash frame, black, phone + breathing baseline.
5. Interrupt 26–30: spike, flash, shake, thump, alert holds; hero at f810.
6. Resolution 30–40: divider match-cut, reply pair, IDE return, amber dims, blue streams, 3-line caption.
7. Close 40–45: black hold, hard-cut wordmark, tagline, one gap pulse, hold.

**Music mood:** none — silence is the mix.
