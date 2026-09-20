/**
 * M6 metrics (PRD acceptance criterion: "Measured end-to-end latency
 * (speech end -> JSON ready) - this number goes directly into the pitch").
 *
 * What is tracked per run (recordRun, called by pipeline.ts):
 *  - speechEndToReadyMs: from the STT session 'end' event to the moment
 *    runPipeline() resolves with a valid intent. null when the user typed
 *    manually (no speech involved in that run).
 *  - totalMs: runPipeline() wall time (all attempts + parse).
 *  - genMs: generation compute across attempts (attempt1 + attempt2).
 *  - loadMs: model load duration, only on runs that actually loaded it.
 *  - path: which fallback layer answered (model / retry / keyword).
 *
 * mean = arithmetic mean. p95 = nearest-rank percentile (ceil(0.95 * n)-th
 * value of the ascending-sorted list) - simple, deterministic, and covered
 * by a unit test so the pitch numbers are trustworthy.
 */

/** Kept in sync with PipelinePath in pipeline.ts. */
export type MetricsPath = 'model' | 'retry' | 'keyword';

export type RunSample = {
  path: MetricsPath;
  totalMs: number;
  genMs: number;
  loadMs: number | null;
  speechEndToReadyMs: number | null;
};

export type PathCounts = { model: number; retry: number; keyword: number };

export type MetricsStats = {
  runs: number;
  meanTotalMs: number;
  p95TotalMs: number;
  meanGenMs: number;
  p95GenMs: number;
  /** Most recent model-load duration (null if no load was recorded). */
  lastLoadMs: number | null;
  speechToReadyCount: number;
  meanSpeechToReadyMs: number;
  p95SpeechToReadyMs: number;
  pathCounts: PathCounts;
};

const samples: RunSample[] = [];

/** Record one pipeline run; also prints the current summary to console. */
export function recordRun(sample: RunSample): void {
  samples.push(sample);
  logSummary();
}

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

/** Nearest-rank p95: the ceil(0.95 * n)-th value of the sorted list. */
function p95(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.max(0, Math.ceil(0.95 * sorted.length) - 1)];
}

/** Immutable snapshot of all tracked stats (for the debug screen). */
export function getMetricsStats(): MetricsStats {
  const totals = samples.map((s) => s.totalMs);
  const gens = samples.map((s) => s.genMs);
  const speech = samples
    .map((s) => s.speechEndToReadyMs)
    .filter((v): v is number => v !== null);
  const loads = samples
    .map((s) => s.loadMs)
    .filter((v): v is number => v !== null);

  const pathCounts: PathCounts = { model: 0, retry: 0, keyword: 0 };
  for (const s of samples) pathCounts[s.path] += 1;

  return {
    runs: samples.length,
    meanTotalMs: Math.round(mean(totals)),
    p95TotalMs: Math.round(p95(totals)),
    meanGenMs: Math.round(mean(gens)),
    p95GenMs: Math.round(p95(gens)),
    lastLoadMs: loads.length > 0 ? loads[loads.length - 1] : null,
    speechToReadyCount: speech.length,
    meanSpeechToReadyMs: Math.round(mean(speech)),
    p95SpeechToReadyMs: Math.round(p95(speech)),
    pathCounts,
  };
}

/** Clear all recorded runs (debug screen "Reset metrics"). */
export function resetMetrics(): void {
  samples.length = 0;
  console.log('[metrics] reset - all recorded runs cleared');
}

/** One clearly-formatted console block with the current stats. */
export function logSummary(): void {
  const s = getMetricsStats();
  console.log('[metrics] ---------------------------------');
  console.log(
    `[metrics] runs=${s.runs} | paths model/retry/keyword = ` +
      `${s.pathCounts.model}/${s.pathCounts.retry}/${s.pathCounts.keyword}`,
  );
  console.log(
    `[metrics] speech-end -> JSON ready: ` +
      `mean=${s.meanSpeechToReadyMs}ms p95=${s.p95SpeechToReadyMs}ms ` +
      `(n=${s.speechToReadyCount})`,
  );
  console.log(
    `[metrics] pipeline total: mean=${s.meanTotalMs}ms p95=${s.p95TotalMs}ms | ` +
      `gen: mean=${s.meanGenMs}ms p95=${s.p95GenMs}ms`,
  );
  if (s.lastLoadMs !== null) {
    console.log(`[metrics] last model load: ${s.lastLoadMs}ms`);
  }
}
