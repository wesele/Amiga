import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ref } from "vue";
import { useReadAloud } from "@/shared/readAloud.js";
import * as speechTtsModule from "@/shared/speechTts.js";
import * as api from "@/shared/api.js";
import { float32ToPcm16Base64 } from "@/modules/speaking/useGeminiLiveSession.js";

class MockWebSocket {
  static instances = [];
  static OPEN = 1;
  static CLOSED = 3;

  constructor(url) {
    this.url = url;
    this.readyState = 0;
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
      return this.onmessage({ data: JSON.stringify(data) });
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

describe("useReadAloud", () => {
  let initialSpeechSynthesis;

  beforeEach(() => {
    initialSpeechSynthesis = window.speechSynthesis;
    MockWebSocket.instances = [];
    MockAudioContext.instances = [];
    speechTtsModule.__setWebSocketForTests(MockWebSocket);
    speechTtsModule.__setAudioContextForTests(MockAudioContext);
  });

  afterEach(() => {
    speechTtsModule.__resetSpeechTtsForTests();
    vi.restoreAllMocks();
    if (!window.speechSynthesis && initialSpeechSynthesis) {
      window.speechSynthesis = initialSpeechSynthesis;
    }
  });

  it("evaluates canRead based on text and speech TTS availability", () => {
    window.speechSynthesis = { speak: vi.fn(), cancel: vi.fn() };
    const textRef = ref("");
    const { canRead } = useReadAloud({
      getText: () => textRef.value,
      getTargetLang: () => "es",
      t: (key) => key,
    });

    expect(canRead.value).toBe(false);
    textRef.value = "Hello world";
    expect(canRead.value).toBe(true);
  });

  it("routes through Gemini 3.8 Live (Fola voice) when configured and updates isReading properly", async () => {
    vi.spyOn(api, "getMultimodalConfig").mockResolvedValue({
      mode: "builtin",
      builtin: {
        base_url: "https://generativelanguage.googleapis.com",
        api_key: "ai-test-key-live",
        model: "gemini-3.8-live",
      },
    });
    speechTtsModule.invalidateSpeechTtsConfigCache();

    const textRef = ref("El sol brilla en el cielo");
    const { reading, isReading, startReading, stopReading } = useReadAloud({
      getText: () => textRef.value,
      getTargetLang: () => "es",
      t: (key) => key,
    });

    startReading();
    expect(reading.value).toBe(true);
    expect(isReading.value).toBe(true);

    // Wait for WS to connect
    await vi.waitFor(() => expect(MockWebSocket.instances.length).toBe(1));
    const ws = MockWebSocket.instances[0];

    // Setup payload sent on open
    await vi.waitFor(() => expect(ws.sent.length).toBeGreaterThanOrEqual(1));
    const setupMsg = ws.sent[0];
    expect(setupMsg.setup.model).toBe("models/gemini-3.8-live");
    expect(
      setupMsg.setup.generationConfig.speechConfig.voiceConfig.prebuiltVoiceConfig.voiceName,
    ).toBe("Fola");
    expect(setupMsg.setup.tools).toBeUndefined();

    // Server setupComplete
    ws.receive({ setupComplete: {} });

    await vi.waitFor(() => expect(ws.sent.length).toBeGreaterThanOrEqual(2));
    const textMsg = ws.sent[1];
    expect(textMsg.clientContent.turns[0].parts[0].text).toBe("El sol brilla en el cielo");

    // Server streams audio chunk
    const pcmBase64 = float32ToPcm16Base64(new Float32Array([0.1, -0.1]), 24000, 24000);
    ws.receive({
      serverContent: {
        modelTurn: {
          parts: [{ inlineData: { mimeType: "audio/pcm;rate=24000", data: pcmBase64 } }],
        },
      },
    });

    expect(reading.value).toBe(true);
    expect(isReading.value).toBe(true);

    // Turn complete and audio end
    ws.receive({ serverContent: { turnComplete: true } });
    const audioCtx = MockAudioContext.instances[0];
    expect(audioCtx.sources.length).toBe(1);
    audioCtx.sources[0].onended();

    await vi.waitFor(() => expect(reading.value).toBe(false));
    expect(isReading.value).toBe(false);
  });

  it("stopReading stops playback and resets reading", async () => {
    vi.spyOn(api, "getMultimodalConfig").mockResolvedValue({
      mode: "builtin",
      builtin: {
        base_url: "https://generativelanguage.googleapis.com",
        api_key: "ai-test-key-live",
        model: "gemini-3.8-live",
      },
    });
    speechTtsModule.invalidateSpeechTtsConfigCache();

    const { reading, startReading, stopReading } = useReadAloud({
      getText: () => "Text to stop",
      getTargetLang: () => "en",
      t: (key) => key,
    });

    startReading();
    expect(reading.value).toBe(true);
    stopReading();
    expect(reading.value).toBe(false);
  });

  it("toggleReading starts when stopped and stops when running", () => {
    window.speechSynthesis = {
      speak: vi.fn(),
      cancel: vi.fn(),
      getVoices: vi.fn(() => []),
    };

    const { reading, toggleReading } = useReadAloud({
      getText: () => "Toggle test",
      getTargetLang: () => "es",
      t: (key) => key,
    });

    expect(reading.value).toBe(false);
    toggleReading();
    expect(reading.value).toBe(true);
    toggleReading();
    expect(reading.value).toBe(false);
  });
});
