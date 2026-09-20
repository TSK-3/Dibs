# Surya Pipeline — Integration Guide (for the main app / Tejashwin)

This is the handoff doc for embedding the Surya on-device pipeline
(mic → offline STT → local LLM → `{scope, summary, rationale}`) into the main
Expo app. Import **only** `src/pipeline/index.ts` — everything else in
`src/pipeline/` is internal.

## 1. What you get

- `startListening()` / `stopListening()` — Android **on-device** speech
  recognition, offline-enforced (`requiresOnDeviceRecognition: true`).
- `initModel()` — optional warm-up so the first intent is fast.
- `extractIntent(transcript)` — returns **exactly**
  `{ scope: Scope, summary: string, rationale: string }` — nothing else.
- `runPipeline(transcript)` — same, plus debug fields (path taken:
  `model` / `retry` / `keyword`, per-attempt timing). Never throws.
- Metrics: `getMetricsStats()`, `resetMetrics()` (speech-end → JSON-ready
  mean/p95, generation mean/p95, load time, path counts).
- Typed exports throughout — autocomplete works out of the box.

## 2. Packages (pinned — keep these aligned with the main app)

| Package | Pin | Why |
|---|---|---|
| `expo` | `~57.0.24` | SDK 57 baseline (React Native 0.86.3, New Architecture ON — required by llama.rn ≥0.10) |
| `react` | `19.2.3` | matched to SDK 57 |
| `react-native` | `0.86.3` | matched to SDK 57 |
| `expo-speech-recognition` | `57.1.0` | STT; config plugin included |
| `llama.rn` | `0.12.9` | exact pin — newest **stable**; ships prebuilt arm64 libs via postinstall |
| `expo-dev-client` | `~57.0.19` | dev builds only (never Expo Go) |

If the main app is on a different Expo SDK, reconcile versions first —
`llama.rn 0.12.9` needs New Architecture enabled (`newArchEnabled=true`).

## 3. Config plugin + permissions

`app.json`:

```json
{
  "expo": {
    "plugins": ["expo-speech-recognition"]
  }
}
```

The plugin adds `RECORD_AUDIO` and the package-visibility entries Android
needs to find the on-device recognizer. Runtime inference makes **zero
network calls** (verified in airplane mode); the `INTERNET` permission only
serves the Metro dev connection and can stay.

## 4. The model file (never downloaded at runtime)

- File: `qwen2.5-0.5b-instruct-q4_k_m.gguf` (**491 MB**)
- Source: https://huggingface.co/Qwen/Qwen2.5-0.5B-Instruct-GGUF/resolve/main/qwen2.5-0.5b-instruct-q4_k_m.gguf
- App reads it from: `file:///data/user/0/<applicationId>/files/qwen2.5-0.5b-instruct-q4_k_m.gguf`
- Put it there once (PC connected, app installed):

```powershell
adb push qwen2.5-0.5b-instruct-q4_k_m.gguf /data/local/tmp/
adb shell run-as <applicationId> cp /data/local/tmp/qwen2.5-0.5b-instruct-q4_k_m.gguf files/qwen2.5-0.5b-instruct-q4_k_m.gguf
```

- Survives app updates (same signature) and rebuilds; re-push only after
  uninstalling the app or clearing its storage.
- Optional: bundle it inside the APK (see "OPTION A" notes in `llm.ts`) if
  you want a fully self-contained install.

## 5. Minimum Android version

- **Android 13 (API 33) minimum** for on-device STT: the on-device support
  check, `requiresOnDeviceRecognition`, and the offline language-pack
  download all require 13+.
- **Android 14+ recommended** (model-download status reporting is better).
- Android 12 and below cannot honor the offline-enforced STT — do not demo
  the "fully on-device" claim on those devices.

## 6. Example usage

```ts
import {
  initModel,        // warm-up (optional; extractIntent lazy-loads too)
  setSttHandlers,   // receive transcript events
  startListening,
  stopListening,
  extractIntent,
} from './src/pipeline';

// 1. warm up early (e.g. in a useEffect) - shows a load-time on console
initModel().catch(console.log);

// 2. wire STT events once
setSttHandlers({
  onPartial: (t) => setPartial(t),   // live partial transcript
  onFinal: (t) => setFinal(t),       // final transcript
  onError: (e) => console.log(e),    // surfaced to your UI if you want
});

// 3. mic flow (permission is requested inside startListening)
await startListening();
await stopListening();               // final transcript arrives via onFinal

// 4. hand off EXACTLY this object to your socket layer:
const { scope, summary, rationale } = await extractIntent(finalTranscript);
```

`user_id` and `timestamp` are **not** added here — your socket message layer
attaches them when posting (per your PRD's message shape). `scope` is one of
`auth, payments, frontend, backend, database, testing` (single constant
`SCOPE_VALUES` in `src/pipeline/grammar.ts`; the GBNF grammar regenerates
from it).

## 7. Guarantees

- `extractIntent()` / `runPipeline()` never throw and never return an error
  state: fallback chain is model → retry-once → keyword match → default
  scope. The path taken is logged to the console only.
- Output is schema-validated (`parseIntent`): exactly three fields, scope in
  the enum, grammar-constrained decoding makes malformed JSON structurally
  impossible on the model path.
- Offline: everything runs on-device; airplane mode is a tested gate, not a
  hope.

## 8. Debug hooks (demo insurance, keep off during rehearsal)

- `setForceInvalidOutput('first-attempt' | 'always' | 'off')` — forces the
  retry / keyword paths so you can rehearse every fallback on stage.
- `resetMetrics()` before a demo run so the pitch numbers are clean.
