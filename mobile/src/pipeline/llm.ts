/**
 * LLM stage of the Surya pipeline.
 *
 * Model: Qwen2.5-0.5B-Instruct, GGUF, Q4_K_M (PRD 3.2) via llama.rn
 * (llama.cpp bindings). Runs 100% on-device, zero network calls.
 *
 * M2 proved local inference; M3 added grammar-constrained decoding (GBNF)
 * so output can only be valid schema JSON. M4 adds the few-shot prompt
 * (PRD 3.4) with a baseline/few-shot A/B toggle for the test harness, plus
 * real prompt token counting via ctx.tokenize(). Still no fallback chain
 * (M5).
 * Model load time and generation time are logged and returned separately.
 */
import { initLlama, type LlamaContext } from 'llama.rn';
import { buildPrompt } from './prompt';
import { GBNF_GRAMMAR, parseIntent, type Intent } from './grammar';

/** Exact GGUF file we load (PRD 3.2). Never downloaded at runtime. */
const MODEL_FILE_NAME = 'qwen2.5-0.5b-instruct-q4_k_m.gguf';
/** Android applicationId (see android/app/build.gradle). */
const APPLICATION_ID = 'com.iqoo';

/**
 * Where the model lives on the phone (Option B from the milestone notes):
 * pushed once over USB with adb, copied into this app's PRIVATE storage,
 * which scoped storage always lets our own app read. Re-push after
 * uninstalling the app or clearing its storage - plain rebuilds keep it.
 */
const PUSHED_MODEL_URI = `file:///data/user/0/${APPLICATION_ID}/files/${MODEL_FILE_NAME}`;

/**
 * PRD 3.5 integration shape constants.
 * n_ctx raised 512 -> 1024 in M4: the few-shot prompt is ~400 tokens and
 * the KV cache needs prompt_tokens + n_predict <= n_ctx. The real prompt
 * token count is measured with the model's own tokenizer on every send.
 */
const N_CTX = 1024;
const N_THREADS = 4;
const TEMPERATURE = 0.1;
const N_PREDICT = 128;
/** Qwen's end-of-turn token (also its EOS). Belt and braces. */
const STOP_SEQUENCES = ['<|im_end|>'];

let context: LlamaContext | null = null;
let lastLoadMs = 0;
/** Set when a load completes; consumed once by the M6 latency metrics. */
let pendingLoadMs: number | null = null;

export type ModelLoadInfo = {
  loadMs: number;
  modelDesc: string;
  modelSizeMb: number;
  gpu: boolean;
  reasonNoGPU: string;
};

/** Load the model once; later calls return the cached info immediately. */
export async function loadModel(): Promise<ModelLoadInfo> {
  if (context) {
    return {
      loadMs: lastLoadMs,
      modelDesc: context.model.desc,
      modelSizeMb: Math.round(context.model.size / (1024 * 1024)),
      gpu: context.gpu,
      reasonNoGPU: context.reasonNoGPU,
    };
  }

  console.log(`[llm] loading ${MODEL_FILE_NAME} from ${PUSHED_MODEL_URI}`);
  const startedAt = Date.now();
  context = await initLlama(
    {
      model: PUSHED_MODEL_URI,
      n_ctx: N_CTX,
      n_threads: N_THREADS,
    },
    (progress) => {
      // Rough progress of weights being read/mmap'd into the context.
      if (progress % 10 === 0) console.log(`[llm] model load ${progress}%`);
    },
  );
  lastLoadMs = Date.now() - startedAt;
  pendingLoadMs = lastLoadMs;

  const info: ModelLoadInfo = {
    loadMs: lastLoadMs,
    modelDesc: context.model.desc,
    modelSizeMb: Math.round(context.model.size / (1024 * 1024)),
    gpu: context.gpu,
    reasonNoGPU: context.reasonNoGPU,
  };
  console.log(
    `[llm] loaded in ${info.loadMs}ms: ${info.modelDesc} ` +
      `${info.modelSizeMb}MB gpu=${info.gpu}` +
      `${info.reasonNoGPU ? ` (${info.reasonNoGPU})` : ''}`,
  );
  // Log once per load so the exact grammar in force is always visible.
  console.log(`[llm] grammar:\n${GBNF_GRAMMAR}`);
  return info;
}

export function isModelLoaded(): boolean {
  return context !== null;
}

/**
 * Consume the most recent model-load duration (M6 metrics hook).
 * Returns null if no load has happened since the last call.
 */
export function takeLastLoadMs(): number | null {
  const value = pendingLoadMs;
  pendingLoadMs = null;
  return value;
}

export type CompletionInfo = {
  rawText: string;
  /** Prompt token count measured with the model's own tokenizer. */
  promptTokens: number | null;
  /** Parsed + schema-validated intent, or null when validation failed. */
  intent: Intent | null;
  /** Why validation failed, when intent is null. */
  intentError: string | null;
  totalMs: number;
  promptMs: number;
  genMs: number;
  tokensPerSecond: number;
  predictedTokens: number;
  stoppedBy: string;
};

/**
 * Run one grammar-CONSTRAINED completion for a transcript. The GBNF grammar
 * from grammar.ts makes invalid schema JSON structurally impossible, and the
 * output is parsed + validated before being returned.
 * opts.fewShot = false rebuilds the M3 baseline prompt for the A/B harness.
 */
export async function completeTranscript(
  transcript: string,
  opts: { fewShot?: boolean } = {},
): Promise<CompletionInfo> {
  if (!context) {
    console.log('[llm] model not loaded yet - loading now');
    await loadModel();
  }
  const ctx = context;
  if (!ctx) throw new Error('Model failed to load');

  const prompt = buildPrompt(transcript, { fewShot: opts.fewShot ?? true });
  console.log(`[llm] prompt:\n${prompt}`);

  // Measure the real token count with the model's own tokenizer (PRD task:
  // "check the token count of the full prompt and raise n_ctx if tight").
  let promptTokens: number | null = null;
  try {
    const tok = await ctx.tokenize(prompt);
    promptTokens = tok.tokens.length;
    console.log(
      `[llm] prompt tokens=${promptTokens} (n_ctx=${N_CTX}, n_predict=${N_PREDICT})`,
    );
  } catch (err) {
    console.log('[llm] tokenize failed', err);
  }

  const startedAt = Date.now();
  const result = await ctx.completion({
    prompt,
    // Grammar-constrained decoding (PRD 3.3) - llama.rn 0.12.9 takes a raw
    // GBNF string here, exactly the shape the PRD's integration sketch shows.
    grammar: GBNF_GRAMMAR,
    temperature: TEMPERATURE,
    n_predict: N_PREDICT,
    stop: STOP_SEQUENCES,
  });
  const totalMs = Date.now() - startedAt;

  // The grammar structurally guarantees the shape; this parse is the honest
  // assertion of it (PRD 3.6 step 1 - M5's fallback chain builds on this).
  const parse = parseIntent(result.text);

  const info: CompletionInfo = {
    rawText: result.text,
    promptTokens,
    intent: parse.ok ? parse.intent : null,
    intentError: parse.ok ? null : parse.error,
    totalMs,
    promptMs: Math.round(result.timings.prompt_ms),
    genMs: Math.round(result.timings.predicted_ms),
    tokensPerSecond: Number(
      (result.timings.predicted_per_second ?? 0).toFixed(2),
    ),
    predictedTokens: result.tokens_predicted,
    stoppedBy:
      result.stopping_word ||
      (result.stopped_eos ? 'eos' : 'token limit'),
  };
  console.log(`[llm] raw output: "${info.rawText}"`);
  console.log(
    `[llm] intent: ${parse.ok ? JSON.stringify(parse.intent) : `INVALID - ${parse.error}`}`,
  );
  console.log(
    `[llm] timings: prompt=${info.promptMs}ms gen=${info.genMs}ms ` +
      `total=${info.totalMs}ms speed=${info.tokensPerSecond} tok/s ` +
      `stoppedBy=${info.stoppedBy}`,
  );
  return info;
}

/** Free the model's memory (call on unmount, or before reloading). */
export async function releaseModel(): Promise<void> {
  if (!context) return;
  await context.release();
  context = null;
  console.log('[llm] model released');
}

/*
 * OPTION A (not wired up yet): bundle the model inside the APK so a cold
 * install works with zero adb steps. We switch to this for the final demo
 * build only if you want it; until then the adb-push flow above keeps the
 * APK small and rebuilds fast. To switch later:
 *   1. Put the GGUF at assets/models/qwen2.5-0.5b-instruct-q4_k_m.gguf
 *   2. npm install expo-asset
 *   3. In loadModel(), before initLlama:
 *        import { Asset } from 'expo-asset';
 *        const asset = Asset.fromModule(
 *          require('../../assets/models/qwen2.5-0.5b-instruct-q4_k_m.gguf'),
 *        );
 *        await asset.downloadAsync(); // copies out of the APK, no network
 *        // then pass asset.localUri instead of PUSHED_MODEL_URI
 * ('gguf' is already a registered Metro asset extension in metro.config.js.)
 */
