import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  GEMINI_LIVE_TTS_MODEL,
  GEMINI_LIVE_TTS_VOICE,
  GEMINI_LIVE_VOICES,
  GEMINI_LIVE_VOICE_OPTIONS,
  GEMINI_LIVE_VOICE_SETTING_KEY,
  canUseSpeechTts,
  fetchSpeechMultimodalConfig,
  getCachedGeminiLiveVoice,
  getSpeechLang,
  invalidateSpeechTtsConfigCache,
  isGemini38LiveConfigured,
  loadGeminiLiveVoiceSetting,
  normalizeGeminiLiveVoice,
  previewGeminiLiveVoice,
  saveGeminiLiveVoiceSetting,
  speakText,
  stopSpeech,
  __resetSpeechTtsForTests,
  __setAudioContextForTests,
  __setWebSocketForTests,
} from "@/shared/speechTts.js";
import {
  __resetTtsBridgeForTests,
  getNativeTtsStatus,
  onNativeTtsProgress,
  setNativeTtsEngine,
  speakNativeTts,
} from "@/shared/ttsBridge.js";
import * as api from "@/shared/api.js";
import { float32ToPcm16Base64 } from "@/modules/speaking/useGeminiLiveSession.js";

class MockWebSocket {
  static instances = [];
  static OPEN = 1;
  static CLOSED = 3;

  constructor(url) {
    this.url = url;
    this.readyState = 0; // CONNECTING
    this.sent = [];
    MockWebSocket.instances.push(this);
    setTimeout(() => {
      if (this.readyState === 0) {
        this.readyState = MockWebSocket.OPEN;
        if (this.onopen) this.onopen();
      }
    }, 5);
  }

  send(data) {
    this.sent.push(typeof data === "string" ? JSON.parse(data) : data);
  }

  close() {
    this.readyState = MockWebSocket.CLOSED;
    if (this.onclose) this.onclose();
  }

  receive(data) {
    if (this.onmessage) {
      if (typeof data === "string") {
        return this.onmessage({ data });
      }
      if (typeof Blob !== "undefined" && data instanceof Blob) {
        return this.onmessage({ data });
      }
      if (data instanceof ArrayBuffer || ArrayBuffer.isView(data)) {
        return this.onmessage({ data });
      }
      return this.onmessage({ data: JSON.stringify(data) });
    }
  }

  receiveBlob(data) {
    if (this.onmessage) {
      const jsonStr = JSON.stringify(data);
      const blob = new Blob([jsonStr], { type: "application/json" });
      return this.onmessage({ data: blob });
    }
  }

  triggerError(err) {
    if (this.onerror) {
      this.onerror(err || new Error("WS error"));
    }
  }
}

class MockAudioContext {
  static instances = [];
  constructor(options = {}) {
    this.sampleRate = options.sampleRate || 24000;
    this.currentTime = 0;
    this.state = "running";
    this.destination = {};
    this.sources = [];
    MockAudioContext.instances.push(this);
  }

  createBuffer(channels, length, sampleRate) {
    const channelData = new Float32Array(length);
    return {
      numberOfChannels: channels,
      length,
      sampleRate,
      duration: length / sampleRate,
      getChannelData: () => channelData,
      copyToChannel: (src) => channelData.set(src),
    };
  }

  createBufferSource() {
    const src = {
      buffer: null,
      connect: vi.fn(),
      disconnect: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(() => {
        if (src.onended) src.onended();
      }),
      onended: null,
    };
    this.sources.push(src);
    return src;
  }

  resume() {
    return Promise.resolve();
  }

  close() {
    this.state = "closed";
    return Promise.resolve();
  }
}

describe("speechTts", () => {
  let initialSpeechSynthesis;

  beforeAll(async () => {
    initialSpeechSynthesis = window.speechSynthesis;
    await fetchSpeechMultimodalConfig();
  });

  beforeEach(() => {
    if (!window.speechSynthesis && initialSpeechSynthesis) {
      window.speechSynthesis = initialSpeechSynthesis;
    }
  });

  afterEach(() => {
    delete window.__amigaTts;
    delete window.__amigaTtsDone;
    delete window.__amigaTtsError;
    delete window.__amigaTtsProgress;
    __resetTtsBridgeForTests();
    __resetSpeechTtsForTests();
    vi.restoreAllMocks();
    if (!window.speechSynthesis && initialSpeechSynthesis) {
      window.speechSynthesis = initialSpeechSynthesis;
    }
    if (window.speechSynthesis?.cancel) {
      window.speechSynthesis.cancel();
    }
  });

  it("maps short language codes to BCP-47 tags", () => {
    expect(getSpeechLang("es")).toBe("es-ES");
    expect(getSpeechLang("en")).toBe("en-US");
  });

  it("uses __amigaTtsDone for native TTS completion", () => {
    const onEnd = vi.fn();
    window.__amigaTts = { speak: vi.fn(() => "started") };

    speakText("Hola", "es", { onEnd });

    expect(typeof window.__amigaTtsDone).toBe("function");
    window.__amigaTtsDone();
    expect(onEnd).toHaveBeenCalledTimes(1);
  });

  it("chains native TTS done callbacks", () => {
    const prevDone = vi.fn();
    const onEnd = vi.fn();
    window.__amigaTtsDone = prevDone;
    window.__amigaTts = { speak: vi.fn(() => "queued") };

    speakText("Hola", "es", { onEnd });
    window.__amigaTtsDone();

    expect(onEnd).toHaveBeenCalledTimes(1);
    expect(prevDone).toHaveBeenCalledTimes(1);
    expect(window.__amigaTtsDone).toBe(prevDone);
  });

  it("calls onEnd when native TTS is unavailable", () => {
    const onEnd = vi.fn();
    delete window.speechSynthesis;

    const ok = speakText("Hola", "es", { onEnd });

    expect(ok).toBe(false);
    expect(onEnd).toHaveBeenCalledTimes(1);
  });

  it("stopSpeech delegates to native bridge when present", () => {
    window.__amigaTts = { stop: vi.fn() };
    stopSpeech();
    expect(window.__amigaTts.stop).toHaveBeenCalledTimes(1);
  });

  it("treats downloading as a successful native start", () => {
    window.__amigaTts = { speak: vi.fn(() => "downloading") };
    const result = speakNativeTts("Hola", "es-ES");
    expect(result.started).toBe(true);
    expect(result.result).toBe("downloading");
  });

  it("forwards native progress JSON to listeners", () => {
    const listener = vi.fn();
    window.__amigaTts = { speak: vi.fn(() => "ok") };
    const off = onNativeTtsProgress(listener);
    window.__amigaTtsProgress('{"state":"downloading","bytes":10,"totalBytes":100}');
    expect(listener).toHaveBeenCalledWith({ state: "downloading", bytes: 10, totalBytes: 100 });
    off();
  });

  it("parses setEngine / getStatus JSON from the native bridge", () => {
    window.__amigaTts = {
      speak: () => "ok",
      setEngine: vi.fn(() => '{"engine":"kokoro","ready":false,"downloading":true,"supported":true}'),
      getStatus: vi.fn(() => '{"engine":"kokoro","ready":true,"downloading":false,"supported":true}'),
    };
    expect(setNativeTtsEngine("kokoro")).toMatchObject({
      engine: "kokoro",
      downloading: true,
      supported: true,
    });
    expect(getNativeTtsStatus()).toMatchObject({ engine: "kokoro", ready: true });
  });

  describe("Gemini 3.8 Live TTS integration", () => {
    it("exports correct constant voice and model names", () => {
      expect(GEMINI_LIVE_TTS_VOICE).toBe("Fola");
      expect(GEMINI_LIVE_TTS_MODEL).toBe("gemini-3.8-live");
    });

    it("detects Gemini 3.8 Live config accurately", () => {
      expect(isGemini38LiveConfigured(null)).toBe(false);
      expect(isGemini38LiveConfigured({})).toBe(false);
      expect(isGemini38LiveConfigured({ api_key: "key", model: "gemini-3.8-live" })).toBe(true);
      expect(isGemini38LiveConfigured({ api_key: "key", model: "models/gemini-3.8-live" })).toBe(true);
      expect(isGemini38LiveConfigured({ api_key: "key", model: "GEMINI-3.8-LIVE" })).toBe(true);
      expect(isGemini38LiveConfigured({ api_key: "", model: "gemini-3.8-live" })).toBe(false);
      expect(isGemini38LiveConfigured({ api_key: "key", model: "gemini-2.5-flash" })).toBe(false);
      expect(
        isGemini38LiveConfigured({
          mode: "builtin",
          builtin: { api_key: "key-123", model: "gemini-3.8-live" },
        })
      ).toBe(true);
      expect(
        isGemini38LiveConfigured({
          mode: "custom",
          custom: { api_key: "sk-test", model: "gemini-3.8-live" },
        })
      ).toBe(true);
      expect(
        isGemini38LiveConfigured({
          active: { api_key: "key", model: "gemini-3.8-live" },
        })
      ).toBe(true);
      expect(
        isGemini38LiveConfigured({
          api_key: "nvapi-12345",
          model: "gemini-3.8-live",
          base_url: "https://generativelanguage.googleapis.com",
        })
      ).toBe(false);
      expect(
        isGemini38LiveConfigured({
          api_key: "nvapi-12345",
          model: "gemini-3.8-live",
          base_url: "",
        })
      ).toBe(false);
      expect(
        isGemini38LiveConfigured({
          mode: "builtin",
          builtin: {
            api_key: "nvapi-placeholder",
            model: "gemini-3.8-live",
            base_url: "https://generativelanguage.googleapis.com",
          },
        })
      ).toBe(false);
      expect(
        isGemini38LiveConfigured({
          api_key: "nvapi-custom",
          model: "gemini-3.8-live",
          base_url: "https://custom-proxy.internal",
        })
      ).toBe(true);
    });

    it("canUseSpeechTts reflects TTS availability", () => {
      window.speechSynthesis = { speak: vi.fn(), cancel: vi.fn() };
      expect(canUseSpeechTts()).toBe(true);
    });

    it("connects to Gemini Live WS with Fola voice, sends text, plays PCM audio, and triggers callbacks", async () => {
      MockWebSocket.instances = [];
      MockAudioContext.instances = [];
      __setWebSocketForTests(MockWebSocket);
      __setAudioContextForTests(MockAudioContext);

      const onStart = vi.fn();
      const onEnd = vi.fn();

      vi.spyOn(api, "getMultimodalConfig").mockResolvedValue({
        mode: "builtin",
        builtin: {
          base_url: "https://generativelanguage.googleapis.com",
          api_key: "ai-test-key-live",
          model: "gemini-3.8-live",
        },
      });
      invalidateSpeechTtsConfigCache();

      const ok = speakText("Buenos días, ¿cómo estás?", "es", { onStart, onEnd });
      expect(ok).toBe(true);

      // Wait for MockWebSocket instance creation
      await vi.waitFor(() => expect(MockWebSocket.instances.length).toBe(1));
      const ws = MockWebSocket.instances[0];

      // Verify WebSocket URL contains generative service and API key
      expect(ws.url).toContain("wss://generativelanguage.googleapis.com/ws/");
      expect(ws.url).toContain("key=ai-test-key-live");

      // Verify setup payload sent on open
      await vi.waitFor(() => expect(ws.sent.length).toBeGreaterThanOrEqual(1));
      const setupMsg = ws.sent[0];
      expect(setupMsg.setup.model).toBe("models/gemini-3.8-live");
      expect(
        setupMsg.setup.generationConfig.speechConfig.voiceConfig.prebuiltVoiceConfig.voiceName
      ).toBe("Fola");
      expect(setupMsg.setup.systemInstruction.parts[0].text).toContain("es-ES");
      expect(setupMsg.setup.tools).toBeUndefined();

      // 1. Server responds with setupComplete
      ws.receive({ setupComplete: {} });

      // 2. Client sends clientContent turn with the text to read aloud
      await vi.waitFor(() => expect(ws.sent.length).toBeGreaterThanOrEqual(2));
      const textMsg = ws.sent[1];
      expect(textMsg.clientContent.turns[0].parts[0].text).toBe("Buenos días, ¿cómo estás?");
      expect(textMsg.clientContent.turnComplete).toBe(true);

      // 3. Server streams PCM audio chunk (24kHz)
      const pcmBase64 = float32ToPcm16Base64(new Float32Array([0.2, -0.2, 0.4, -0.4]), 24000, 24000);
      ws.receive({
        serverContent: {
          modelTurn: {
            parts: [
              {
                inlineData: {
                  mimeType: "audio/pcm;rate=24000",
                  data: pcmBase64,
                },
              },
            ],
          },
        },
      });

      // Verify onStart fired when audio started
      expect(onStart).toHaveBeenCalledTimes(1);

      // 4. Server signals turnComplete
      ws.receive({
        serverContent: {
          turnComplete: true,
        },
      });

      // Buffer source finishes playback
      const audioCtx = MockAudioContext.instances[0];
      expect(audioCtx).toBeDefined();
      expect(audioCtx.sources.length).toBe(1);
      audioCtx.sources[0].onended();

      // Verify onEnd fired and WebSocket closed
      await vi.waitFor(() => expect(onEnd).toHaveBeenCalledTimes(1));
      expect(ws.readyState).toBe(MockWebSocket.CLOSED);
    });

    it("stopSpeech closes active Gemini Live WS and stops audio playback without firing stale onEnd", async () => {
      MockWebSocket.instances = [];
      MockAudioContext.instances = [];
      __setWebSocketForTests(MockWebSocket);
      __setAudioContextForTests(MockAudioContext);

      const onStart = vi.fn();
      const onEnd = vi.fn();

      vi.spyOn(api, "getMultimodalConfig").mockResolvedValue({
        mode: "builtin",
        builtin: {
          base_url: "https://generativelanguage.googleapis.com",
          api_key: "ai-test-key-live",
          model: "gemini-3.8-live",
        },
      });
      invalidateSpeechTtsConfigCache();

      speakText("Hola mundo", "es", { onStart, onEnd });
      await vi.waitFor(() => expect(MockWebSocket.instances.length).toBe(1));
      const ws = MockWebSocket.instances[0];

      // Start audio playback
      const pcmBase64 = float32ToPcm16Base64(new Float32Array([0.1, -0.1]), 24000, 24000);
      ws.receive({
        serverContent: {
          modelTurn: {
            parts: [{ inlineData: { mimeType: "audio/pcm", data: pcmBase64 } }],
          },
        },
      });

      const audioCtx = MockAudioContext.instances[0];
      const source = audioCtx.sources[0];
      expect(source.start).toHaveBeenCalled();

      // Stop speech
      stopSpeech();

      expect(ws.readyState).toBe(MockWebSocket.CLOSED);
      expect(source.stop).toHaveBeenCalled();
      expect(source.disconnect).toHaveBeenCalled();
      expect(onEnd).not.toHaveBeenCalled();
    });

    it("falls back to Native TTS / speechSynthesis if Gemini Live WS errors before playback", async () => {
      MockWebSocket.instances = [];
      __setWebSocketForTests(MockWebSocket);

      const onStart = vi.fn();
      const onEnd = vi.fn();

      vi.spyOn(api, "getMultimodalConfig").mockResolvedValue({
        mode: "builtin",
        builtin: {
          base_url: "https://generativelanguage.googleapis.com",
          api_key: "ai-test-key-live",
          model: "gemini-3.8-live",
        },
      });
      invalidateSpeechTtsConfigCache();

      window.speechSynthesis = {
        speak: vi.fn((utterance) => {
          utterance.onstart?.();
          utterance.onend?.();
        }),
        cancel: vi.fn(),
        getVoices: vi.fn(() => []),
      };

      speakText("Fallback text", "es", { onStart, onEnd });
      await vi.waitFor(() => expect(MockWebSocket.instances.length).toBe(1));
      const ws = MockWebSocket.instances[0];

      // WS encounters network error before audio playback
      ws.triggerError(new Error("Connection refused"));

      await vi.waitFor(() => {
        expect(window.speechSynthesis.speak).toHaveBeenCalledTimes(1);
      });
      expect(onStart).toHaveBeenCalledTimes(1);
      expect(onEnd).toHaveBeenCalledTimes(1);
    });

    it("falls back immediately when getMultimodalConfig rejects or is not gemini-3.8-live", async () => {
      vi.spyOn(api, "getMultimodalConfig").mockResolvedValue({
        mode: "custom",
        custom: {
          base_url: "https://api.openai.com/v1",
          api_key: "sk-openai-key",
          model: "gpt-4o-mini",
        },
      });
      invalidateSpeechTtsConfigCache();

      const onStart = vi.fn();
      const onEnd = vi.fn();

      window.speechSynthesis = {
        speak: vi.fn((utterance) => {
          utterance.onstart?.();
          utterance.onend?.();
        }),
        cancel: vi.fn(),
        getVoices: vi.fn(() => []),
      };

      speakText("Fallback directly", "es", { onStart, onEnd });

      await vi.waitFor(() => {
        expect(window.speechSynthesis.speak).toHaveBeenCalledTimes(1);
      });
      expect(onStart).toHaveBeenCalledTimes(1);
      expect(onEnd).toHaveBeenCalledTimes(1);
    });

    it("parses WebSocket binary Blob frames for setupComplete and serverContent audio with Fola voice", async () => {
      MockWebSocket.instances = [];
      MockAudioContext.instances = [];
      __setWebSocketForTests(MockWebSocket);
      __setAudioContextForTests(MockAudioContext);

      const onStart = vi.fn();
      const onEnd = vi.fn();

      vi.spyOn(api, "getMultimodalConfig").mockResolvedValue({
        mode: "builtin",
        builtin: {
          base_url: "https://generativelanguage.googleapis.com",
          api_key: "ai-test-key-live",
          model: "gemini-3.8-live",
        },
      });
      invalidateSpeechTtsConfigCache();

      const ok = speakText("Reading news article with Blob frames", "es", { onStart, onEnd });
      expect(ok).toBe(true);

      await vi.waitFor(() => expect(MockWebSocket.instances.length).toBe(1));
      const ws = MockWebSocket.instances[0];

      // Wait for setup payload sent on open
      await vi.waitFor(() => expect(ws.sent.length).toBeGreaterThanOrEqual(1));
      const setupMsg = ws.sent[0];
      expect(setupMsg.setup.model).toBe("models/gemini-3.8-live");
      expect(
        setupMsg.setup.generationConfig.speechConfig.voiceConfig.prebuiltVoiceConfig.voiceName
      ).toBe("Fola");

      // Send setupComplete as a binary Blob
      ws.receiveBlob({ setupComplete: {} });

      // Client sends text turn
      await vi.waitFor(() => expect(ws.sent.length).toBeGreaterThanOrEqual(2));
      const textMsg = ws.sent[1];
      expect(textMsg.clientContent.turns[0].parts[0].text).toBe("Reading news article with Blob frames");

      // Server sends PCM audio chunk as binary Blob
      const pcmBase64 = float32ToPcm16Base64(new Float32Array([0.3, -0.3, 0.5, -0.5]), 24000, 24000);
      ws.receiveBlob({
        serverContent: {
          modelTurn: {
            parts: [
              {
                inlineData: {
                  mimeType: "audio/pcm;rate=24000",
                  data: pcmBase64,
                },
              },
            ],
          },
        },
      });

      // Verify onStart fired
      await vi.waitFor(() => expect(onStart).toHaveBeenCalledTimes(1));

      // Server sends turnComplete as binary Blob
      ws.receiveBlob({
        serverContent: {
          turnComplete: true,
        },
      });

      const audioCtx = MockAudioContext.instances[0];
      expect(audioCtx).toBeDefined();
      expect(audioCtx.sources.length).toBe(1);
      audioCtx.sources[0].onended();

      await vi.waitFor(() => expect(onEnd).toHaveBeenCalledTimes(1));
      expect(ws.readyState).toBe(MockWebSocket.CLOSED);
    });

    it("falls back to speakFallback if WebSocket closes before startedPlayback", async () => {
      MockWebSocket.instances = [];
      __setWebSocketForTests(MockWebSocket);

      const onStart = vi.fn();
      const onEnd = vi.fn();

      vi.spyOn(api, "getMultimodalConfig").mockResolvedValue({
        mode: "builtin",
        builtin: {
          base_url: "https://generativelanguage.googleapis.com",
          api_key: "ai-test-key-live",
          model: "gemini-3.8-live",
        },
      });
      invalidateSpeechTtsConfigCache();

      window.speechSynthesis = {
        speak: vi.fn((utterance) => {
          utterance.onstart?.();
          utterance.onend?.();
        }),
        cancel: vi.fn(),
        getVoices: vi.fn(() => []),
      };

      speakText("Fallback on pre-start close", "es", { onStart, onEnd });
      await vi.waitFor(() => expect(MockWebSocket.instances.length).toBe(1));
      const ws = MockWebSocket.instances[0];

      // WebSocket closes before any audio chunk is received (e.g. handshake rejected or server closed)
      ws.close();

      await vi.waitFor(() => {
        expect(window.speechSynthesis.speak).toHaveBeenCalledTimes(1);
      });
      expect(onStart).toHaveBeenCalledTimes(1);
      expect(onEnd).toHaveBeenCalledTimes(1);
    });

    it("includes Fola hidden voice and normalizes voice names", () => {
      expect(GEMINI_LIVE_VOICES).toContain("Fola");
      expect(GEMINI_LIVE_VOICES).toContain("Aoede");
      expect(GEMINI_LIVE_VOICE_OPTIONS.find((v) => v.id === "Fola")?.hidden).toBe(true);
      expect(normalizeGeminiLiveVoice("aoede")).toBe("Aoede");
      expect(normalizeGeminiLiveVoice("Fola")).toBe("Fola");
      expect(normalizeGeminiLiveVoice("UnknownVoice")).toBe("Fola");
      expect(normalizeGeminiLiveVoice("")).toBe("Fola");
    });

    it("loads and saves configured global reading voice and uses it in speakText", async () => {
      MockWebSocket.instances = [];
      MockAudioContext.instances = [];
      __setWebSocketForTests(MockWebSocket);
      __setAudioContextForTests(MockAudioContext);

      vi.spyOn(api, "getSetting").mockImplementation(async (key) => {
        if (key === GEMINI_LIVE_VOICE_SETTING_KEY) return "Aoede";
        return null;
      });
      const saveSpy = vi.spyOn(api, "saveSetting").mockResolvedValue(null);
      vi.spyOn(api, "getMultimodalConfig").mockResolvedValue({
        mode: "builtin",
        builtin: {
          base_url: "https://generativelanguage.googleapis.com",
          api_key: "ai-test-key-live",
          model: "gemini-3.8-live",
        },
      });
      invalidateSpeechTtsConfigCache();

      const loaded = await loadGeminiLiveVoiceSetting();
      expect(loaded).toBe("Aoede");
      expect(getCachedGeminiLiveVoice()).toBe("Aoede");

      speakText("Probando voz Aoede", "es");
      await vi.waitFor(() => expect(MockWebSocket.instances.length).toBe(1));
      const ws = MockWebSocket.instances[0];
      await vi.waitFor(() => expect(ws.sent.length).toBeGreaterThanOrEqual(1));
      expect(
        ws.sent[0].setup.generationConfig.speechConfig.voiceConfig.prebuiltVoiceConfig.voiceName
      ).toBe("Aoede");

      await saveGeminiLiveVoiceSetting("Kore");
      expect(saveSpy).toHaveBeenCalledWith(GEMINI_LIVE_VOICE_SETTING_KEY, "Kore");
      expect(getCachedGeminiLiveVoice()).toBe("Kore");
    });

    it("previewGeminiLiveVoice tests selected voice directly and reports errors without fallback", async () => {
      MockWebSocket.instances = [];
      MockAudioContext.instances = [];
      __setWebSocketForTests(MockWebSocket);
      __setAudioContextForTests(MockAudioContext);

      const onStart = vi.fn();
      const onEnd = vi.fn();
      const onError = vi.fn();

      const ok = previewGeminiLiveVoice({
        voiceName: "Puck",
        lang: "es",
        config: {
          base_url: "https://generativelanguage.googleapis.com",
          api_key: "ai-test-key-live",
          model: "gemini-3.8-live",
        },
        onStart,
        onEnd,
        onError,
      });
      expect(ok).toBe(true);

      await vi.waitFor(() => expect(MockWebSocket.instances.length).toBe(1));
      const ws = MockWebSocket.instances[0];
      await vi.waitFor(() => expect(ws.sent.length).toBeGreaterThanOrEqual(1));
      expect(
        ws.sent[0].setup.generationConfig.speechConfig.voiceConfig.prebuiltVoiceConfig.voiceName
      ).toBe("Puck");

      ws.receive({ setupComplete: {} });
      await vi.waitFor(() => expect(ws.sent.length).toBeGreaterThanOrEqual(2));
      expect(ws.sent[1].clientContent.turns[0].parts[0].text).toContain("Puck");

      // Missing API key reports error immediately
      const onErrMissing = vi.fn();
      const onEndMissing = vi.fn();
      const okMissing = previewGeminiLiveVoice({
        voiceName: "Fola",
        config: { api_key: "", model: "gemini-3.8-live" },
        onError: onErrMissing,
        onEnd: onEndMissing,
      });
      expect(okMissing).toBe(false);
      expect(onErrMissing).toHaveBeenCalledTimes(1);
      expect(onEndMissing).toHaveBeenCalledTimes(1);
    });
  });
});
