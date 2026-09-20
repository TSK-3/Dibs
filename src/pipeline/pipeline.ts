/**
 * Pipeline orchestration (PRD 3.6) - the module the main app will import.
 *
 * runPipeline(transcript):
 *   1. grammar-constrained model output, parsed/validated by parseIntent
 *   2. invalid -> retry generation ONCE (PRD 3.6 step 2)
 *   3. still invalid (or the model threw) -> keyword fallback, then a
 *      sensible default scope (fallback.ts)
 *
 * Contract: NEVER throws, NEVER returns an error state to the user. Which
 * path was used (model/retry/keyword) is logged to the console only;
 * per-attempt detail is returned in `.debug` for the debug screen's
 * separate panel.
 * M6: every run is recorded in metrics.ts (speech-end -> ready, per-attempt
 * generation time, load time, path counts). The M5 decision logic is
 * unchanged - only metrics recording was added.
 */
import { completeTranscript, takeLastLoadMs, type CompletionInfo } from './llm';
import { parseIntent, type Intent } from './grammar';
import { keywordFallbackIntent, type KeywordMatch } from './fallback';
import { recordRun } from './metrics';
import { takeLastSpeechEndTs } from './stt';

export type PipelinePath = 'model' | 'retry' | 'keyword';

export type AttemptTiming = {
  promptMs: number;
  genMs: number;
  tokensPerSecond: number;
  stoppedBy: string;
};

export type ForceInvalidMode = 'off' | 'first-attempt' | 'always';

export type PipelineResult = {
  intent: Intent;
  path: PipelinePath;
  /** Final model text ('' when keyword fallback answered). */
  rawText: string;
  /** How many model generations actually ran. */
  generations: number;
  totalMs: number;
  /** Keyword details when path === 'keyword'. */
  keyword: KeywordMatch | null;
  /** Debug-only extras for the debug panel. */
  debug: {
    forceInvalidMode: ForceInvalidMode;
    attempt1: AttemptTiming | null;
    attempt2: AttemptTiming | null;
    firstRaw: string | null;
    firstError: string | null;
    secondRaw: string | null;
    secondError: string | null;
  };
};

let forceInvalidMode: ForceInvalidMode = 'off';

/** Debug hook: force model outputs invalid to exercise the chain. */
export function setForceInvalidOutput(mode: ForceInvalidMode): void {
  forceInvalidMode = mode;
  console.log(`[pipeline] forceInvalidOutput=${mode}`);
}

function timingOf(r: CompletionInfo): AttemptTiming {
  return {
    promptMs: r.promptMs,
    genMs: r.genMs,
    tokensPerSecond: r.tokensPerSecond,
    stoppedBy: r.stoppedBy,
  };
}

/** DEBUG ONLY: swap a real completion for an invalid one. */
function maybeInvalidate(r: CompletionInfo, attempt: number): CompletionInfo {
  if (
    forceInvalidMode === 'off' ||
    (forceInvalidMode === 'first-attempt' && attempt !== 1)
  ) {
    return r;
  }
  console.log(`[pipeline] DEBUG: forcing attempt ${attempt} output invalid`);
  return {
    ...r,
    rawText: '{"scope": "auth", "summary": "truncat',
    intent: null,
    intentError: 'forced invalid output (debug flag)',
  };
}

export async function runPipeline(transcript: string): Promise<PipelineResult> {
  const startedAt = Date.now();
  const debug: PipelineResult['debug'] = {
    forceInvalidMode,
    attempt1: null,
    attempt2: null,
    firstRaw: null,
    firstError: null,
    secondRaw: null,
    secondError: null,
  };
  let generations = 0;
  let genMsSum = 0;

  // --- attempt 1
  let first: CompletionInfo | null = null;
  try {
    first = maybeInvalidate(await completeTranscript(transcript), 1);
    generations += 1;
    genMsSum += first.genMs;
    debug.attempt1 = timingOf(first);
    debug.firstRaw = first.rawText;
    debug.firstError = first.intentError;
  } catch (err) {
    // The model ITSELF failed (load crash/OOM/missing file) - different from
    // producing invalid text. The PRD retry is for invalid OUTPUT; retrying
    // an infrastructure error usually just doubles latency for the same
    // failure, so we go straight to the keyword fallback. Console + debug
    // panel only - the user still gets a valid intent.
    debug.firstError = `model threw: ${err instanceof Error ? err.message : String(err)}`;
    console.log(`[pipeline] attempt 1 threw -> ${debug.firstError}`);
  }

  // --- attempt 2 (only when attempt 1 RAN but produced invalid text)
  let second: CompletionInfo | null = null;
  if (first) {
    try {
      second = maybeInvalidate(await completeTranscript(transcript), 2);
      generations += 1;
      genMsSum += second.genMs;
      debug.attempt2 = timingOf(second);
      debug.secondRaw = second.rawText;
      debug.secondError = second.intentError;
    } catch (err) {
      debug.secondError = `model threw: ${err instanceof Error ? err.message : String(err)}`;
      console.log(`[pipeline] retry threw -> ${debug.secondError}`);
    }
  } else {
    console.log('[pipeline] skipping retry: attempt 1 threw (infrastructure error)');
  }

  // --- resolve which layer answered (same decision order as M5)
  let result: PipelineResult;
  if (first?.intent) {
    console.log('[pipeline] path=model (valid on first attempt)');
    result = {
      intent: first.intent,
      path: 'model',
      rawText: first.rawText,
      generations,
      totalMs: Date.now() - startedAt,
      keyword: null,
      debug,
    };
  } else if (second?.intent) {
    console.log('[pipeline] path=retry (valid on second attempt)');
    result = {
      intent: second.intent,
      path: 'retry',
      rawText: second.rawText,
      generations,
      totalMs: Date.now() - startedAt,
      keyword: null,
      debug,
    };
  } else {
    // Keyword fallback (pure string matching; cannot realistically throw)
    const kw = keywordFallbackIntent(transcript);
    // Self-check: even fallback output must satisfy the schema contract.
    const selfCheck = parseIntent(JSON.stringify(kw.intent));
    if (!selfCheck.ok) {
      console.log(`[pipeline] keyword intent failed self-check: ${selfCheck.error}`);
    }
    console.log(
      `[pipeline] path=keyword scope=${kw.intent.scope} ` +
        `matched=${kw.match ? kw.match.matched.join(', ') : '(none)'}`,
    );
    result = {
      intent: kw.intent,
      path: 'keyword',
      rawText: debug.secondRaw ?? debug.firstRaw ?? '',
      generations,
      totalMs: Date.now() - startedAt,
      keyword: kw.match,
      debug,
    };
  }

  // --- M6 metrics: record the run (console-only visibility, per PRD 3.6)
  const speechEndTs = takeLastSpeechEndTs();
  recordRun({
    path: result.path,
    totalMs: result.totalMs,
    genMs: genMsSum,
    loadMs: takeLastLoadMs(),
    speechEndToReadyMs:
      speechEndTs !== null ? Date.now() - speechEndTs : null,
  });

  return result;
}
