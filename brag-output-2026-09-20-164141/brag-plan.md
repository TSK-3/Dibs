# Brag Plan: Interlock — 45s Hype Cut

## What is this app?

Interlock is a phone app that lets developers coordinate with AI coding agents in real time: speak an intent, get a structured claim, and receive a full-screen interrupt the instant someone collides with your scope.

## The angle

Not a feature tour — a near-miss story. Two developers about to waste an afternoon on the same auth refactor, and a phone call that arrives before the damage. The product is the timing. Every scene earns the tagline: "I'll tell you before you ask."

## Hook (first 2–3 seconds)

Split screen snaps in on the half-second beat grid: two phones, two developers, one shared codebase. Overlay types in: `Two developers. Same codebase.`

## Key moments (the middle)

- Developer A taps mic, speaks; waveform → transcript words → "extracting intent..." loader → structured card snaps in (scope: auth) with a live latency counter settling — the on-device proof.
- Hard cut to Developer B mid-task, phone face-down. It lights up and shakes. Full-screen alert: `Karthik just claimed auth — you're about to duplicate this.` Overlay: `Before it became a problem.`
- Payoff montage: "let me finish first" tapped, instant reply lands, claim-history feed scrolls. Overlay: `No dashboards. No checking in. It just tells you.`

## Outro / punchline

`Interlock` lockup centers on dark. Tagline: `I'll tell you before you ask.` App icon lands with a soft haptic pulse.

## User flow worth showing

Speak → waveform → transcript → extracting → structured claim (scope: auth) → collision → buzz + full-screen interrupt → two-way reply → claim feed → lockup.

## Tone

- Preset: cinematic (nearest match for fast-paced launch-hype pacing and big-motion reveals)
- Creative direction: Linear/Vercel launch-video energy — confident, fast cuts, dark-mode UI, one red alert beat. Minimal voiceover (none); on-screen text + UI motion carry the story.
- Interpretation: half-second beat-grid cutting in the opening, hard cut into the wow moment, long readable holds on the alert and the lockup. Urgency from cutting rhythm, never from flashing text.

## Format: landscape — 1920x1080
## Duration: 45 seconds (explicit user direction; extends brag's 15–25s default with a 5-act storyboard)

## Visual identity (from the project)

- Background: `#0b0f17`
- Accent: `#2563eb`
- Alert red: `#b91c1c` panel, `#ffffff` text (contrast-safe), glow `#ef4444`
- Success green: `#052e16` panel, `#4ade80` text, `#16a34a` border
- Text: `#e6e9f0` / secondary `#c3cad6`
- Display font: system-ui, sans-serif
- Body font: system-ui, sans-serif
- People are represented abstractly (labeled devices + hands-free UI storytelling, no stock footage — local-assets-only build)

## Share copy (draft)

Interlock: speak what you're working on, and your teammate's phone buzzes before you collide. No dashboards. It just tells you.

## Audio direction

- Role: high-energy product-launch bed with crisp interface accents and one unmistakable warning hit
- Music: `happy-beats-business-moves-vol-1-by-ende-dot-app.mp3` (120.19 BPM, most energetic bundled track)
- Music treatment: full-energy bed at 0.34; duck briefly under the 23s alert reveal; clean fade 43–45s
- Music cue guidance: beat grid ≈ every 0.5s (3.02, 3.52, 4.02 … 45.52); strong-cue cluster 16.02–29.01. Locks: intent-card snap → 16.02; hard cut to Developer B → 18.02; buzz → 21.01; alert reveal → 23.02; payoff cut → 28.01; logo → 38.52 beat. ~6 locks across 45s (≈ the 1–3-per-25s density). Everything else rides the half-second grid ±0.10s; readability wins ties.
- Audio-reactive treatment: subtle; blue glow + alert halo + logo breathe with the bed. No waveform decoration beyond the diegetic mic waveform UI, no equalizer visuals.
- SFX posture: taps for mic/reply, card slides for snaps, soft-medium impacts for cuts, one heavy bell for the alert, one bell for the logo. All isolated, 0.55–0.8 volume.
- Audio-coupled moments: split-screen snaps, mic tap, transcript words, extracting→card snap, latency settle, hard cut, buzz shake, alert reveal, reply tap + reply landing, feed scroll ticks, logo landing, icon pulse.
- Restraint rule: no voiceover; SFX mark landings, never fill silence.

## Storyboard

### Scene 1 — Collision You Can't See — 8s (0–8)

Split screen: left phone labeled `Karthik · Developer A`, right phone `Tejashwin · Developer B`, both showing editor/code surfaces. Overlay lines land on beats: `Two developers.` (3.02) / `Same codebase.` (5.03) / `No idea they're about to collide.` (7.02). Phones snap in at 1.0/2.0; quick push-in drift 4–8s. Both phones show an `auth` file row highlighted — the visual rhyme that pays off later.

Sequential/interaction: yes — phones, then three overlay lines, then shared `auth` highlight.

Audio intent: bed drops in full-energy; card-slide accents on phone snaps; soft ticks under overlay lines.

Audio-coupled idea: card slides at 1.0/2.0; overlay lines land near 3.02, 5.03, 7.02 beats.

Music: 0–8s, full bed from first frame.

Transition mood: hard cut on the 8.02 beat → Scene 2

### Scene 2 — Say It, Claimed — 10s (8–18)

Developer A's phone, large. Finger-tap dot hits the mic button (~9.0). Waveform dances (9.5–11). Transcript words appear one by one: `Starting / on / the / auth / refactor.` (11–13.5). `extracting intent...` loader with spinning ring (13.5–15.5). Structured card snaps into place at 16.02 (beat-locked): `scope: auth`, `summary: refactoring token validation`. Live latency counter ticks 12ms → 48ms → 96ms → 143ms → settles `184ms · on-device` at 17.02 (strong cue). Hold to 18.

Sequential/interaction: yes — tap, waveform, words, loader, card, counter settle.

Audio intent: precise and crisp; clicks for tap/words, drop for card snap, soft confirmation blip for the settle.

Audio-coupled idea: mic tap 9.0; word ticks 11–13.5; card snap + drop at 16.02; settle tick at 17.02.

Music: driving, untouched.

Transition mood: HARD CUT on 18.02 strong cue → Scene 3

### Scene 3 — The Buzz — 10s (18–28)

Developer B's desk: laptop with code mid-edit, phone face-down beside it (18–21). At 21.01 (beat-locked) the phone lights up and shakes (finite rapid x-jitter 21–22.5, glow halo pulses). Full-screen alert slides up at 23.02 (beat-locked): `Karthik just claimed auth — you're about to duplicate this.` Expression beat: status line flips `focused → surprised → relieved` (24–27). Overlay: `Before it became a problem.` (~25.5). Hold the alert readable to 28.

Sequential/interaction: yes — desk, buzz+shake, alert slide-up, status flip, overlay.

Audio intent: one controlled warning hit at the reveal; bed ducks under it, then recovers.

Audio-coupled idea: glitch tick at the 18.02 hard cut; buzz body + double tick at 21.01; heavy warning hit at 23.02.

Music: duck 23–24.5 under the alert, recover by 26.

Transition mood: fast push-cut on 28.01 strong cue → Scene 4

### Scene 4 — Sorted in Seconds — 10s (28–38)

Montage on the beat grid: both phones face-up (28.01). B taps `let me finish first` (30.02). A's phone receives it instantly — reply bubble lands (32.02). Claim-history feed scrolls with real entries: `karthik claimed auth`, `tejashwin replied`, `claim active` (33–37). Overlay: `No dashboards. No checking in. It just tells you.` (34–37, holds 3s+).

Sequential/interaction: yes — phones, tap, reply landing, feed scroll, overlay.

Audio intent: light, quick, satisfying; tap + landing tick, two soft scroll ticks, nothing heavy.

Audio-coupled idea: tap at 30.02; reply landing at 32.02; scroll ticks ~34.5/36.

Music: full energy, carries the montage.

Transition mood: clean slide on 38.02 beat → Scene 5

### Scene 5 — Interlock — 7s (38–45)

Dark holds. `Interlock` wordmark lands on the 38.52 beat with a bell. Tagline `I'll tell you before you ask.` resolves below (~40). App icon (rounded square, blue `IL` monogram) lands ~41.5 with a soft haptic pulse: scale 1→1.06→1 plus an expanding glow ring, finite. Everything holds; bed fades 43–45; fade to black.

Sequential/interaction: logo, tagline, icon + pulse — then stillness.

Audio intent: confident close; one bell, one soft pulse tick, fade out.

Audio-coupled idea: logo bell at 38.52; soft tick under the icon pulse ~42.

Music: final sustain, clean fade 43–45.

Transition mood: fade to black

**Music mood for this video:** high-energy, confident, technical.

**Audio summary:** A driving full-energy bed underpins five acts; interface ticks mark UI landings, a single heavy hit marks the collision alert, and a bell closes the lockup — hype from rhythm and cutting, not from volume stacking.
