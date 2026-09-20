/**
 * Surya debug screen (M2): STT + local LLM, both fully on-device.
 * Logic lives in src/pipeline/ so the main app can import it later;
 * this screen exposes every step visibly for testing.
 */
import React, { useEffect, useState } from 'react';
import {
  SafeAreaView,
  ScrollView,
  Text,
  TextInput,
  Button,
  StyleSheet,
  View,
} from 'react-native';

import {
  STT_LOCALE,
  setSttHandlers,
  startListening,
  stopListening,
  getOnDeviceStatus,
  downloadOfflineModel,
  type OnDeviceStatus,
  type SttErrorInfo,
} from './src/pipeline/stt';
import {
  loadModel,
  releaseModel,
  runPipeline,
  setForceInvalidOutput,
  getMetricsStats,
  resetMetrics,
  type ModelLoadInfo,
  type PipelineResult,
  type ForceInvalidMode,
  type MetricsStats,
} from './src/pipeline';
import TestHarness from './src/TestHarness';

function toMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export default function App() {
  // --- STT state
  const [recognizing, setRecognizing] = useState(false);
  const [partialTranscript, setPartialTranscript] = useState('');
  const [finalTranscript, setFinalTranscript] = useState('');
  const [sttError, setSttError] = useState<SttErrorInfo | null>(null);
  const [onDevice, setOnDevice] = useState<OnDeviceStatus | null>(null);
  const [downloadStatus, setDownloadStatus] = useState('');

  // --- LLM state
  const [manualText, setManualText] = useState('');
  const [loadInfo, setLoadInfo] = useState<ModelLoadInfo | null>(null);
  const [pipeline, setPipeline] = useState<
    (PipelineResult & { source: 'stt' | 'manual' }) | null
  >(null);
  const [busy, setBusy] = useState(false);
  const [llmError, setLlmError] = useState<string | null>(null);
  const [showHarness, setShowHarness] = useState(false);
  const [forceMode, setForceMode] = useState<ForceInvalidMode>('off');
  const [stats, setStats] = useState<MetricsStats | null>(null);

  useEffect(() => {
    setSttHandlers({
      onPartial: setPartialTranscript,
      onFinal: (text) => {
        setPartialTranscript('');
        setFinalTranscript(text);
      },
      onError: setSttError,
      onEnd: () => setRecognizing(false),
    });
    setStats(getMetricsStats());
    getOnDeviceStatus()
      .then(setOnDevice)
      .catch((err: unknown) => console.log('[stt] status check failed', err));
    return () => {
      releaseModel().catch(() => {});
    };
  }, []);

  const handleStart = () => {
    setSttError(null);
    setRecognizing(true);
    startListening().catch((err: unknown) => {
      setRecognizing(false);
      setSttError({ code: 'start-failed', message: toMessage(err) });
    });
  };

  const handleStop = () => {
    stopListening().catch(() => {});
  };

  const handleDownloadModel = () => {
    setDownloadStatus('Requesting download...');
    downloadOfflineModel()
      .then(async (result) => {
        setDownloadStatus(`${result.status}: ${result.message}`);
        setOnDevice(await getOnDeviceStatus());
      })
      .catch((err: unknown) => setDownloadStatus(`failed: ${toMessage(err)}`));
  };

  const handleLoadModel = async () => {
    setBusy(true);
    setLlmError(null);
    try {
      setLoadInfo(await loadModel());
    } catch (err: unknown) {
      setLlmError(`Model load failed: ${toMessage(err)}`);
    } finally {
      setBusy(false);
    }
  };

  const handleSendToModel = async () => {
    const text = manualText.trim() || finalTranscript.trim();
    if (!text) {
      setLlmError('Nothing to send - speak first or type text above.');
      return;
    }
    setBusy(true);
    setLlmError(null);
    try {
      // Production path (PRD 3.6): never throws, never shows an error
      // state. Path taken (model/retry/keyword) is in result.path and the
      // console only; detail lives in result.debug for the debug panel.
      const result = await runPipeline(text);
      setPipeline({ ...result, source: manualText.trim() ? 'manual' : 'stt' });
    } catch (err: unknown) {
      // runPipeline is designed not to throw; this is a paranoia net that
      // still yields a valid intent instead of an error state.
      console.log('[pipeline] unexpected error - defaulting', err);
      setPipeline({
        intent: {
          scope: 'backend',
          summary: 'Voice update',
          rationale: 'Unexpected pipeline error - defaulted to backend',
        },
        path: 'keyword',
        rawText: '',
        generations: 0,
        totalMs: 0,
        keyword: null,
        debug: {
          forceInvalidMode: 'off',
          attempt1: null,
          attempt2: null,
          firstRaw: null,
          firstError: toMessage(err),
          secondRaw: null,
          secondError: null,
        },
        source: manualText.trim() ? 'manual' : 'stt',
      });
    } finally {
      setBusy(false);
      setStats(getMetricsStats());
    }
  };

  const handleResetMetrics = () => {
    resetMetrics();
    setStats(getMetricsStats());
  };

  const handleForceInvalid = (mode: ForceInvalidMode) => {
    setForceInvalidOutput(mode);
    setForceMode(mode);
  };

  const onDeviceLabel = onDevice
    ? onDevice.deviceSupported
      ? 'YES'
      : 'NO'
    : 'checking...';
  const packLabel =
    onDevice?.localeInstalled === true
      ? ' | pack installed'
      : onDevice?.localeInstalled === false
        ? ' | pack NOT installed'
        : '';

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.title}>STT + LLM (on-device)</Text>

        {/* ---------- STT ---------- */}
        <Text style={styles.sectionTitle}>1. Speech to text</Text>
        <Text style={styles.statusLine}>
          On-device: {onDeviceLabel} | Language: {STT_LOCALE}
          {packLabel}
        </Text>
        {onDevice?.note ? <Text style={styles.note}>{onDevice.note}</Text> : null}

        <View style={styles.buttons}>
          <Button
            title="Start Listening"
            onPress={handleStart}
            disabled={recognizing}
            color="#0b57d0"
          />
          <Button
            title="Stop Listening"
            onPress={handleStop}
            disabled={!recognizing}
            color="#0b57d0"
          />
          <Button
            title="Download offline language pack"
            onPress={handleDownloadModel}
            color="#0b57d0"
          />
        </View>
        {downloadStatus ? (
          <Text style={styles.note}>Pack download: {downloadStatus}</Text>
        ) : null}
        {sttError ? (
          <Text style={styles.error}>
            STT error [{sttError.code}]
            {sttError.nativeCode != null
              ? ` (native ${sttError.nativeCode})`
              : ''}
            : {sttError.message}
          </Text>
        ) : null}

        <Text style={styles.label}>Live (partial):</Text>
        <Text style={styles.partial}>{partialTranscript || '(listening...)'}</Text>

        <Text style={styles.label}>Final transcript:</Text>
        <Text style={styles.final}>{finalTranscript || '(nothing yet)'}</Text>

        {/* ---------- LLM ---------- */}
        <Text style={styles.sectionTitle}>2. Local LLM (Qwen2.5-0.5B)</Text>

        <Text style={styles.label}>Or type text manually (no mic):</Text>
        <TextInput
          style={styles.input}
          value={manualText}
          onChangeText={setManualText}
          placeholder="e.g. starting on the auth refactor, cleaning up token validation"
          multiline
        />

        <View style={styles.buttons}>
          <Button
            title="Load model"
            onPress={handleLoadModel}
            disabled={busy}
            color="#0b57d0"
          />
          <Button
            title="Send transcript to model"
            onPress={handleSendToModel}
            disabled={busy}
            color="#0b57d0"
          />
        </View>

        {loadInfo ? (
          <Text style={styles.note}>
            Model load time: {loadInfo.loadMs}ms - {loadInfo.modelDesc} (
            {loadInfo.modelSizeMb}MB, gpu={String(loadInfo.gpu)}
            {loadInfo.reasonNoGPU ? `, ${loadInfo.reasonNoGPU}` : ''})
          </Text>
        ) : (
          <Text style={styles.note}>Model not loaded yet.</Text>
        )}
        {llmError ? <Text style={styles.error}>{llmError}</Text> : null}

        {pipeline ? (
          <View>
            <Text style={styles.label}>
              Extracted intent (path: {pipeline.path}):
            </Text>
            <View style={styles.intentBox}>
              <Text style={styles.intentScope}>
                scope: {pipeline.intent.scope}
              </Text>
              <Text style={styles.intentLine}>
                summary: {pipeline.intent.summary}
              </Text>
              <Text style={styles.intentLine}>
                rationale: {pipeline.intent.rationale}
              </Text>
              <Text style={styles.note}>
                always 3 fields - schema-validated intent, never an error state
              </Text>
            </View>

            <Text style={styles.note}>
              path={pipeline.path} | generations={pipeline.generations} |{' '}
              total={pipeline.totalMs}ms
            </Text>
            {pipeline.keyword ? (
              <Text style={styles.note}>
                keyword fallback matched: {pipeline.keyword.matched.join(', ')}
              </Text>
            ) : null}
            {pipeline.debug.attempt1 ? (
              <Text style={styles.note}>
                attempt1: prompt={pipeline.debug.attempt1.promptMs}ms gen=
                {pipeline.debug.attempt1.genMs}ms{' '}
                {pipeline.debug.attempt1.tokensPerSecond} tok/s stoppedBy=
                {pipeline.debug.attempt1.stoppedBy}
              </Text>
            ) : null}
            {pipeline.debug.attempt2 ? (
              <Text style={styles.note}>
                attempt2: prompt={pipeline.debug.attempt2.promptMs}ms gen=
                {pipeline.debug.attempt2.genMs}ms{' '}
                {pipeline.debug.attempt2.tokensPerSecond} tok/s stoppedBy=
                {pipeline.debug.attempt2.stoppedBy}
              </Text>
            ) : null}
          </View>
        ) : null}

        {/* ---------- Test harness (M4) ---------- */}
        <Text style={styles.sectionTitle}>3. Prompt test harness (A/B)</Text>
        <Button
          title={showHarness ? 'Hide test harness' : 'Show test harness'}
          onPress={() => setShowHarness(!showHarness)}
          color="#0b57d0"
        />
        {showHarness ? (
          <TestHarness onFullTestDone={() => setStats(getMetricsStats())} />
        ) : null}

        {/* ---------- Pipeline debug panel (M5) ----------
            Always visible so the force-invalid controls can be used BEFORE
            the first Send. Per-attempt raws/errors only exist once a
            pipeline result is present (hence the optional chaining). The
            user-facing intent panel above never becomes an error state. */}
        <Text style={styles.sectionTitle}>4. Pipeline debug panel</Text>
        <Text style={styles.note}>Current force mode: {forceMode}</Text>
        <View style={styles.buttons}>
          <Button
            title="Force invalid: off"
            onPress={() => handleForceInvalid('off')}
            color="#0b57d0"
          />
          <Button
            title="Force invalid: 1st attempt (tests retry)"
            onPress={() => handleForceInvalid('first-attempt')}
            color="#0b57d0"
          />
          <Button
            title="Force invalid: always (tests keyword)"
            onPress={() => handleForceInvalid('always')}
            color="#0b57d0"
          />
        </View>

        <Text style={styles.label}>
          Latency metrics (all runs since reset):
        </Text>
        {stats ? (
          <Text style={styles.note}>
            runs={stats.runs} | paths model/retry/keyword ={' '}
            {stats.pathCounts.model}/{stats.pathCounts.retry}/
            {stats.pathCounts.keyword}
            {'\n'}
            speech-end → JSON ready: mean={stats.meanSpeechToReadyMs}ms p95=
            {stats.p95SpeechToReadyMs}ms (n={stats.speechToReadyCount})
            {'\n'}
            pipeline total: mean={stats.meanTotalMs}ms p95={stats.p95TotalMs}ms{' '}
            | gen: mean={stats.meanGenMs}ms p95={stats.p95GenMs}ms
            {'\n'}
            last model load:{' '}
            {stats.lastLoadMs !== null ? `${stats.lastLoadMs}ms` : 'n/a'}
          </Text>
        ) : null}
        <Button
          title="Reset metrics"
          color="#0b57d0"
          onPress={handleResetMetrics}
        />

        {pipeline?.debug.firstRaw ? (
          <>
            <Text style={styles.label}>Attempt 1 raw:</Text>
            <Text style={styles.output}>{pipeline.debug.firstRaw}</Text>
          </>
        ) : null}
        {pipeline?.debug.firstError ? (
          <Text style={styles.error}>
            Attempt 1 note: {pipeline.debug.firstError}
          </Text>
        ) : null}
        {pipeline?.debug.secondRaw ? (
          <>
            <Text style={styles.label}>Attempt 2 raw:</Text>
            <Text style={styles.output}>{pipeline.debug.secondRaw}</Text>
          </>
        ) : null}
        {pipeline?.debug.secondError ? (
          <Text style={styles.error}>
            Attempt 2 note: {pipeline.debug.secondError}
          </Text>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  scroll: {
    padding: 20,
    paddingBottom: 40,
  },
  title: {
    fontSize: 24,
    fontFamily: 'sans-serif-medium',
    marginBottom: 16,
    color: '#111111',
  },
  sectionTitle: {
    fontSize: 17,
    fontFamily: 'sans-serif-medium',
    marginTop: 14,
    marginBottom: 8,
    color: '#202124',
  },
  statusLine: {
    fontSize: 14,
    marginBottom: 8,
    color: '#333',
  },
  buttons: {
    gap: 12,
    marginBottom: 12,
  },
  label: {
    fontSize: 14,
    fontFamily: 'sans-serif-medium',
    marginTop: 8,
    marginBottom: 4,
    color: '#202124',
  },
  partial: {
    fontSize: 16,
    color: '#666',
    marginBottom: 8,
  },
  final: {
    fontSize: 16,
    color: '#000',
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: '#999',
    borderRadius: 6,
    padding: 8,
    fontSize: 14,
    minHeight: 48,
    marginBottom: 12,
  },
  output: {
    fontSize: 15,
    fontFamily: 'monospace',
    backgroundColor: '#eee',
    padding: 8,
    borderRadius: 6,
  },
  intentBox: {
    backgroundColor: '#f1f3f4',
    borderRadius: 8,
    padding: 10,
    marginBottom: 8,
  },
  intentScope: {
    fontSize: 16,
    fontFamily: 'sans-serif-medium',
    color: '#111111',
  },
  intentLine: {
    fontSize: 14,
    color: '#202124',
    marginTop: 4,
  },
  note: {
    fontSize: 12,
    color: '#555',
    marginBottom: 8,
  },
  error: {
    fontSize: 13,
    color: '#b00020',
    marginBottom: 8,
  },
});
