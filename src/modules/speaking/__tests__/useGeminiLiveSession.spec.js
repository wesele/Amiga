import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  buildGeminiLiveWsUrl,
  buildGeminiLiveSetupPayload,
  float32ToPcm16Base64,
  pcm16Base64ToFloat32,
  testGeminiLiveConnection,
  useGeminiLiveSession,
} from "../useGeminiLiveSession.js";

// Mock WebSocket class for deterministic tests
class MockWebSocket {
  static OPEN = 1;
  static CLOSED = 3;
  static instances = [];

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
      return this.onmessage({ data: JSON.stringify(data) });
    }
  }

  triggerError(err) {
    if (this.onerror) {
      this.onerror(err || new Error("WS error"));
    }
  }
}

// Mock WebAudio context
class MockAudioContext {
  static instances = [];
  constructor(options = {}) {
    this.sampleRate = options.sampleRate || 24000;
    this.currentTime = 0;
    this.state = "running";
    this.destination = {};
    this.lastScriptProcessor = null;
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
    return src;
  }
  createGain() {
    return {
      gain: { value: 1 },
      connect: vi.fn(),
      disconnect: vi.fn(),
    };
  }
  createMediaStreamSource() {
    return {
      connect: vi.fn(),
      disconnect: vi.fn(),
    };
  }
  createScriptProcessor() {
    const proc = {
      onaudioprocess: null,
      connect: vi.fn(),
      disconnect: vi.fn(),
    };
    this.lastScriptProcessor = proc;
    return proc;
  }
  resume() {
    return Promise.resolve();
  }
  close() {
    this.state = "closed";
    return Promise.resolve();
  }
}

describe("useGeminiLiveSession helper functions", () => {
  describe("buildGeminiLiveWsUrl", () => {
    it("handles default baseUrl and encodes apiKey", () => {
      const url = buildGeminiLiveWsUrl("", "test-key-123");
      expect(url).toBe(
        "wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=test-key-123"
      );
    });

    it("strips trailing slashes", () => {
      const url = buildGeminiLiveWsUrl(
        "https://generativelanguage.googleapis.com///",
        "key"
      );
      expect(url).toContain("wss://generativelanguage.googleapis.com/ws/");
    });

    it("strips /v1beta and /v1 OpenAI-compat suffixes", () => {
      const u1 = buildGeminiLiveWsUrl(
        "https://generativelanguage.googleapis.com/v1beta",
        "key"
      );
      expect(u1).toBe(
        "wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=key"
      );

      const u2 = buildGeminiLiveWsUrl("https://myproxy.example.com/v1/", "key");
      expect(u2).toBe(
        "wss://myproxy.example.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=key"
      );
    });

    it("converts http to ws and handles URLs without scheme", () => {
      const u1 = buildGeminiLiveWsUrl("http://localhost:8080/v1beta", "abc");
      expect(u1).toBe(
        "ws://localhost:8080/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=abc"
      );

      const u2 = buildGeminiLiveWsUrl("gateway.internal", "xyz");
      expect(u2).toBe(
        "wss://gateway.internal/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=xyz"
      );
    });
  });

  describe("buildGeminiLiveSetupPayload", () => {
    it("normalizes model name and returns exact setup structure", () => {
      const payload = buildGeminiLiveSetupPayload({
        model: "gemini-3.8-live",
        voiceName: "Aoede",
        systemInstruction: "You are a Spanish barista in Madrid.",
        silenceDurationMs: 800,
      });

      expect(payload.setup.model).toBe("models/gemini-3.8-live");
      expect(payload.setup.generationConfig.responseModalities).toEqual(["AUDIO"]);
      expect(
        payload.setup.generationConfig.speechConfig.voiceConfig.prebuiltVoiceConfig.voiceName
      ).toBe("Aoede");
      expect(payload.setup.systemInstruction.parts[0].text).toBe(
        "You are a Spanish barista in Madrid."
      );
      expect(
        payload.setup.realtimeInputConfig.automaticActivityDetection.startOfSpeechSensitivity
      ).toBe("START_SENSITIVITY_HIGH");
      expect(
        payload.setup.realtimeInputConfig.automaticActivityDetection.endOfSpeechSensitivity
      ).toBe("END_SENSITIVITY_HIGH");
      expect(
        payload.setup.realtimeInputConfig.automaticActivityDetection.silenceDurationMs
      ).toBe(800);

      // Verify report_turn_and_progress tool
      const tool = payload.setup.tools[0].functionDeclarations[0];
      expect(tool.name).toBe("report_turn_and_progress");
      expect(tool.behavior).toBe("NON_BLOCKING");
      expect(tool.parameters.required).toEqual([
        "grammar_score",
        "relevance_score",
        "pronunciation_score",
        "completed_goal_indices",
      ]);

      // CRITICAL: verify enable_affective_dialog and proactive_audio are NOT present
      const rawJson = JSON.stringify(payload);
      expect(rawJson).not.toContain("enable_affective_dialog");
      expect(rawJson).not.toContain("proactive_audio");
    });

    it("keeps already normalized model name without double prefix", () => {
      const payload = buildGeminiLiveSetupPayload({
        model: "models/gemini-3.8-live",
      });
      expect(payload.setup.model).toBe("models/gemini-3.8-live");
    });
  });

  describe("float32ToPcm16Base64 & pcm16Base64ToFloat32", () => {
    it("encodes and decodes Float32Array to 16-bit PCM base64 accurately", () => {
      const original = new Float32Array([0.0, 0.5, -0.5, 0.9, -0.9]);
      const base64 = float32ToPcm16Base64(original, 16000, 16000);
      expect(typeof base64).toBe("string");
      expect(base64.length).toBeGreaterThan(0);

      const decoded = pcm16Base64ToFloat32(base64);
      expect(decoded.length).toBe(original.length);
      for (let i = 0; i < original.length; i++) {
        expect(decoded[i]).toBeCloseTo(original[i], 3);
      }
    });

    it("handles resampling when input sample rate differs from target sample rate", () => {
      const original = new Float32Array(4800); // 48kHz 0.1s
      for (let i = 0; i < original.length; i++) {
        original[i] = Math.sin((2 * Math.PI * 440 * i) / 48000);
      }
      const base64 = float32ToPcm16Base64(original, 48000, 16000);
      const decoded = pcm16Base64ToFloat32(base64);
      expect(decoded.length).toBe(1600); // 16kHz 0.1s
    });

    it("handles empty arrays gracefully", () => {
      expect(float32ToPcm16Base64(new Float32Array(0))).toBe("");
      expect(pcm16Base64ToFloat32("")).toEqual(new Float32Array(0));
    });
  });

  describe("testGeminiLiveConnection", () => {
    beforeEach(() => {
      MockWebSocket.instances = [];
    });

    it("succeeds when receiving setupComplete then serverContent", async () => {
      const promise = testGeminiLiveConnection(
        { api_key: "test-api-key", base_url: "https://generativelanguage.googleapis.com" },
        { timeoutMs: 2000, WebSocketImpl: MockWebSocket }
      );

      await vi.waitFor(() => expect(MockWebSocket.instances.length).toBe(1));
      const ws = MockWebSocket.instances[0];

      // Simulate handshake setupComplete
      ws.receive({ setupComplete: {} });

      // Expect client prompt sent
      expect(ws.sent.some((msg) => msg.clientContent?.turns?.[0]?.parts?.[0]?.text)).toBe(
        true
      );

      // Simulate first serverContent
      ws.receive({
        serverContent: {
          modelTurn: {
            parts: [{ inlineData: { mimeType: "audio/pcm;rate=24000", data: "AAAA" } }],
          },
        },
      });

      const res = await promise;
      expect(res.success).toBe(true);
      expect(res.message).toBe("Gemini Live 连接成功");
      expect(res.handshake_ms).toBeGreaterThanOrEqual(0);
      expect(res.completion_tokens).toBe(1);
    });

    it("fails on connection error or timeout", async () => {
      const promise = testGeminiLiveConnection(
        { api_key: "bad-key" },
        { timeoutMs: 50, WebSocketImpl: MockWebSocket }
      );

      const res = await promise;
      expect(res.success).toBe(false);
      expect(res.message).toContain("连接超时");
    });
  });
});

describe("useGeminiLiveSession composable", () => {
  beforeEach(() => {
    MockWebSocket.instances = [];
    MockAudioContext.instances = [];
  });

  it("handles full lifecycle: connect, greeting, transcription, tool call, coaching update", async () => {
    const onTurnRecorded = vi.fn();
    const session = useGeminiLiveSession({
      WebSocketImpl: MockWebSocket,
      AudioContextImpl: MockAudioContext,
      autoStartMic: false, // In test environment without real mic
    });

    expect(session.status.value).toBe("idle");
    expect(session.messages.value).toEqual([]);
    expect(session.completedGoalIndices.value).toEqual([]);

    await session.connect({
      apiKey: "test-api-key",
      baseUrl: "https://generativelanguage.googleapis.com",
      model: "gemini-3.8-live",
      voiceName: "Aoede",
      systemInstruction: "You are a tutor.",
      openingLine: "¡Hola! ¿En qué puedo ayudarte hoy?",
      onTurnRecorded,
    });

    expect(session.status.value).toBe("connecting");

    await vi.waitFor(() => expect(MockWebSocket.instances.length).toBe(1));
    const ws = MockWebSocket.instances[0];

    // Check setup payload sent on open
    await vi.waitFor(() => expect(ws.sent.length).toBeGreaterThanOrEqual(1));
    const setupMsg = ws.sent[0];
    expect(setupMsg.setup.model).toBe("models/gemini-3.8-live");
    expect(setupMsg.setup.tools[0].functionDeclarations[0].name).toBe(
      "report_turn_and_progress"
    );

    // 1. Simulate setupComplete from server
    ws.receive({ setupComplete: {} });
    expect(session.status.value).toBe("connected");

    // Check opening greeting prompt sent
    const greetingMsg = ws.sent.find((m) =>
      m.clientContent?.turns?.[0]?.parts?.[0]?.text?.includes("¡Hola! ¿En qué puedo ayudarte hoy?")
    );
    expect(greetingMsg).toBeTruthy();
    expect(greetingMsg.clientContent.turns[0].parts[0].text).toBe(
      'Please start the roleplay now by greeting the learner in character with this opening line: "¡Hola! ¿En qué puedo ayudarte hoy?"'
    );

    // 2. Simulate AI streaming output transcription and audio chunk
    ws.receive({
      serverContent: {
        outputTranscription: { text: "¡Hola! " },
      },
    });
    expect(session.messages.value.length).toBe(1);
    expect(session.messages.value[0].role).toBe("ai");
    expect(session.messages.value[0].text).toBe("¡Hola! ");
    expect(session.messages.value[0].streaming).toBe(true);

    // Simulate second piece of AI speech and PCM audio chunk
    const sampleAudioB64 = float32ToPcm16Base64(new Float32Array([0.1, -0.1]));
    ws.receive({
      serverContent: {
        outputTranscription: { text: "¿Cómo estás?" },
        modelTurn: {
          parts: [{ inlineData: { mimeType: "audio/pcm;rate=24000", data: sampleAudioB64 } }],
        },
      },
    });
    expect(session.messages.value[0].text).toBe("¡Hola! ¿Cómo estás?");
    expect(session.messages.value[0].audioChunks).toContain(sampleAudioB64);
    expect(session.isAiSpeaking.value).toBe(true);

    // AI finish speaking turn
    ws.receive({
      serverContent: {
        turnComplete: true,
      },
    });
    expect(session.messages.value[0].streaming).toBe(false);

    // 3. Simulate user speech transcription
    ws.receive({
      serverContent: {
        inputTranscription: { text: "Yo estoy bien, " },
      },
    });
    expect(session.messages.value.length).toBe(2);
    expect(session.messages.value[1].role).toBe("user");
    expect(session.messages.value[1].text).toBe("Yo estoy bien, ");

    ws.receive({
      serverContent: {
        inputTranscription: { text: "gracias." },
        turnComplete: true,
      },
    });
    expect(session.messages.value[1].text).toBe("Yo estoy bien, gracias.");
    expect(session.messages.value[1].streaming).toBe(false);

    // 4. Simulate report_turn_and_progress toolCall from AI
    ws.receive({
      toolCall: {
        functionCalls: [
          {
            id: "call_123",
            name: "report_turn_and_progress",
            args: {
              grammar_score: 90,
              relevance_score: 95,
              pronunciation_score: 85,
              better_expression: "Estoy muy bien, gracias.",
              tip_native: "在西语中日常回答可直接用 Estoy bien",
              completed_goal_indices: [0],
            },
          },
        ],
      },
    });

    // Check coaching attached to user message
    const userMsg = session.messages.value[1];
    expect(userMsg.coaching).toEqual({
      grammar: 90,
      relevance: 95,
      pronunciation: 85,
      total: Math.round(95 * 0.4 + 90 * 0.3 + 85 * 0.3), // 38 + 27 + 25.5 = 90.5 -> 91
      betterExpression: "Estoy muy bien, gracias.",
      tipNative: "在西语中日常回答可直接用 Estoy bien",
    });

    expect(session.completedGoalIndices.value).toEqual([0]);
    expect(session.turnCount.value).toBe(1);
    expect(session.averageScore.value).toBe(91);

    // Verify silent toolResponse was sent back over WebSocket
    const toolResp = ws.sent.find((m) => m.toolResponse?.functionResponses?.[0]?.id === "call_123");
    expect(toolResp).toBeTruthy();
    expect(toolResp.toolResponse.functionResponses[0].scheduling).toBe("SILENT");
    expect(toolResp.toolResponse.functionResponses[0].response.scheduling).toBe("SILENT");

    // Verify onTurnRecorded callback was invoked
    expect(onTurnRecorded).toHaveBeenCalledWith(
      expect.objectContaining({
        aiText: "¡Hola! ¿Cómo estás?",
        userTranscript: "Yo estoy bien, gracias.",
        grammarScore: 90,
        relevanceScore: 95,
        pronunciationScore: 85,
        totalScore: 91,
        betterExpression: "Estoy muy bien, gracias.",
        tipNative: "在西语中日常回答可直接用 Estoy bien",
        completedGoalIndices: [0],
      })
    );

    // 5. Test mute toggle
    expect(session.isMicMuted.value).toBe(false);
    session.toggleMute();
    expect(session.isMicMuted.value).toBe(true);
    const audioEndMsg = ws.sent.find((m) => m.realtimeInput?.audioStreamEnd);
    expect(audioEndMsg).toBeTruthy();

    // 6. Test sendTextPrompt (quick rescue)
    session.sendTextPrompt("请说慢一点");
    const textPromptMsg = ws.sent.find((m) => m.clientContent?.turns?.[0]?.parts?.[0]?.text === "请说慢一点");
    expect(textPromptMsg).toBeTruthy();

    // 7. Test interrupted: true
    session.isAiSpeaking.value = true;
    ws.receive({
      serverContent: {
        interrupted: true,
      },
    });
    expect(session.isAiSpeaking.value).toBe(false);

    // 8. Test disconnect
    await session.disconnect();
    expect(session.status.value).toBe("closed");
  });

  it("replayMessageAudio replays stored audioChunks through AudioContext", () => {
    const session = useGeminiLiveSession({
      WebSocketImpl: MockWebSocket,
      AudioContextImpl: MockAudioContext,
      autoStartMic: false,
    });

    const b64_1 = float32ToPcm16Base64(new Float32Array([0.1, 0.2]));
    const b64_2 = float32ToPcm16Base64(new Float32Array([0.3, 0.4]));
    const message = {
      role: "ai",
      audioChunks: [b64_1, b64_2],
    };

    session.replayMessageAudio(message);
    expect(session.isAiSpeaking.value).toBe(true);

    // Interrupt AI audio
    session.interruptAi();
    expect(session.isAiSpeaking.value).toBe(false);
  });

  it("streams mic audio using realtimeInput.audio schema and suppresses frames when isAiSpeaking is true", async () => {
    const mockTracks = [{ stop: vi.fn() }];
    const mockNavigator = {
      mediaDevices: {
        getUserMedia: vi.fn().mockResolvedValue({
          getTracks: () => mockTracks,
        }),
      },
    };

    const session = useGeminiLiveSession({
      WebSocketImpl: MockWebSocket,
      AudioContextImpl: MockAudioContext,
      navigatorImpl: mockNavigator,
      autoStartMic: false,
    });

    await session.connect({
      apiKey: "test-api-key",
      baseUrl: "https://generativelanguage.googleapis.com",
    });

    await vi.waitFor(() => expect(MockWebSocket.instances.length).toBe(1));
    const ws = MockWebSocket.instances[0];
    await vi.waitFor(() => expect(ws.readyState).toBe(MockWebSocket.OPEN));

    ws.receive({ setupComplete: {} });
    expect(session.status.value).toBe("connected");

    await session.startMicCapture();

    const inputCtx = MockAudioContext.instances.find((ctx) => ctx.lastScriptProcessor);
    expect(inputCtx).toBeTruthy();
    const processor = inputCtx.lastScriptProcessor;
    expect(typeof processor.onaudioprocess).toBe("function");

    // 1. Send normal audio frame when AI is silent
    const fakeBuffer = new Float32Array([0.1, -0.2, 0.3, -0.4]);
    processor.onaudioprocess({
      inputBuffer: {
        getChannelData: () => fakeBuffer,
      },
    });

    const sentAudioMsg = ws.sent.find((m) => m.realtimeInput?.audio);
    expect(sentAudioMsg).toBeTruthy();
    expect(sentAudioMsg.realtimeInput.audio.mimeType).toBe("audio/pcm;rate=16000");
    expect(typeof sentAudioMsg.realtimeInput.audio.data).toBe("string");
    expect(sentAudioMsg.realtimeInput.audio.data.length).toBeGreaterThan(0);

    // Verify deprecated mediaChunks is NOT used
    const sentMediaChunks = ws.sent.find((m) => m.realtimeInput?.mediaChunks);
    expect(sentMediaChunks).toBeUndefined();

    // 2. Suppress microphone streaming while isAiSpeaking is true
    session.isAiSpeaking.value = true;
    const sentCountBefore = ws.sent.length;
    processor.onaudioprocess({
      inputBuffer: {
        getChannelData: () => fakeBuffer,
      },
    });

    expect(session.userAudioLevel.value).toBe(0);
    expect(ws.sent.length).toBe(sentCountBefore);

    // 3. Suppress microphone streaming when mic is muted
    session.isAiSpeaking.value = false;
    session.isMicMuted.value = true;
    processor.onaudioprocess({
      inputBuffer: {
        getChannelData: () => fakeBuffer,
      },
    });

    expect(session.userAudioLevel.value).toBe(0);
    expect(ws.sent.length).toBe(sentCountBefore);

    // 4. Suppress microphone streaming and zero userAudioLevel when WebSocket is not OPEN
    session.isMicMuted.value = false;
    ws.readyState = 2; // CLOSING
    processor.onaudioprocess({
      inputBuffer: {
        getChannelData: () => fakeBuffer,
      },
    });

    expect(session.userAudioLevel.value).toBe(0);
    expect(ws.sent.length).toBe(sentCountBefore);

    await session.disconnect();
  });

  it("handles server error messages by setting status to error and populating error.value", async () => {
    const session = useGeminiLiveSession({
      WebSocketImpl: MockWebSocket,
      AudioContextImpl: MockAudioContext,
      autoStartMic: false,
    });

    await session.connect({
      apiKey: "test-api-key",
      baseUrl: "https://generativelanguage.googleapis.com",
    });

    await vi.waitFor(() => expect(MockWebSocket.instances.length).toBe(1));
    const ws = MockWebSocket.instances[0];

    // Simulate server error frame with custom message
    ws.receive({
      error: {
        code: 429,
        message: "Resource has been exhausted (quota exceeded)",
        status: "RESOURCE_EXHAUSTED",
      },
    });

    expect(session.status.value).toBe("error");
    expect(session.error.value).toBe("Resource has been exhausted (quota exceeded)");

    // Test fallback error message when error.message is not provided
    ws.receive({
      error: {},
    });
    expect(session.status.value).toBe("error");
    expect(session.error.value).toBe("Gemini Live 服务端错误");

    await session.disconnect();
  });

  it("safety cleanup timer prevents isAiSpeaking from staying true if onended never fires", async () => {
    vi.useFakeTimers();
    try {
      class LeakyAudioContext extends MockAudioContext {
        createBufferSource() {
          const src = {
            buffer: null,
            connect: vi.fn(),
            disconnect: vi.fn(),
            start: vi.fn(),
            stop: vi.fn(),
            onended: null,
          };
          return src;
        }
      }

      const session = useGeminiLiveSession({
        WebSocketImpl: MockWebSocket,
        AudioContextImpl: LeakyAudioContext,
        autoStartMic: false,
      });

      const connectPromise = session.connect({
        apiKey: "test-api-key",
      });
      vi.advanceTimersByTime(10);
      await connectPromise;

      const ws = MockWebSocket.instances[0];
      ws.receive({ setupComplete: {} });

      const sampleAudioB64 = float32ToPcm16Base64(new Float32Array([0.1, -0.1]));
      ws.receive({
        serverContent: {
          modelTurn: {
            parts: [{ inlineData: { mimeType: "audio/pcm;rate=24000", data: sampleAudioB64 } }],
          },
        },
      });

      expect(session.isAiSpeaking.value).toBe(true);

      // Advance timers past maxWaitMs (duration + 400ms)
      vi.advanceTimersByTime(1000);

      expect(session.isAiSpeaking.value).toBe(false);
      expect(session.aiAudioLevel.value).toBe(0);

      await session.disconnect();
    } finally {
      vi.useRealTimers();
    }
  });

  it("stopAiPlayback clears _safetyTimer and resets onended on all active sources", async () => {
    vi.useFakeTimers();
    try {
      const session = useGeminiLiveSession({
        WebSocketImpl: MockWebSocket,
        AudioContextImpl: MockAudioContext,
        autoStartMic: false,
      });

      const connectPromise = session.connect({ apiKey: "test-api-key" });
      vi.advanceTimersByTime(10);
      await connectPromise;

      const ws = MockWebSocket.instances[0];
      ws.receive({ setupComplete: {} });

      const sampleAudioB64 = float32ToPcm16Base64(new Float32Array([0.1, -0.1]));
      ws.receive({
        serverContent: {
          modelTurn: {
            parts: [{ inlineData: { mimeType: "audio/pcm;rate=24000", data: sampleAudioB64 } }],
          },
        },
      });

      expect(session.isAiSpeaking.value).toBe(true);

      // Stop playback directly
      session.interruptAi();
      expect(session.isAiSpeaking.value).toBe(false);
      expect(session.aiAudioLevel.value).toBe(0);

      // Advancing timer after stop should not trigger ghost state changes
      vi.advanceTimersByTime(2000);
      expect(session.isAiSpeaking.value).toBe(false);

      await session.disconnect();
    } finally {
      vi.useRealTimers();
    }
  });

  it("enforces 350ms echo tail cooldown after AI speech ends before mic frames can be processed", async () => {
    vi.useFakeTimers();
    try {
      const mockTracks = [{ stop: vi.fn() }];
      const mockNavigator = {
        mediaDevices: {
          getUserMedia: vi.fn().mockResolvedValue({
            getTracks: () => mockTracks,
          }),
        },
      };

      const session = useGeminiLiveSession({
        WebSocketImpl: MockWebSocket,
        AudioContextImpl: MockAudioContext,
        navigatorImpl: mockNavigator,
        autoStartMic: false,
      });

      const connectPromise = session.connect({
        apiKey: "test-api-key",
      });
      vi.advanceTimersByTime(10);
      await connectPromise;

      const ws = MockWebSocket.instances[0];
      ws.receive({ setupComplete: {} });
      await session.startMicCapture();

      const inputCtx = MockAudioContext.instances.find((ctx) => ctx.lastScriptProcessor);
      const processor = inputCtx.lastScriptProcessor;

      // Play an AI audio chunk
      const sampleAudioB64 = float32ToPcm16Base64(new Float32Array([0.1, -0.1]));
      ws.receive({
        serverContent: {
          modelTurn: {
            parts: [{ inlineData: { mimeType: "audio/pcm;rate=24000", data: sampleAudioB64 } }],
          },
        },
      });
      expect(session.isAiSpeaking.value).toBe(true);

      // Advance timers by 500ms so playPcmChunk safety timer or onended fires
      vi.advanceTimersByTime(500);
      expect(session.isAiSpeaking.value).toBe(false);

      // Now AI is no longer speaking, but 350ms echo tail cooldown is active!
      const fakeBuffer = new Float32Array([0.2, -0.2, 0.4]);
      const sentBefore = ws.sent.length;
      processor.onaudioprocess({
        inputBuffer: {
          getChannelData: () => fakeBuffer,
        },
      });

      // Frame should be suppressed and userAudioLevel zeroed
      expect(session.userAudioLevel.value).toBe(0);
      expect(ws.sent.length).toBe(sentBefore);

      // Advance timers past 350ms cooldown (e.g. 360ms)
      vi.advanceTimersByTime(360);

      // Now mic frame should be processed and sent!
      processor.onaudioprocess({
        inputBuffer: {
          getChannelData: () => fakeBuffer,
        },
      });

      expect(session.userAudioLevel.value).toBeGreaterThan(0);
      expect(ws.sent.length).toBe(sentBefore + 1);

      await session.disconnect();
    } finally {
      vi.useRealTimers();
    }
  });
});
