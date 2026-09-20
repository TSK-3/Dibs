/**
 * Surya pipeline - PUBLIC API (M6).
 *
 * The main app (Tejashwin) imports ONLY this module. Everything else in
 * src/pipeline/ is internal.
 *
 * Contract:
 *  - The handoff object is EXACTLY { scope, summary, rationale } - three
 *    string fields, scope is one of SCOPE_VALUES. Nothing else.
 *  - extractIntent()/runPipeline() NEVER throw and NEVER surface an error
 *    state; the fallback chain (model -> retry -> keyword -> default scope)
 *    guarantees a valid object.
 *  - user_id / timestamp are NOT added here - they belong to the main
 *    app's socket layer (Tejashwin's PRD), per the architecture split.
 *  - Which fallback path answered is logged to the console only; debug
 *    hooks (setForceInvalidOutput) exist for testing each path.
 */
import { runPipeline, type PipelineResult } from './pipeline';
import type { Scope } from './grammar';

// ---------------------------------------------------------------------------
// Re-exports (typed, so the main app gets autocomplete)
// ---------------------------------------------------------------------------

export type { Intent, Scope } from './grammar';
export { SCOPE_VALUES, parseIntent } from './grammar';

export {
  STT_LOCALE,
  setSttHandlers,
  startListening,
  stopListening,
  getOnDeviceStatus,
  downloadOfflineModel,
  type SttHandlers,
  type SttErrorInfo,
  type OnDeviceStatus,
} from './stt';

export {
  loadModel,
  releaseModel,
  isModelLoaded,
  type ModelLoadInfo,
} from './llm';

export {
  runPipeline,
  setForceInvalidOutput,
  type PipelineResult,
  type PipelinePath,
  type ForceInvalidMode,
} from './pipeline';

export {
  getMetricsStats,
  resetMetrics,
  logSummary,
  type MetricsStats,
} from './metrics';

/** Warm-up alias: call early (e.g. after mount) so the first run is fast. */
export { loadModel as initModel } from './llm';

// ---------------------------------------------------------------------------
// The handoff object
// ---------------------------------------------------------------------------

/** EXACTLY what Tejashwin's code receives and forwards. */
export type HandoffIntent = {
  scope: Scope;
  summary: string;
  rationale: string;
};

/**
 * Convenience wrapper for the main app: runs the full pipeline (including
 * the fallback chain) and returns ONLY { scope, summary, rationale }.
 * Never throws. Path/debug detail is available via runPipeline() instead.
 */
export async function extractIntent(transcript: string): Promise<HandoffIntent> {
  const result: PipelineResult = await runPipeline(transcript);
  return {
    scope: result.intent.scope,
    summary: result.intent.summary,
    rationale: result.intent.rationale,
  };
}
