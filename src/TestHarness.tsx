/**
 * M4 prompt test harness (A/B): runs the >=25-sentence suite against the
 * on-device model and prints a pass/fail table with latency.
 * - baseline = M3 system-only prompt (the "before")
 * - fewshot  = M4 few-shot prompt (the "after")
 * Runs sequentially; each sentence gets its own grammar-constrained
 * completion, exactly like the real pipeline. Don't hide the harness
 * mid-run (results would be lost).
 * M6 adds FULL TEST: the same suite through the real public API
 * (runPipeline), so the fallback chain is part of the measurement.
 */
import React, { useState } from 'react';
import { ScrollView, Text, Button, StyleSheet, View } from 'react-native';

import { completeTranscript } from './pipeline/llm';
import { runPipeline } from './pipeline';
import { TEST_SENTENCES } from './pipeline/testSentences';

type Row = {
  text: string;
  expected: string;
  actual: string | null;
  pass: boolean;
  promptMs: number;
  genMs: number;
  tokensPerSecond: number;
  stoppedBy: string;
  error?: string;
};

type Mode = 'baseline' | 'fewshot';

type FullRow = {
  text: string;
  expected: string;
  actual: string;
  pass: boolean;
  path: string;
  totalMs: number;
};

/** Nearest-rank p95 over ascending-sorted values. */
function p95(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.max(0, Math.ceil(0.95 * sorted.length) - 1)];
}

export default function TestHarness({
  onFullTestDone,
}: {
  onFullTestDone?: () => void;
} = {}) {
  const [rows, setRows] = useState<Row[]>([]);
  const [running, setRunning] = useState(false);
  const [label, setLabel] = useState('');
  const [fullRows, setFullRows] = useState<FullRow[]>([]);
  const [fullRunning, setFullRunning] = useState(false);

  const run = async (mode: Mode) => {
    setRunning(true);
    setRows([]);
    setLabel(mode);
    const out: Row[] = [];
    for (let i = 0; i < TEST_SENTENCES.length; i++) {
      const s = TEST_SENTENCES[i];
      console.log(
        `[harness:${mode}] ${i + 1}/${TEST_SENTENCES.length}: "${s.text}"`,
      );
      try {
        const r = await completeTranscript(s.text, {
          fewShot: mode === 'fewshot',
        });
        const actual = r.intent?.scope ?? null;
        out.push({
          text: s.text,
          expected: s.expected,
          actual,
          pass: actual === s.expected,
          promptMs: r.promptMs,
          genMs: r.genMs,
          tokensPerSecond: r.tokensPerSecond,
          stoppedBy: r.stoppedBy,
          error: r.intentError ?? undefined,
        });
      } catch (err) {
        out.push({
          text: s.text,
          expected: s.expected,
          actual: null,
          pass: false,
          promptMs: 0,
          genMs: 0,
          tokensPerSecond: 0,
          stoppedBy: 'error',
          error: err instanceof Error ? err.message : String(err),
        });
      }
      setRows([...out]);
    }
    setRunning(false);
  };

  /**
   * M6 FULL TEST: every sentence goes through the REAL public API
   * (runPipeline), so "actual" may come from the model, a retry, or the
   * keyword fallback - the path column shows which layer answered.
   */
  const runFullTest = async () => {
    setFullRunning(true);
    setFullRows([]);
    const out: FullRow[] = [];
    for (let i = 0; i < TEST_SENTENCES.length; i++) {
      const s = TEST_SENTENCES[i];
      console.log(`[fulltest] ${i + 1}/${TEST_SENTENCES.length}: "${s.text}"`);
      const result = await runPipeline(s.text);
      const actual = result.intent.scope;
      out.push({
        text: s.text,
        expected: s.expected,
        actual,
        pass: actual === s.expected,
        path: result.path,
        totalMs: result.totalMs,
      });
      setFullRows([...out]);
    }
    setFullRunning(false);
    onFullTestDone?.();
  };

  const passed = rows.filter((r) => r.pass).length;
  const avgGen = rows.length
    ? Math.round(rows.reduce((a, r) => a + r.genMs, 0) / rows.length)
    : 0;
  const avgPrompt = rows.length
    ? Math.round(rows.reduce((a, r) => a + r.promptMs, 0) / rows.length)
    : 0;

  const fullPass = fullRows.filter((r) => r.pass).length;
  const fullMean = fullRows.length
    ? Math.round(fullRows.reduce((a, r) => a + r.totalMs, 0) / fullRows.length)
    : 0;
  const fullP95 = p95(fullRows.map((r) => r.totalMs));
  const fullCounts = { model: 0, retry: 0, keyword: 0 };
  for (const r of fullRows) {
    fullCounts[r.path as keyof typeof fullCounts] += 1;
  }

  return (
    <ScrollView contentContainerStyle={styles.wrap}>
      <Text style={styles.title}>Harness: {TEST_SENTENCES.length} sentences</Text>
      <View style={styles.buttons}>
        <Button
          title="1) Run baseline (M3, before)"
          onPress={() => run('baseline')}
          disabled={running}
        />
        <Button
          title="2) Run few-shot (M4, after)"
          onPress={() => run('fewshot')}
          disabled={running}
        />
        <Button
          title="3) FULL TEST (public API + fallback)"
          onPress={runFullTest}
          disabled={running || fullRunning}
          color="#0b57d0"
        />
      </View>
      {running ? (
        <Text style={styles.note}>
          Running {label}... {rows.length}/{TEST_SENTENCES.length}
        </Text>
      ) : null}
      {rows.length > 0 ? (
        <Text style={styles.summary}>
          {label}: {passed}/{rows.length} pass | avg prompt {avgPrompt}ms | avg
          gen {avgGen}ms
        </Text>
      ) : null}
      {rows.map((r, i) => (
        <View key={i} style={[styles.row, r.pass ? styles.pass : styles.fail]}>
          <Text style={styles.text}>
            {i + 1}. "{r.text}"
          </Text>
          <Text style={styles.line}>
            expected={r.expected} | actual={r.actual ?? 'null'} |{' '}
            {r.pass ? 'PASS' : 'FAIL'} | prompt={r.promptMs}ms gen={r.genMs}ms |{' '}
            {r.tokensPerSecond} tok/s | {r.stoppedBy}
          </Text>
          {r.error ? (
            <Text style={styles.err}>raw invalid: {r.error}</Text>
          ) : null}
        </View>
      ))}

      {fullRunning ? (
        <Text style={styles.note}>
          Full test running... {fullRows.length}/{TEST_SENTENCES.length}
        </Text>
      ) : null}
      {fullRows.length > 0 ? (
        <Text style={styles.summary}>
          FULL TEST: {fullPass}/{fullRows.length} pass | mean {fullMean}ms | p95{' '}
          {fullP95}ms | paths model/retry/keyword = {fullCounts.model}/
          {fullCounts.retry}/{fullCounts.keyword}
        </Text>
      ) : null}
      {fullRows.map((r, i) => (
        <View key={i} style={[styles.row, r.pass ? styles.pass : styles.fail]}>
          <Text style={styles.text}>
            {i + 1}. "{r.text}"
          </Text>
          <Text style={styles.line}>
            expected={r.expected} | actual={r.actual} |{' '}
            {r.pass ? 'PASS' : 'FAIL'} | path={r.path} | {r.totalMs}ms
          </Text>
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  wrap: {
    padding: 12,
  },
  title: {
    fontSize: 16,
    fontFamily: 'sans-serif-medium',
    marginBottom: 8,
    color: '#202124',
  },
  buttons: {
    gap: 8,
    marginBottom: 8,
  },
  note: {
    fontSize: 12,
    color: '#555',
    marginBottom: 6,
  },
  summary: {
    fontSize: 14,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  row: {
    padding: 6,
    borderRadius: 4,
    marginBottom: 4,
  },
  pass: {
    backgroundColor: '#e6f4ea',
  },
  fail: {
    backgroundColor: '#fce8e6',
  },
  text: {
    fontSize: 13,
    color: '#000',
  },
  line: {
    fontSize: 12,
    fontFamily: 'monospace',
    color: '#333',
    marginTop: 2,
  },
  err: {
    fontSize: 11,
    color: '#b00020',
    marginTop: 2,
  },
});
