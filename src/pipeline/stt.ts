/**
 * STT stage of the Surya pipeline.
 *
 * Wraps expo-speech-recognition around Android's SpeechRecognizer with
 * on-device recognition FORCED (requiresOnDeviceRecognition: true), so audio
 * can never fall back to a network recognizer. This module is deliberately
 * UI-free so the main Expo app can import it later.
 */
import { ExpoSpeechRecognitionModule } from 'expo-speech-recognition';

/** The locale we demo with. Change once, here. */
export const STT_LOCALE = 'en-US';

export type SttErrorInfo = {
  code: string;
  message: string;
  /** Underlying Android SpeechRecognizer error constant, when present. */
  nativeCode?: number;
};

export type SttHandlers = {
  /** Interim transcript while the user is still speaking. */
  onPartial?: (text: string) => void;
  /** Final settled transcript for one utterance. */
  onFinal?: (text: string) => void;
  /** Recognition failures - shown on the debug screen, never swallowed. */
  onError?: (error: SttErrorInfo) => void;
  /** Recognition session ended (after stop, error, or timeout). */
  onEnd?: () => void;
};

let handlers: SttHandlers = {};
let listenersRegistered = false;
/** Set on each STT session end; consumed by the M6 latency metrics. */
let lastSpeechEndTs: number | null = null;

/** Register the handler set. Calling again replaces the previous set. */
export function setSttHandlers(next: SttHandlers): void {
  handlers = next;
}

/** Native event listeners are global; register them exactly once. */
function ensureEventListeners(): void {
  if (listenersRegistered) return;
  listenersRegistered = true;

  ExpoSpeechRecognitionModule.addListener('result', (event) => {
    const text = event.results[0]?.transcript ?? '';
    console.log(`[stt] result final=${event.isFinal} text="${text}"`);
    if (event.isFinal) {
      handlers.onFinal?.(text);
    } else {
      handlers.onPartial?.(text);
    }
  });

  ExpoSpeechRecognitionModule.addListener('error', (event) => {
    console.log(`[stt] error code=${event.error} message="${event.message}"`);
    handlers.onError?.({
      code: event.error,
      message: event.message,
      nativeCode: event.code,
    });
  });

  ExpoSpeechRecognitionModule.addListener('end', () => {
    console.log('[stt] end');
    // Session fully finished - the "speech end" anchor for latency metrics.
    lastSpeechEndTs = Date.now();
    handlers.onEnd?.();
  });
}

/** Ask for the microphone permission (Android: RECORD_AUDIO). */
export async function requestMicPermission(): Promise<boolean> {
  const result = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
  console.log(`[stt] permission status=${result.status} granted=${result.granted}`);
  return result.granted;
}

/**
 * Start listening. On-device recognition is REQUIRED, not just preferred:
 * if the device cannot honor it, start() fails with an error event instead
 * of silently falling back to the network recognizer - which is exactly what
 * we want to see on the debug screen during the airplane-mode test.
 */
export async function startListening(): Promise<void> {
  ensureEventListeners();
  const granted = await requestMicPermission();
  if (!granted) {
    throw new Error('Microphone permission was not granted');
  }
  console.log(
    `[stt] start locale=${STT_LOCALE} requiresOnDeviceRecognition=true`,
  );
  ExpoSpeechRecognitionModule.start({
    lang: STT_LOCALE,
    interimResults: true,
    continuous: false,
    requiresOnDeviceRecognition: true,
  });
}

/** Stop listening; the final transcript arrives via onFinal, then onEnd. */
export async function stopListening(): Promise<void> {
  console.log('[stt] stop');
  ExpoSpeechRecognitionModule.stop();
}

/**
 * Consume the epoch ms of the last STT session end (M6 metrics hook).
 * Returns null if no session has ended since the last call.
 */
export function takeLastSpeechEndTs(): number | null {
  const ts = lastSpeechEndTs;
  lastSpeechEndTs = null;
  return ts;
}

/** Can this device run recognition fully offline (for some locale)? */
export function deviceSupportsOnDeviceRecognition(): boolean {
  try {
    return ExpoSpeechRecognitionModule.supportsOnDeviceRecognition();
  } catch (err) {
    console.log('[stt] supportsOnDeviceRecognition failed', err);
    return false;
  }
}

export type OnDeviceStatus = {
  deviceSupported: boolean;
  /** true/false once known; null when the device can't tell us (Android 12-). */
  localeInstalled: boolean | null;
  supportedLocales: string[];
  installedLocales: string[];
  note?: string;
};

/**
 * Full on-device picture for our locale:
 * - deviceSupported: hardware/OS can do on-device recognition at all
 * - localeInstalled: the offline language pack for STT_LOCALE is present
 * getSupportedLocales() needs Android 13+; older devices get a note instead.
 */
export async function getOnDeviceStatus(): Promise<OnDeviceStatus> {
  const deviceSupported = deviceSupportsOnDeviceRecognition();
  try {
    const { locales, installedLocales } =
      await ExpoSpeechRecognitionModule.getSupportedLocales({});
    return {
      deviceSupported,
      localeInstalled: installedLocales.includes(STT_LOCALE),
      supportedLocales: locales,
      installedLocales,
    };
  } catch (err) {
    const note =
      'getSupportedLocales() unavailable (needs Android 13+). ' +
      'Check Settings for offline speech packs instead.';
    console.log(`[stt] ${note}`, err);
    return {
      deviceSupported,
      localeInstalled: null,
      supportedLocales: [],
      installedLocales: [],
      note,
    };
  }
}

/**
 * Trigger the Android system dialog to download the offline language pack.
 * Android 13: "opened_dialog" (fire and forget).
 * Android 14+: "download_success" or "download_scheduled".
 * Needs the phone online ONCE - do this before the demo, then never again.
 */
export async function downloadOfflineModel(
  locale: string = STT_LOCALE,
): Promise<{ status: string; message: string }> {
  console.log(`[stt] triggering offline model download for ${locale}`);
  try {
    const result =
      await ExpoSpeechRecognitionModule.androidTriggerOfflineModelDownload({
        locale,
      });
    console.log(`[stt] offline model download: ${result.status} - ${result.message}`);
    return result;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.log('[stt] offline model download failed:', message);
    throw new Error(`Offline model download failed: ${message}`);
  }
}
