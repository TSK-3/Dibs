# On-Device AI Pipeline

Speak → on-device speech-to-text → on-device LLM → structured JSON intent.
**100% on-device, zero network calls at inference time** — verified in airplane
mode on a physical Android phone.

```
mic → offline STT → Qwen2.5-0.5B (GGUF, on-device) → grammar-constrained JSON
    → { scope, summary, rationale }  → handed off to the main app
```

## Features

- **Offline STT** — Android's `SpeechRecognizer` with on-device recognition
  *enforced* (`requiresOnDeviceRecognition: true`), support check, and an
  offline language-pack download helper.
- **Local LLM** — Qwen2.5-0.5B-Instruct (GGUF, Q4_K_M, 491 MB) via
  [llama.rn](https://github.com/mybigday/llama.rn) (llama.cpp bindings), CPU
  inference, loaded from app-private storage.
- **Grammar-constrained decoding** — a GBNF grammar makes structurally invalid
  JSON impossible; the `scope` enum is a single constant that generates the
  grammar's `scope` rule.
- **Fallback chain** — model → retry once → keyword match → default scope.
  `runPipeline()` never throws and never surfaces an error state.
- **Metrics** — speech-end → JSON-ready mean/p95, generation and load times,
  fallback-path counts, with reset.
- **Test harness** — 29-sentence A/B suite (clean / rambling / filler / vague /
  multi-topic) plus a Full Test that runs everything through the real public
  API and prints pass rate, latency mean/p95, and path counts.

## Tech stack

| Piece | Choice |
|---|---|
| Framework | Expo SDK 57 (`expo ~57.0.24`), React Native 0.86.3, New Architecture |
| STT | `expo-speech-recognition@57.1.0` |
| LLM runtime | `llama.rn@0.12.9` (pinned, prebuilt arm64 libs) |
| Model | `qwen2.5-0.5b-instruct-q4_k_m.gguf` (491 MB) |
| Language | TypeScript (strict) |

## Project structure

```
App.tsx                      # debug screen (STT + LLM + harness + debug panel)
src/TestHarness.tsx          # A/B + Full Test harness UI
src/pipeline/
  index.ts                   # PUBLIC API - the only module the main app imports
  stt.ts                     # offline STT (on-device enforced)
  llm.ts                     # model load + grammar-constrained completion
  prompt.ts                  # ChatML builder + few-shot examples
  grammar.ts                 # scope enum (source of truth) + GBNF + parseIntent
  fallback.ts                # keyword table + default-scope fallback
  pipeline.ts                # orchestration: model -> retry -> keyword
  metrics.ts                 # latency stats (mean/p95) + path counts
  testSentences.ts           # 29-sentence suite with expected scopes
INTEGRATION.md               # handoff guide for embedding into the main app
```

## Getting started

Prerequisites: Node LTS, JDK 17, Android Studio + SDK (platform-tools), a
physical Android device with **Android 13+** (on-device STT requires it).

```powershell
# 1. install dependencies
npm install

# 2. download the model (once, ~491 MB, never committed / never downloaded at runtime)
Invoke-WebRequest -Uri "https://huggingface.co/Qwen/Qwen2.5-0.5B-Instruct-GGUF/resolve/main/qwen2.5-0.5b-instruct-q4_k_m.gguf" -OutFile "$env:USERPROFILE\Downloads\qwen2.5-0.5b-instruct-q4_k_m.gguf"

# 3. push the model into the app's private storage (after the app is installed)
adb push "$env:USERPROFILE\Downloads\qwen2.5-0.5b-instruct-q4_k_m.gguf" /data/local/tmp/
adb shell run-as com.iqoo cp /data/local/tmp/qwen2.5-0.5b-instruct-q4_k_m.gguf files/qwen2.5-0.5b-instruct-q4_k_m.gguf

# 4. dev build + run (Metro over USB; no internet needed)
npx expo run:android

# 5. release build (standalone, no Metro, works in airplane mode)
npx expo run:android --variant release
```

## Public API (for the main app)

```ts
import { initModel, setSttHandlers, startListening, stopListening, extractIntent } from './src/pipeline';

initModel(); // optional warm-up

setSttHandlers({ onFinal: (t) => setTranscript(t), onError: console.log });
await startListening();
await stopListening();

const { scope, summary, rationale } = await extractIntent(transcript);
// exactly three fields - consumer adds user_id / timestamp
```

See **[INTEGRATION.md](./INTEGRATION.md)** for the full handoff guide
(packages, config plugin, permissions, model placement, minimum Android).

## Notes

- The scope enum (`auth, payments, frontend, backend, database, testing`)
  lives in `src/pipeline/grammar.ts` and must match the backend's enum.
- The model file is gitignored (`assets/models/*.gguf`) and is read from the
  app's private storage — it survives rebuilds and app updates, and is only
  needed again after an uninstall.
- `setForceInvalidOutput()` exists to rehearse the retry/keyword fallback
  paths on stage; keep it off during demos.
