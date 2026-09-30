import { getSetting, saveSetting } from "@/shared/backend/settings.js";
import {
  TTS_ENGINE_KOKORO,
  TTS_ENGINE_SYSTEM,
  isNativeTtsAvailable,
  setNativeTtsEngine,
} from "@/shared/ttsBridge.js";

export const TTS_ENGINE_SETTING_KEY = "tts_engine";
export { TTS_ENGINE_KOKORO, TTS_ENGINE_SYSTEM };

export function canChooseAndroidTtsEngine() {
  return isNativeTtsAvailable() && typeof window.__amigaTts?.setEngine === "function";
}

export function normalizeTtsEngine(value) {
  return value === TTS_ENGINE_KOKORO ? TTS_ENGINE_KOKORO : TTS_ENGINE_SYSTEM;
}

export async function loadTtsEngineSetting() {
  try {
    const saved = await getSetting(TTS_ENGINE_SETTING_KEY);
    return normalizeTtsEngine(saved);
  } catch (err) {
    console.warn("Failed to load TTS engine setting:", err);
    return TTS_ENGINE_SYSTEM;
  }
}

export async function persistTtsEngineSetting(engine) {
  const next = normalizeTtsEngine(engine);
  await saveSetting(TTS_ENGINE_SETTING_KEY, next);
  return next;
}

export function applySavedTtsEngine(engine) {
  if (!canChooseAndroidTtsEngine()) {
    return { engine: TTS_ENGINE_SYSTEM, ready: false, downloading: false, supported: false };
  }
  return setNativeTtsEngine(normalizeTtsEngine(engine));
}

export function ttsDownloadPercent(status) {
  const total = Number(status?.totalBytes) || 0;
  const bytes = Number(status?.bytes) || 0;
  if (total <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((bytes / total) * 100)));
}

export async function chooseTtsEngine(engine) {
  const next = normalizeTtsEngine(engine);
  await persistTtsEngineSetting(next);
  const status = applySavedTtsEngine(next);
  if (next === TTS_ENGINE_KOKORO && status?.supported === false) {
    await persistTtsEngineSetting(TTS_ENGINE_SYSTEM);
    return { ...status, engine: TTS_ENGINE_SYSTEM, reverted: true };
  }
  return status;
}

export async function syncNativeTtsEngineFromSettings() {
  if (!canChooseAndroidTtsEngine()) return null;
  const engine = await loadTtsEngineSetting();
  const status = applySavedTtsEngine(engine);
  if (engine === TTS_ENGINE_KOKORO && status?.supported === false) {
    await persistTtsEngineSetting(TTS_ENGINE_SYSTEM);
    return { ...status, engine: TTS_ENGINE_SYSTEM, reverted: true };
  }
  return status;
}
