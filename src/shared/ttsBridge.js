const NATIVE_TTS_OK = new Set(["started", "queued", "ok", "initializing", "downloading", "fallback-system"]);

export const TTS_ENGINE_SYSTEM = "system";
export const TTS_ENGINE_KOKORO = "kokoro";

let activeNativeRequest = null;
let callbacksInstalled = false;
let previousDone = null;
let previousError = null;
let previousProgress = null;
let installedDone = null;
let installedError = null;
let installedProgress = null;
const progressListeners = new Set();

function restoreCallbacks() {
  if (typeof window === "undefined" || !callbacksInstalled) return;
  if (window.__amigaTtsDone === installedDone) {
    window.__amigaTtsDone = previousDone;
  }
  if (window.__amigaTtsError === installedError) {
    window.__amigaTtsError = previousError;
  }
  if (window.__amigaTtsProgress === installedProgress) {
    window.__amigaTtsProgress = previousProgress;
  }
  callbacksInstalled = false;
  installedDone = null;
  installedError = null;
  installedProgress = null;
}

function parseNativePayload(payload) {
  if (payload && typeof payload === "object") return payload;
  if (typeof payload !== "string") return { state: payload };
  const text = payload.trim();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { state: text, message: text };
  }
}

function ensureCallbacks() {
  if (typeof window === "undefined") return;
  if (
    callbacksInstalled &&
    window.__amigaTtsDone === installedDone &&
    window.__amigaTtsError === installedError &&
    window.__amigaTtsProgress === installedProgress
  ) {
    return;
  }
  previousDone = window.__amigaTtsDone;
  previousError = window.__amigaTtsError;
  previousProgress = window.__amigaTtsProgress;
  callbacksInstalled = true;

  installedDone = (...args) => {
    const request = activeNativeRequest;
    activeNativeRequest = null;
    maybeRestoreCallbacks();
    if (request?.onDone) {
      request.onDone(...args);
    }
    previousDone?.(...args);
  };
  window.__amigaTtsDone = installedDone;

  installedError = (...args) => {
    const request = activeNativeRequest;
    activeNativeRequest = null;
    maybeRestoreCallbacks();
    if (request?.onError) {
      request.onError(...args);
    }
    previousError?.(...args);
  };
  window.__amigaTtsError = installedError;

  installedProgress = (payload) => {
    const parsed = parseNativePayload(payload);
    for (const listener of progressListeners) {
      try {
        listener(parsed);
      } catch (err) {
        console.warn("Native TTS progress listener failed:", err);
      }
    }
    previousProgress?.(payload);
  };
  window.__amigaTtsProgress = installedProgress;
}

export function isNativeTtsAvailable() {
  return !!(
    typeof window !== "undefined" &&
    window.__amigaTts &&
    typeof window.__amigaTts.speak === "function"
  );
}

export function speakNativeTts(text, speechLang, { onDone, onError } = {}) {
  if (!text || !isNativeTtsAvailable()) {
    return { started: false, result: "unavailable", token: null };
  }
  ensureCallbacks();
  const token = Symbol("native-tts");
  activeNativeRequest = { token, onDone, onError };
  let result = "failed";
  try {
    result = window.__amigaTts.speak(text, speechLang);
  } catch (err) {
    activeNativeRequest = null;
    maybeRestoreCallbacks();
    console.warn("Native TTS failed:", err);
    return { started: false, result: "failed", token: null };
  }
  if (!NATIVE_TTS_OK.has(result)) {
    activeNativeRequest = null;
    maybeRestoreCallbacks();
    return { started: false, result, token: null };
  }
  return { started: true, result, token };
}

function maybeRestoreCallbacks() {
  if (activeNativeRequest || progressListeners.size > 0) return;
  restoreCallbacks();
}

export function stopNativeTts(token = null) {
  if (!token || activeNativeRequest?.token === token) {
    activeNativeRequest = null;
    maybeRestoreCallbacks();
  }
  if (typeof window !== "undefined" && window.__amigaTts?.stop) {
    window.__amigaTts.stop();
  }
}

export function onNativeTtsProgress(listener) {
  if (typeof listener !== "function") return () => {};
  ensureCallbacks();
  progressListeners.add(listener);
  return () => {
    progressListeners.delete(listener);
    maybeRestoreCallbacks();
  };
}

export function getNativeTtsStatus() {
  if (!isNativeTtsAvailable() || typeof window.__amigaTts.getStatus !== "function") {
    return { engine: TTS_ENGINE_SYSTEM, ready: false, downloading: false, supported: false };
  }
  try {
    return {
      engine: TTS_ENGINE_SYSTEM,
      ready: true,
      downloading: false,
      supported: true,
      ...parseNativePayload(window.__amigaTts.getStatus()),
    };
  } catch (err) {
    console.warn("Native TTS status failed:", err);
    return { engine: TTS_ENGINE_SYSTEM, ready: false, downloading: false, supported: false };
  }
}

export function setNativeTtsEngine(engine) {
  if (!isNativeTtsAvailable() || typeof window.__amigaTts.setEngine !== "function") {
    return { engine: TTS_ENGINE_SYSTEM, ready: false, downloading: false, supported: false };
  }
  ensureCallbacks();
  try {
    return {
      engine: TTS_ENGINE_SYSTEM,
      ready: true,
      downloading: false,
      supported: true,
      ...parseNativePayload(window.__amigaTts.setEngine(engine)),
    };
  } catch (err) {
    console.warn("Native TTS setEngine failed:", err);
    return { engine: TTS_ENGINE_SYSTEM, ready: false, downloading: false, supported: false };
  }
}

export function __resetTtsBridgeForTests() {
  activeNativeRequest = null;
  callbacksInstalled = false;
  previousDone = null;
  previousError = null;
  previousProgress = null;
  installedDone = null;
  installedError = null;
  installedProgress = null;
  progressListeners.clear();
}
