import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ref } from "vue";
import { useReadAloud } from "@/shared/readAloud.js";
import {
  buildArticleReadSegments,
  splitTextIntoSentences,
  tokenizeParagraphSentences,
} from "@/shared/articleText.js";
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

describe("articleText sentence utilities", () => {
  it("splits text into sentences using Intl.Segmenter or fallback", () => {
    expect(splitTextIntoSentences("")).toEqual([]);
    expect(splitTextIntoSentences("   ")).toEqual([]);
    expect(splitTextIntoSentences("Hola mundo. ¿Cómo estás? ¡Muy bien!")).toEqual([
      "Hola mundo.",
      "¿Cómo estás?",
      "¡Muy bien!",
    ]);
    expect(splitTextIntoSentences("<b>Primera frase.</b> Segunda frase!")).toEqual([
      "Primera frase.",
      "Segunda frase!",
    ]);
    expect(splitTextIntoSentences("Texto sin puntuacion final")).toEqual([
      "Texto sin puntuacion final",
    ]);

    // Test fallback when Intl.Segmenter is absent
    const origSegmenter = Intl.Segmenter;
    try {
      Intl.Segmenter = undefined;
      const res = splitTextIntoSentences("Sentence one. Sentence two! Sentence three?");
      expect(res).toEqual(["Sentence one.", "Sentence two!", "Sentence three?"]);
    } finally {
      Intl.Segmenter = origSegmenter;
    }
  });

  it("tokenizes paragraph sentences and preserves context source", () => {
    const paragraph = "El gato duerme tranquilamente bajo el sol. El perro juega en el jardín.";
    const isNew = (w) => w.toLowerCase() === "perro";

    const sentences = tokenizeParagraphSentences(paragraph, isNew);
    expect(sentences.length).toBe(2);
    expect(sentences[0].text).toContain("El gato duerme");
    expect(sentences[1].text).toContain("El perro juega");

    const perroToken = sentences[1].tokens.find((t) => t.text === "perro");
    expect(perroToken).toBeDefined();
    expect(perroToken.isWord).toBe(true);
    expect(perroToken.isNewWord).toBe(true);
    expect(perroToken.context).toContain("perro");
  });

  it("builds article read segments with title and sentence indices", () => {
    const segments = buildArticleReadSegments({
      title: "  Noticia de hoy  ",
      paragraphs: [
        "Frase 1. Frase 2.",
        [{ text: "Frase 3." }, { text: "Frase 4." }],
      ],
    });

    expect(segments).toEqual([
      { isTitle: true, paragraphIndex: -1, sentenceIndex: -1, text: "Noticia de hoy" },
      { isTitle: false, paragraphIndex: 0, sentenceIndex: 0, text: "Frase 1." },
      { isTitle: false, paragraphIndex: 0, sentenceIndex: 1, text: "Frase 2." },
      { isTitle: false, paragraphIndex: 1, sentenceIndex: 0, text: "Frase 3." },
      { isTitle: false, paragraphIndex: 1, sentenceIndex: 1, text: "Frase 4." },
    ]);

    const withoutTitle = buildArticleReadSegments({
      title: "",
      paragraphs: ["Solo una frase."],
    });
    expect(withoutTitle).toEqual([
      { isTitle: false, paragraphIndex: 0, sentenceIndex: 0, text: "Solo una frase." },
    ]);
  });
});

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
    const { reading, isReading, startReading } = useReadAloud({
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

  it("manages sequential multi-sentence playback across title, sentence 0, sentence 1, and completion", () => {
    const speakCalls = [];
    let currentOptions = null;

    vi.spyOn(speechTtsModule, "speakText").mockImplementation((text, lang, opts) => {
      speakCalls.push({ text, lang, opts });
      currentOptions = opts;
      opts?.onStart?.();
      return true;
    });

    const segments = [
      { isTitle: true, paragraphIndex: -1, sentenceIndex: -1, text: "Breaking News" },
      { isTitle: false, paragraphIndex: 0, sentenceIndex: 0, text: "First sentence." },
      { isTitle: false, paragraphIndex: 0, sentenceIndex: 1, text: "Second sentence." },
    ];

    const {
      reading,
      activeSentence,
      isTitleActive,
      isSentenceActive,
      startReading,
    } = useReadAloud({
      getSegments: () => segments,
      getLang: () => "en",
      t: (k) => k,
    });

    expect(reading.value).toBe(false);
    expect(activeSentence.value).toBeNull();
    expect(isTitleActive.value).toBe(false);
    expect(isSentenceActive(0, 0)).toBe(false);

    // 1. Start playback -> Title is active
    startReading();
    expect(reading.value).toBe(true);
    expect(isTitleActive.value).toBe(true);
    expect(activeSentence.value).toEqual({ isTitle: true, paragraphIndex: -1, sentenceIndex: -1 });
    expect(isSentenceActive(0, 0)).toBe(false);
    expect(speakCalls[0].text).toBe("Breaking News");

    // 2. Title ends -> Paragraph 0, sentence 0 becomes active
    currentOptions.onEnd();
    expect(reading.value).toBe(true);
    expect(isTitleActive.value).toBe(false);
    expect(isSentenceActive(0, 0)).toBe(true);
    expect(isSentenceActive(0, 1)).toBe(false);
    expect(activeSentence.value).toEqual({ isTitle: false, paragraphIndex: 0, sentenceIndex: 0 });
    expect(speakCalls[1].text).toBe("First sentence.");

    // 3. Sentence 0 ends -> Paragraph 0, sentence 1 becomes active
    currentOptions.onEnd();
    expect(reading.value).toBe(true);
    expect(isTitleActive.value).toBe(false);
    expect(isSentenceActive(0, 0)).toBe(false);
    expect(isSentenceActive(0, 1)).toBe(true);
    expect(activeSentence.value).toEqual({ isTitle: false, paragraphIndex: 0, sentenceIndex: 1 });
    expect(speakCalls[2].text).toBe("Second sentence.");

    // 4. Sentence 1 ends -> All completed, state resets
    currentOptions.onEnd();
    expect(reading.value).toBe(false);
    expect(isTitleActive.value).toBe(false);
    expect(isSentenceActive(0, 1)).toBe(false);
    expect(activeSentence.value).toBeNull();
  });

  it("immediately resets activeSentence and cancels playback on stopReading", () => {
    let currentOptions = null;
    vi.spyOn(speechTtsModule, "speakText").mockImplementation((text, lang, opts) => {
      currentOptions = opts;
      opts?.onStart?.();
      return true;
    });

    const segments = [
      { isTitle: true, paragraphIndex: -1, sentenceIndex: -1, text: "Title" },
      { isTitle: false, paragraphIndex: 0, sentenceIndex: 0, text: "Sentence." },
    ];

    const {
      reading,
      activeSentence,
      isTitleActive,
      isSentenceActive,
      startReading,
      stopReading,
    } = useReadAloud({
      getSegments: () => segments,
      getLang: () => "es",
    });

    startReading();
    expect(reading.value).toBe(true);
    expect(isTitleActive.value).toBe(true);

    const savedOptions = currentOptions;
    stopReading();
    expect(reading.value).toBe(false);
    expect(activeSentence.value).toBeNull();
    expect(isTitleActive.value).toBe(false);
    expect(isSentenceActive(0, 0)).toBe(false);

    // Outdated in-flight callback does not restart sequence
    savedOptions.onEnd();
    expect(reading.value).toBe(false);
    expect(activeSentence.value).toBeNull();
  });

  it("handles errors and resets reading and activeSentence", () => {
    let currentOptions = null;
    vi.spyOn(speechTtsModule, "speakText").mockImplementation((text, lang, opts) => {
      currentOptions = opts;
      opts?.onStart?.();
      return true;
    });

    const { reading, activeSentence, isSentenceActive, startReading } = useReadAloud({
      getSegments: () => [
        { isTitle: false, paragraphIndex: 0, sentenceIndex: 0, text: "Sentence." },
      ],
      getLang: () => "en",
    });

    startReading();
    expect(reading.value).toBe(true);
    expect(isSentenceActive(0, 0)).toBe(true);

    currentOptions.onError(new Error("TTS failed"));
    expect(reading.value).toBe(false);
    expect(activeSentence.value).toBeNull();
    expect(isSentenceActive(0, 0)).toBe(false);
  });

  it("derives sentences and paragraphs from getText when getSegments is omitted", () => {
    const speakCalls = [];
    let currentOptions = null;

    vi.spyOn(speechTtsModule, "speakText").mockImplementation((text, lang, opts) => {
      speakCalls.push({ text, lang, opts });
      currentOptions = opts;
      opts?.onStart?.();
      return true;
    });

    const fullText = "First sentence. Second sentence.\n\nParagraph two single sentence.";
    const {
      reading,
      activeSentence,
      isSentenceActive,
      startReading,
    } = useReadAloud({
      getText: () => fullText,
      getLang: () => "en",
    });

    startReading();
    expect(reading.value).toBe(true);
    expect(isSentenceActive(0, 0)).toBe(true);
    expect(speakCalls[0].text).toBe("First sentence.");

    currentOptions.onEnd();
    expect(isSentenceActive(0, 1)).toBe(true);
    expect(speakCalls[1].text).toBe("Second sentence.");

    currentOptions.onEnd();
    expect(isSentenceActive(1, 0)).toBe(true);
    expect(speakCalls[2].text).toBe("Paragraph two single sentence.");

    currentOptions.onEnd();
    expect(reading.value).toBe(false);
    expect(activeSentence.value).toBeNull();
  });
});
