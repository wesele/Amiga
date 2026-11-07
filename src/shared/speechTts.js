import {
  isNativeTtsAvailable,
  speakNativeTts,
  stopNativeTts,
} from "@/shared/ttsBridge.js";
import {
  getMultimodalConfig,
  getSetting,
  onMultimodalConfigSaved,
  saveSetting,
} from "@/shared/api.js";
import {
  buildGeminiLiveWsUrl,
  buildGeminiLiveSetupPayload,
  pcm16Base64ToFloat32,
} from "@/modules/speaking/useGeminiLiveSession.js";

export const GEMINI_LIVE_TTS_VOICE = "Fola";
export const GEMINI_LIVE_TTS_MODEL = "gemini-3.8-live";
export const GEMINI_LIVE_VOICE_SETTING_KEY = "gemini_live_voice";

export const GEMINI_LIVE_VOICES = Object.freeze([
  "Fola",
  "Aoede",
  "Charon",
  "Fenrir",
  "Kore",
  "Puck",
  "Zephyr",
]);

export const GEMINI_LIVE_VOICE_OPTIONS = Object.freeze([
  { id: "Fola", name: "Fola", hidden: true },
  { id: "Aoede", name: "Aoede", hidden: false },
  { id: "Charon", name: "Charon", hidden: false },
  { id: "Fenrir", name: "Fenrir", hidden: false },
  { id: "Kore", name: "Kore", hidden: false },
  { id: "Puck", name: "Puck", hidden: false },
  { id: "Zephyr", name: "Zephyr", hidden: false },
]);

export function normalizeGeminiLiveVoice(voice) {
  if (typeof voice !== "string") return GEMINI_LIVE_TTS_VOICE;
  const trimmed = voice.trim();
  if (!trimmed) return GEMINI_LIVE_TTS_VOICE;
  const match = GEMINI_LIVE_VOICES.find(
    (v) => v.toLowerCase() === trimmed.toLowerCase()
  );
  return match || GEMINI_LIVE_TTS_VOICE;
}

const SPEECH_LANG_MAP = {
  es: "es-ES",
  en: "en-US",
  zh: "zh-CN",
};

export function getSpeechLang(lang) {
  return SPEECH_LANG_MAP[lang] || lang || "en-US";
}

export function pickSpeechVoice(lang) {
  if (typeof window === "undefined" || !window.speechSynthesis) return null;
  const voices = window.speechSynthesis.getVoices?.() || [];
  if (!voices || !Array.isArray(voices) || voices.length === 0) return null;
  const langLower = (lang || "").toLowerCase();
  const family = langLower.split("-")[0];
  return (
    voices.find((voice) => voice.lang?.toLowerCase() === langLower) ||
    voices.find((voice) => voice.lang?.toLowerCase().startsWith(`${family}-`)) ||
    voices.find((voice) => voice.lang?.toLowerCase() === family) ||
    null
  );
}

/**
 * Checks whether the given multimodal configuration is set to Gemini 3.8 Live with a valid API key.
 *
 * @param {any} config
 * @returns {boolean}
 */
export function isGemini38LiveConfigured(config) {
  if (!config) return false;
  let active = config;
  if (config.active) {
    active = typeof config.active === "function" ? config.active() : config.active;
  } else if (config.mode) {
    active = config.mode === "custom" ? (config.custom || config.builtin) : config.builtin;
  }
  if (!active) return false;
  const apiKey = (active.api_key || active.apiKey || active.live_api_key || "").trim();
  const rawModel = (active.model || active.live_model || "").trim();
  const normalizedModel = rawModel.toLowerCase().replace(/^models\//, "");
  const baseUrl = (active.base_url || active.baseUrl || active.live_base_url || "").trim();

  // If apiKey starts with nvapi- and targets Google Gemini API, it's a fallback placeholder key and cannot use Gemini Live
  if (apiKey.startsWith("nvapi-") && (!baseUrl || baseUrl.includes("generativelanguage.googleapis.com"))) {
    return false;
  }

  return apiKey.length > 0 && normalizedModel === GEMINI_LIVE_TTS_MODEL;
}

/**
 * Resolves the active model config object from a MultimodalConfig.
 *
 * @param {any} config
 * @returns {any}
 */
export function getActiveMultimodalConfig(config) {
  if (!config) return null;
  if (config.active) {
    return typeof config.active === "function" ? config.active() : config.active;
  }
  if (config.mode) {
    return config.mode === "custom" ? (config.custom || config.builtin) : config.builtin;
  }
  return config;
}

// Config & voice cache state
let cachedConfig = null;
let cacheExpiry = 0;
let cachedVoice = null;
const CACHE_TTL_MS = 5000;

export function getCachedGeminiLiveVoice() {
  return cachedVoice || GEMINI_LIVE_TTS_VOICE;
}

export function setCachedGeminiLiveVoice(voice) {
  cachedVoice = normalizeGeminiLiveVoice(voice);
  return cachedVoice;
}

export async function loadGeminiLiveVoiceSetting() {
  try {
    const saved = await getSetting(GEMINI_LIVE_VOICE_SETTING_KEY);
    cachedVoice = normalizeGeminiLiveVoice(saved);
    return cachedVoice;
  } catch (_) {
    cachedVoice = GEMINI_LIVE_TTS_VOICE;
    return cachedVoice;
  }
}

export async function saveGeminiLiveVoiceSetting(voice) {
  const next = normalizeGeminiLiveVoice(voice);
  cachedVoice = next;
  await saveSetting(GEMINI_LIVE_VOICE_SETTING_KEY, next);
  return next;
}

export function invalidateSpeechTtsConfigCache() {
  cachedConfig = null;
  cacheExpiry = 0;
}

export function setSpeechTtsConfigCache(config, ttlMs = CACHE_TTL_MS) {
  cachedConfig = config;
  cacheExpiry = Date.now() + ttlMs;
}

export async function fetchSpeechMultimodalConfig() {
  const now = Date.now();
  const needVoice = cachedVoice === null;
  if (cachedConfig !== null && now < cacheExpiry) {
    if (needVoice) {
      await loadGeminiLiveVoiceSetting();
    }
    return cachedConfig;
  }
  try {
    const [config] = await Promise.all([
      getMultimodalConfig(),
      needVoice ? loadGeminiLiveVoiceSetting() : Promise.resolve(cachedVoice),
    ]);
    cachedConfig = config;
    cacheExpiry = now + CACHE_TTL_MS;
    return config;
  } catch (e) {
    return null;
  }
}

if (typeof onMultimodalConfigSaved === "function") {
  onMultimodalConfigSaved(() => {
    invalidateSpeechTtsConfigCache();
  });
}

/**
 * Checks whether any speech TTS synthesis engine is currently usable.
 *
 * @returns {boolean}
 */
export function canUseSpeechTts() {
  if (typeof window === "undefined") return false;
  if (typeof isNativeTtsAvailable === "function" && isNativeTtsAvailable()) return true;
  if (isGemini38LiveConfigured(cachedConfig)) return true;
  if ("speechSynthesis" in window && window.speechSynthesis) return true;
  return false;
}

// Test mocks / injection
let _customWebSocketImpl = null;
let _customAudioContextImpl = null;

export function __setWebSocketForTests(wsImpl) {
  _customWebSocketImpl = wsImpl;
}

export function __setAudioContextForTests(audioCtxImpl) {
  _customAudioContextImpl = audioCtxImpl;
}

export function __resetSpeechTtsForTests() {
  _customWebSocketImpl = null;
  _customAudioContextImpl = null;
  cachedVoice = null;
  activeUtterance = null;
  if (activeFirstChunkTimer) {
    clearTimeout(activeFirstChunkTimer);
    activeFirstChunkTimer = null;
  }
  if (ttsAudioContext && ttsAudioContext.close) {
    try {
      ttsAudioContext.close();
    } catch (e) {}
  }
  ttsAudioContext = null;
  stopSpeech();
}

function getWebSocketImpl() {
  if (_customWebSocketImpl) return _customWebSocketImpl;
  return typeof WebSocket !== "undefined" ? WebSocket : globalThis.WebSocket;
}

function getAudioContextImpl() {
  if (_customAudioContextImpl) return _customAudioContextImpl;
  if (typeof window !== "undefined") {
    return window.AudioContext || window.webkitAudioContext || globalThis.AudioContext;
  }
  return globalThis.AudioContext;
}

// Active playback session state
let activeSessionId = 0;
let activeWs = null;
let activeAudioSources = [];
let ttsAudioContext = null;
let nextPlayTime = 0;
let activeUtterance = null;
let activeFirstChunkTimer = null;

function ensureAudioContext() {
  const AudioCtx = getAudioContextImpl();
  if (!AudioCtx) return null;
  if (!ttsAudioContext || ttsAudioContext.state === "closed") {
    try {
      ttsAudioContext = new AudioCtx({ sampleRate: 24000 });
    } catch (e) {
      ttsAudioContext = new AudioCtx();
    }
  }
  if (ttsAudioContext && ttsAudioContext.state === "suspended") {
    ttsAudioContext.resume().catch(() => {});
  }
  return ttsAudioContext;
}

function speakFallback(text, lang, { onStart, onEnd, onError, rate } = {}, sessionId) {
  if (sessionId !== undefined && sessionId !== activeSessionId) return false;

  const native = speakNativeTts(text, getSpeechLang(lang), {
    rate,
    onDone: () => {
      if (sessionId === undefined || sessionId === activeSessionId) {
        onEnd?.();
      }
    },
    onError: (err) => {
      if (sessionId === undefined || sessionId === activeSessionId) {
        onError?.(err);
        onEnd?.();
      }
    },
  });

  if (native.started) {
    if (sessionId === undefined || sessionId === activeSessionId) {
      onStart?.();
    }
    return true;
  }

  if (typeof window === "undefined" || !("speechSynthesis" in window) || !window.speechSynthesis) {
    if (sessionId === undefined || sessionId === activeSessionId) {
      onError?.(new Error("speechSynthesis unavailable"));
      onEnd?.();
    }
    return false;
  }

  const UtteranceClass =
    typeof window !== "undefined" && window.SpeechSynthesisUtterance
      ? window.SpeechSynthesisUtterance
      : typeof SpeechSynthesisUtterance !== "undefined"
      ? SpeechSynthesisUtterance
      : class {
          constructor(t) {
            this.text = t;
            this.lang = "";
            this.voice = null;
            this.rate = 1;
            this.onstart = null;
            this.onend = null;
            this.onerror = null;
          }
        };

  const utterance = new UtteranceClass(text);
  activeUtterance = utterance;
  utterance.lang = getSpeechLang(lang);
  utterance.voice = pickSpeechVoice(utterance.lang);
  utterance.rate = rate ?? 0.95;
  utterance.onstart = () => {
    if (sessionId === undefined || sessionId === activeSessionId) {
      onStart?.();
    }
  };
  utterance.onend = () => {
    if (activeUtterance === utterance) {
      activeUtterance = null;
    }
    if (sessionId === undefined || sessionId === activeSessionId) {
      onEnd?.();
    }
  };
  utterance.onerror = (err) => {
    if (activeUtterance === utterance) {
      activeUtterance = null;
    }
    if (sessionId === undefined || sessionId === activeSessionId) {
      onError?.(err);
      onEnd?.();
    }
  };

  try {
    if (window.speechSynthesis.speaking || window.speechSynthesis.pending) {
      window.speechSynthesis.cancel();
    }
    if (window.speechSynthesis.paused) {
      window.speechSynthesis.resume();
    }
    window.speechSynthesis.speak(utterance);
    return true;
  } catch (e) {
    if (activeUtterance === utterance) {
      activeUtterance = null;
    }
    if (sessionId === undefined || sessionId === activeSessionId) {
      onError?.(e);
      onEnd?.();
    }
    return false;
  }
}

function speakGeminiLiveTts(
  text,
  lang,
  activeConfig,
  { onStart, onEnd, onError, rate, voiceName, disableFallback = false } = {},
  sessionId
) {
  const WebSocketImpl = getWebSocketImpl();
  if (!WebSocketImpl) {
    if (disableFallback) {
      if (sessionId === undefined || sessionId === activeSessionId) {
        onError?.(new Error("WebSocket unavailable"));
        onEnd?.();
      }
      return false;
    }
    return speakFallback(text, lang, { onStart, onEnd, onError, rate }, sessionId);
  }

  const apiKey = (activeConfig.api_key || activeConfig.apiKey || activeConfig.live_api_key || "").trim();
  const baseUrl = (activeConfig.base_url || activeConfig.baseUrl || activeConfig.live_base_url || "").trim();
  const wsUrl = buildGeminiLiveWsUrl(baseUrl, apiKey);
  const targetLangTag = getSpeechLang(lang);
  const systemInstruction = `You are a text-to-speech engine. Read aloud the user's provided text verbatim in ${targetLangTag}. Do not add any introductory or concluding words, commentary, corrections, or modifications. Speak only the exact text provided.`;
  const resolvedVoice = normalizeGeminiLiveVoice(voiceName || cachedVoice || GEMINI_LIVE_TTS_VOICE);

  const setupPayload = buildGeminiLiveSetupPayload({
    model: activeConfig.model || activeConfig.live_model || GEMINI_LIVE_TTS_MODEL,
    voiceName: resolvedVoice,
    systemInstruction,
  });
  if (setupPayload?.setup?.tools) {
    delete setupPayload.setup.tools;
  }

  let ws;
  try {
    ws = new WebSocketImpl(wsUrl);
    try {
      ws.binaryType = "arraybuffer";
    } catch (_) {}
    activeWs = ws;
  } catch (err) {
    if (disableFallback) {
      if (sessionId === undefined || sessionId === activeSessionId) {
        onError?.(err instanceof Error ? err : new Error(String(err)));
        onEnd?.();
      }
      return false;
    }
    return speakFallback(text, lang, { onStart, onEnd, onError, rate }, sessionId);
  }

  let hasStartedPlayback = false;
  let serverTurnComplete = false;
  let finished = false;
  let finishTimer = null;

  const FIRST_CHUNK_TIMEOUT_MS = 8000;
  let firstChunkTimer = setTimeout(() => {
    if (sessionId === activeSessionId && !hasStartedPlayback) {
      handlePreStartError(new Error("Gemini Live TTS response timeout"));
    }
  }, FIRST_CHUNK_TIMEOUT_MS);
  activeFirstChunkTimer = firstChunkTimer;

  const finishSession = () => {
    if (finished) return;
    finished = true;
    if (firstChunkTimer) {
      clearTimeout(firstChunkTimer);
      firstChunkTimer = null;
    }
    if (activeFirstChunkTimer === firstChunkTimer) {
      activeFirstChunkTimer = null;
    }
    if (finishTimer) {
      clearTimeout(finishTimer);
      finishTimer = null;
    }
    if (activeWs === ws) {
      activeWs = null;
    }
    try {
      ws.onopen = null;
      ws.onmessage = null;
      ws.onerror = null;
      ws.onclose = null;
      ws.close();
    } catch (e) {}

    if (sessionId === activeSessionId) {
      onEnd?.();
    }
  };

  const checkCompletion = () => {
    if (sessionId !== activeSessionId) return;
    if (serverTurnComplete && activeAudioSources.length === 0) {
      finishSession();
    }
  };

  const handlePreStartError = (err) => {
    if (sessionId !== activeSessionId) return;
    if (firstChunkTimer) {
      clearTimeout(firstChunkTimer);
      firstChunkTimer = null;
    }
    if (activeFirstChunkTimer === firstChunkTimer) {
      activeFirstChunkTimer = null;
    }
    if (!hasStartedPlayback) {
      if (activeWs === ws) {
        activeWs = null;
      }
      try {
        ws.onopen = null;
        ws.onmessage = null;
        ws.onerror = null;
        ws.onclose = null;
        ws.close();
      } catch (e) {}
      if (disableFallback) {
        onError?.(err instanceof Error ? err : new Error(String(err || "Gemini Live TTS error")));
        finishSession();
      } else {
        speakFallback(text, lang, { onStart, onEnd, onError, rate }, sessionId);
      }
    } else {
      onError?.(err || new Error("Playback error"));
      finishSession();
    }
  };

  const playChunk = (base64Pcm) => {
    if (sessionId !== activeSessionId) return;
    if (firstChunkTimer) {
      clearTimeout(firstChunkTimer);
      firstChunkTimer = null;
    }
    if (activeFirstChunkTimer === firstChunkTimer) {
      activeFirstChunkTimer = null;
    }

    const ctx = ensureAudioContext();
    if (!ctx || !ctx.createBuffer) return;

    const float32Data = pcm16Base64ToFloat32(base64Pcm);
    if (!float32Data || float32Data.length === 0) return;

    const audioBuffer = ctx.createBuffer(1, float32Data.length, 24000);
    if (audioBuffer.copyToChannel) {
      audioBuffer.copyToChannel(float32Data, 0);
    } else if (audioBuffer.getChannelData) {
      audioBuffer.getChannelData(0).set(float32Data);
    }

    const source = ctx.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(ctx.destination);

    const currentTime = ctx.currentTime;
    if (nextPlayTime < currentTime) {
      nextPlayTime = currentTime;
    }
    source.start(nextPlayTime);
    nextPlayTime += audioBuffer.duration;

    if (!hasStartedPlayback) {
      hasStartedPlayback = true;
      if (sessionId === activeSessionId) {
        onStart?.();
      }
    }

    activeAudioSources.push(source);

    let sourceCleaned = false;
    let safetyTimer = null;
    const cleanupSource = () => {
      if (sourceCleaned) return;
      sourceCleaned = true;
      if (safetyTimer) {
        clearTimeout(safetyTimer);
        safetyTimer = null;
      }
      const idx = activeAudioSources.indexOf(source);
      if (idx !== -1) {
        activeAudioSources.splice(idx, 1);
      }
      checkCompletion();
    };

    source.onended = cleanupSource;
    const maxWaitMs = Math.max(0, (nextPlayTime - currentTime) * 1000) + 400;
    safetyTimer = setTimeout(cleanupSource, maxWaitMs);
    source._safetyTimer = safetyTimer;
  };

  const handleServerMessage = (msg) => {
    if (sessionId !== activeSessionId) return;
    if (!msg) return;

    if (msg.error) {
      handlePreStartError(new Error(msg.error.message || "Gemini Live error"));
      return;
    }

    if (msg.setupComplete) {
      const clientContent = {
        clientContent: {
          turns: [
            {
              role: "user",
              parts: [{ text }],
            },
          ],
          turnComplete: true,
        },
      };
      try {
        ws.send(JSON.stringify(clientContent));
      } catch (e) {
        handlePreStartError(e);
      }
      return;
    }

    if (msg.serverContent) {
      const sc = msg.serverContent;
      if (sc.interrupted) {
        finishSession();
        return;
      }
      if (Array.isArray(sc.modelTurn?.parts)) {
        for (const part of sc.modelTurn.parts) {
          if (
            part.inlineData?.data &&
            (!part.inlineData.mimeType || part.inlineData.mimeType.startsWith("audio/pcm"))
          ) {
            playChunk(part.inlineData.data);
          }
        }
      }
      if (sc.turnComplete) {
        serverTurnComplete = true;
        checkCompletion();
      }
    }
  };

  ws.onopen = () => {
    if (sessionId !== activeSessionId) {
      try {
        ws.close();
      } catch (e) {}
      return;
    }
    try {
      ws.send(JSON.stringify(setupPayload));
    } catch (e) {
      handlePreStartError(e);
    }
  };

  ws.onmessage = (event) => {
    if (sessionId !== activeSessionId) return;
    const data = event?.data;
    if (data == null) return;

    if (typeof data === "string") {
      try {
        handleServerMessage(JSON.parse(data));
      } catch (_) {}
      return;
    }

    if (data instanceof ArrayBuffer || ArrayBuffer.isView(data)) {
      try {
        const textDecoded = new TextDecoder().decode(data);
        handleServerMessage(JSON.parse(textDecoded));
      } catch (_) {}
      return;
    }

    if (typeof data.text === "function") {
      data.text()
        .then((txt) => {
          if (sessionId !== activeSessionId) return;
          try {
            handleServerMessage(JSON.parse(txt));
          } catch (_) {}
        })
        .catch(() => {});
      return;
    }

    if (typeof Blob !== "undefined" && data instanceof Blob) {
      if (typeof data.text === "function") {
        data.text()
          .then((txt) => {
            if (sessionId !== activeSessionId) return;
            try {
              handleServerMessage(JSON.parse(txt));
            } catch (_) {}
          })
          .catch(() => {});
      } else {
        const reader = new FileReader();
        reader.onload = () => {
          if (sessionId !== activeSessionId) return;
          try {
            handleServerMessage(JSON.parse(reader.result));
          } catch (_) {}
        };
        reader.readAsText(data);
      }
      return;
    }

    if (typeof data.arrayBuffer === "function") {
      data.arrayBuffer()
        .then((buf) => {
          if (sessionId !== activeSessionId) return;
          try {
            const textDecoded = new TextDecoder().decode(buf);
            handleServerMessage(JSON.parse(textDecoded));
          } catch (_) {}
        })
        .catch(() => {});
      return;
    }

    try {
      handleServerMessage(JSON.parse(String(data)));
    } catch (_) {}
  };

  ws.onerror = (e) => {
    handlePreStartError(e instanceof Error ? e : new Error("WebSocket error"));
  };

  ws.onclose = () => {
    if (sessionId !== activeSessionId) return;
    if (!hasStartedPlayback) {
      handlePreStartError(new Error("WebSocket closed before playback started"));
    } else {
      serverTurnComplete = true;
      checkCompletion();
    }
  };

  return true;
}

const VOICE_PREVIEW_SAMPLES = {
  es: "¡Hola! Soy {voice}, tu voz de lectura en Gemini Live.",
  en: "Hello! I am {voice}, your Gemini Live reading voice.",
  zh: "你好！我是 {voice}，你的 Gemini Live 默认朗读音色。",
};

export function getVoicePreviewSampleText(voiceName, lang = "es") {
  const resolvedVoice = normalizeGeminiLiveVoice(voiceName);
  const family = (lang || "es").toLowerCase().split("-")[0];
  const tpl = VOICE_PREVIEW_SAMPLES[family] || VOICE_PREVIEW_SAMPLES.es;
  return tpl.replace("{voice}", resolvedVoice);
}

export function previewGeminiLiveVoice({
  text,
  lang = "es",
  config,
  voiceName,
  onStart,
  onEnd,
  onError,
} = {}) {
  if (typeof window === "undefined") {
    onError?.(new Error("window is undefined"));
    onEnd?.();
    return false;
  }

  const active = getActiveMultimodalConfig(config) || config || {};
  const apiKey = (active.api_key || active.apiKey || active.live_api_key || "").trim();
  const baseUrl = (active.base_url || active.baseUrl || active.live_base_url || "").trim();

  if (
    !apiKey ||
    (apiKey.startsWith("nvapi-") &&
      (!baseUrl || baseUrl.includes("generativelanguage.googleapis.com")))
  ) {
    onError?.(new Error("Missing Gemini API Key"));
    onEnd?.();
    return false;
  }

  try {
    ensureAudioContext();
  } catch (_) {}

  stopSpeech();
  const sessionId = activeSessionId;
  const resolvedVoice = normalizeGeminiLiveVoice(voiceName);
  const sampleText = (text || "").trim() || getVoicePreviewSampleText(resolvedVoice, lang);

  return speakGeminiLiveTts(
    sampleText,
    lang,
    active,
    {
      onStart,
      onEnd,
      onError,
      voiceName: resolvedVoice,
      disableFallback: true,
    },
    sessionId
  );
}

export function speakText(text, lang, { onStart, onEnd, onError, rate } = {}) {
  if (!text || typeof window === "undefined") {
    onError?.(new Error("No text or window is undefined"));
    onEnd?.();
    return false;
  }

  // Pre-warm / unlock AudioContext synchronously in user-gesture callstack
  try {
    ensureAudioContext();
  } catch (_) {}

  // Stop any active speech & increment activeSessionId
  stopSpeech();
  const sessionId = activeSessionId;

  // If cached config is known to be Gemini 3.8 Live:
  if (isGemini38LiveConfigured(cachedConfig)) {
    const active = getActiveMultimodalConfig(cachedConfig);
    speakGeminiLiveTts(text, lang, active, { onStart, onEnd, onError, rate }, sessionId);
    return true;
  }

  // If cached config is known and NOT Gemini Live:
  if (cachedConfig !== null) {
    return speakFallback(text, lang, { onStart, onEnd, onError, rate }, sessionId);
  }

  // If cachedConfig is not yet loaded, asynchronously resolve it
  fetchSpeechMultimodalConfig()
    .then((cfg) => {
      if (sessionId !== activeSessionId) return;
      if (isGemini38LiveConfigured(cfg)) {
        const active = getActiveMultimodalConfig(cfg);
        speakGeminiLiveTts(text, lang, active, { onStart, onEnd, onError, rate }, sessionId);
      } else {
        speakFallback(text, lang, { onStart, onEnd, onError, rate }, sessionId);
      }
    })
    .catch((err) => {
      if (sessionId !== activeSessionId) return;
      speakFallback(text, lang, { onStart, onEnd, onError, rate }, sessionId);
    });

  return true;
}

export function stopSpeech() {
  activeSessionId++;

  if (activeFirstChunkTimer) {
    clearTimeout(activeFirstChunkTimer);
    activeFirstChunkTimer = null;
  }

  if (activeWs) {
    try {
      activeWs.onopen = null;
      activeWs.onmessage = null;
      activeWs.onerror = null;
      activeWs.onclose = null;
      activeWs.close();
    } catch (e) {}
    activeWs = null;
  }

  for (const src of activeAudioSources) {
    if (src._safetyTimer) {
      clearTimeout(src._safetyTimer);
      src._safetyTimer = null;
    }
    src.onended = null;
    try {
      src.stop();
      src.disconnect();
    } catch (e) {}
  }
  activeAudioSources = [];
  nextPlayTime = 0;

  activeUtterance = null;
  stopNativeTts();
  if (typeof window !== "undefined" && window.speechSynthesis) {
    window.speechSynthesis.cancel();
  }
}
