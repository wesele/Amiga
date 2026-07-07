const NATIVE_TTS_OK = new Set(["started", "queued", "ok", "initializing"]);

let activeNativeRequest = null;
let callbacksInstalled = false;
let previousDone = null;
let previousError = null;
let installedDone = null;
let installedError = null;

function restoreCallbacks() {
  if (typeof window === "undefined" || !callbacksInstalled) return;
  if (window.__amigaTtsDone === installedDone) {
    window.__amigaTtsDone = previousDone;
  }
  if (window.__amigaTtsError === installedError) {
    window.__amigaTtsError = previousError;
  }
  callbacksInstalled = false;
  installedDone = null;
  installedError = null;
}

function ensureCallbacks() {
  if (typeof window === "undefined") return;
  if (
    callbacksInstalled &&
    window.__amigaTtsDone === installedDone &&
    window.__amigaTtsError === installedError
  ) {
    return;
  }
  previousDone = window.__amigaTtsDone;
  previousError = window.__amigaTtsError;
  callbacksInstalled = true;

  installedDone = (...args) => {
    const request = activeNativeRequest;
    activeNativeRequest = null;
    restoreCallbacks();
    if (request?.onDone) {
      request.onDone(...args);
    }
    previousDone?.(...args);
  };
  window.__amigaTtsDone = installedDone;

  installedError = (...args) => {
    const request = activeNativeRequest;
    activeNativeRequest = null;
    restoreCallbacks();
    if (request?.onError) {
      request.onError(...args);
    }
    previousError?.(...args);
  };
  window.__amigaTtsError = installedError;
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
    console.warn("Native TTS failed:", err);
    return { started: false, result: "failed", token: null };
  }
  if (!NATIVE_TTS_OK.has(result)) {
    activeNativeRequest = null;
    return { started: false, result, token: null };
  }
  return { started: true, result, token };
}

export function stopNativeTts(token = null) {
  if (!token || activeNativeRequest?.token === token) {
    activeNativeRequest = null;
    restoreCallbacks();
  }
  if (typeof window !== "undefined" && window.__amigaTts?.stop) {
    window.__amigaTts.stop();
  }
}

export function __resetTtsBridgeForTests() {
  activeNativeRequest = null;
  callbacksInstalled = false;
  previousDone = null;
  previousError = null;
  installedDone = null;
  installedError = null;
}
