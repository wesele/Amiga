import { ref, getCurrentInstance, onUnmounted } from "vue";

/**
 * Normalizes baseUrl and builds the Gemini 3.8 Live WebSocket URL.
 * Strips trailing slashes and /v1beta or /v1 suffixes, ensures wss:// scheme.
 *
 * @param {string} baseUrl
 * @param {string} apiKey
 * @returns {string}
 */
export function buildGeminiLiveWsUrl(baseUrl, apiKey) {
  let base = (baseUrl || "").trim();
  if (!base) {
    base = "https://generativelanguage.googleapis.com";
  }

  // Strip trailing slashes
  base = base.replace(/\/+$/, "");

  // Strip /v1beta or /v1 suffix (with or without trailing slashes)
  base = base.replace(/\/(v1beta|v1)\/?$/, "");
  base = base.replace(/\/+$/, "");

  // Handle scheme replacement
  if (base.startsWith("https://")) {
    base = "wss://" + base.slice("https://".length);
  } else if (base.startsWith("http://")) {
    base = "ws://" + base.slice("http://".length);
  } else if (!base.startsWith("wss://") && !base.startsWith("ws://")) {
    base = "wss://" + base;
  }

  const encodedKey = encodeURIComponent(apiKey || "");
  return `${base}/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=${encodedKey}`;
}

/**
 * Builds the initial setup message payload for Gemini 3.8 Live BidiGenerateContent.
 *
 * CRITICAL: Never include enable_affective_dialog or proactive_audio: false
 * (they are built-in to gemini-3.8-live and cause errors if passed).
 *
 * @param {object} params
 * @param {string} [params.model="gemini-3.8-live"]
 * @param {string} [params.voiceName="Aoede"]
 * @param {string} [params.systemInstruction=""]
 * @param {number} [params.silenceDurationMs=800]
 * @returns {object}
 */
export function buildGeminiLiveSetupPayload({
  model = "gemini-3.8-live",
  voiceName = "Aoede",
  systemInstruction = "",
  silenceDurationMs = 800,
} = {}) {
  const rawModel = model || "gemini-3.8-live";
  const normalizedModel = rawModel.startsWith("models/") ? rawModel : `models/${rawModel}`;

  return {
    setup: {
      model: normalizedModel,
      generationConfig: {
        responseModalities: ["AUDIO"],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: {
              voiceName: voiceName || "Aoede",
            },
          },
        },
      },
      ...(systemInstruction
        ? { systemInstruction: { parts: [{ text: systemInstruction }] } }
        : {}),
      inputAudioTranscription: {},
      outputAudioTranscription: {},
      realtimeInputConfig: {
        automaticActivityDetection: {
          disabled: false,
          startOfSpeechSensitivity: "START_SENSITIVITY_HIGH",
          endOfSpeechSensitivity: "END_SENSITIVITY_HIGH",
          prefixPaddingMs: 300,
          silenceDurationMs,
        },
      },
      tools: [
        {
          functionDeclarations: [
            {
              name: "report_turn_and_progress",
              behavior: "NON_BLOCKING",
              description:
                "Silently record the learner's spoken turn quality, an optional more idiomatic expression in the target language, a short native-language tip, and completed scenario goal indices (0, 1, 2). Never speak scores aloud.",
              parameters: {
                type: "OBJECT",
                properties: {
                  grammar_score: { type: "INTEGER" },
                  relevance_score: { type: "INTEGER" },
                  pronunciation_score: { type: "INTEGER" },
                  better_expression: { type: "STRING" },
                  tip_native: { type: "STRING" },
                  completed_goal_indices: {
                    type: "ARRAY",
                    items: { type: "INTEGER" },
                  },
                },
                required: [
                  "grammar_score",
                  "relevance_score",
                  "pronunciation_score",
                  "completed_goal_indices",
                ],
              },
            },
          ],
        },
      ],
    },
  };
}

/**
 * Converts Float32Array [-1.0, 1.0] audio samples to 16-bit Little-Endian PCM Base64.
 * Optionally downsamples if inputSampleRate !== targetSampleRate.
 *
 * @param {Float32Array} float32Array
 * @param {number} [inputSampleRate=16000]
 * @param {number} [targetSampleRate=16000]
 * @returns {string} Base64 string
 */
export function float32ToPcm16Base64(float32Array, inputSampleRate = 16000, targetSampleRate = 16000) {
  if (!float32Array || float32Array.length === 0) {
    return "";
  }

  let samples = float32Array;
  if (inputSampleRate !== targetSampleRate && inputSampleRate > 0 && targetSampleRate > 0) {
    const ratio = inputSampleRate / targetSampleRate;
    const targetLength = Math.round(float32Array.length / ratio);
    const resampled = new Float32Array(targetLength);
    for (let i = 0; i < targetLength; i++) {
      const originIndex = i * ratio;
      const indexPrev = Math.floor(originIndex);
      const indexNext = Math.min(indexPrev + 1, float32Array.length - 1);
      const fraction = originIndex - indexPrev;
      resampled[i] = float32Array[indexPrev] * (1 - fraction) + float32Array[indexNext] * fraction;
    }
    samples = resampled;
  }

  const buffer = new ArrayBuffer(samples.length * 2);
  const view = new DataView(buffer);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    const val = s < 0 ? s * 0x8000 : s * 0x7fff;
    view.setInt16(i * 2, Math.round(val), true); // Little-endian
  }

  const bytes = new Uint8Array(buffer);
  if (typeof globalThis.Buffer !== "undefined") {
    return globalThis.Buffer.from(buffer).toString("base64");
  }

  let binary = "";
  const len = bytes.byteLength;
  const chunkSize = 0x8000;
  for (let i = 0; i < len; i += chunkSize) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, Math.min(i + chunkSize, len)));
  }
  return btoa(binary);
}

/**
 * Decodes 16-bit Little-Endian PCM Base64 to Float32Array [-1.0, 1.0].
 *
 * @param {string} base64
 * @returns {Float32Array}
 */
export function pcm16Base64ToFloat32(base64) {
  if (!base64) {
    return new Float32Array(0);
  }

  let bytes;
  if (typeof globalThis.Buffer !== "undefined") {
    const buf = globalThis.Buffer.from(base64, "base64");
    bytes = new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
  } else {
    const binary = atob(base64);
    const len = binary.length;
    bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
  }

  const sampleCount = Math.floor(bytes.byteLength / 2);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const float32 = new Float32Array(sampleCount);
  for (let i = 0; i < sampleCount; i++) {
    const int16 = view.getInt16(i * 2, true); // Little-endian
    float32[i] = int16 < 0 ? int16 / 0x8000 : int16 / 0x7fff;
  }
  return float32;
}

/**
 * Safely parses string, Blob, ArrayBuffer, or TypedArray into a JSON object.
 * Returns the parsed object synchronously if data is string/ArrayBuffer,
 * or a Promise if data is a Blob.
 *
 * @param {any} data
 * @returns {any | Promise<any>}
 */
function parseWsData(data) {
  if (typeof data === "string") {
    return JSON.parse(data);
  }
  if (data instanceof ArrayBuffer || ArrayBuffer.isView(data)) {
    return JSON.parse(new TextDecoder().decode(data));
  }
  if (typeof Blob !== "undefined" && data instanceof Blob) {
    return data.text().then((text) => JSON.parse(text));
  }
  return JSON.parse(String(data));
}

/**
 * Tests Gemini Live WebSocket connection and returns latency metrics.
 *
 * @param {object} config
 * @param {string} config.api_key
 * @param {string} [config.base_url]
 * @param {string} [config.model="gemini-3.8-live"]
 * @param {object} [options]
 * @param {number} [options.timeoutMs=12000]
 * @param {any} [options.WebSocketImpl=globalThis.WebSocket]
 * @returns {Promise<{ success: boolean, message: string, time_to_first_token_ms: number, handshake_ms: number, thinking_speed: number, decode_speed: number, thinking_tokens: number, completion_tokens: number }>}
 */
export function testGeminiLiveConnection(
  config,
  { timeoutMs = 12000, WebSocketImpl = globalThis.WebSocket } = {}
) {
  return new Promise((resolve) => {
    if (!WebSocketImpl) {
      resolve({
        success: false,
        message: "WebSocket is not supported in this environment",
        time_to_first_token_ms: 0,
        handshake_ms: 0,
        thinking_speed: 0,
        decode_speed: 0,
        thinking_tokens: 0,
        completion_tokens: 0,
      });
      return;
    }

    let ws = null;
    let timer = null;
    let handshakeMs = 0;
    let promptSentTime = 0;
    const startTime = Date.now();
    let settled = false;

    function finish(result) {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      if (ws) {
        try {
          ws.onopen = null;
          ws.onmessage = null;
          ws.onerror = null;
          ws.onclose = null;
          ws.close();
        } catch (e) {}
        ws = null;
      }
      resolve(result);
    }

    timer = setTimeout(() => {
      finish({
        success: false,
        message: `Gemini Live 连接超时 (${timeoutMs}ms)`,
        time_to_first_token_ms: 0,
        handshake_ms: handshakeMs,
        thinking_speed: 0,
        decode_speed: 0,
        thinking_tokens: 0,
        completion_tokens: 0,
      });
    }, timeoutMs);

    try {
      const url = buildGeminiLiveWsUrl(
        config.base_url || config.baseUrl,
        config.api_key || config.apiKey
      );
      ws = new WebSocketImpl(url);
    } catch (err) {
      finish({
        success: false,
        message: err.message || "Failed to initialize WebSocket",
        time_to_first_token_ms: 0,
        handshake_ms: 0,
        thinking_speed: 0,
        decode_speed: 0,
        thinking_tokens: 0,
        completion_tokens: 0,
      });
      return;
    }

    ws.onopen = () => {
      const rawModel = config.model || "gemini-3.8-live";
      const model = rawModel.startsWith("models/") ? rawModel : `models/${rawModel}`;
      const setupMsg = {
        setup: {
          model,
          generationConfig: {
            responseModalities: ["AUDIO"],
          },
          outputAudioTranscription: {},
        },
      };
      try {
        ws.send(JSON.stringify(setupMsg));
      } catch (err) {
        finish({
          success: false,
          message: err.message || "Failed to send setup message",
          time_to_first_token_ms: 0,
          handshake_ms: 0,
          thinking_speed: 0,
          decode_speed: 0,
          thinking_tokens: 0,
          completion_tokens: 0,
        });
      }
    };

    ws.onmessage = (event) => {
      const handleData = (data) => {
        if (!data) return;
        if (data.error) {
          finish({
            success: false,
            message: data.error.message || "Gemini Live 服务端错误",
            time_to_first_token_ms: 0,
            handshake_ms: handshakeMs,
            thinking_speed: 0,
            decode_speed: 0,
            thinking_tokens: 0,
            completion_tokens: 0,
          });
          return;
        }
        if (data.setupComplete) {
          handshakeMs = Math.max(1, Date.now() - startTime);
          promptSentTime = Date.now();
          ws.send(
            JSON.stringify({
              clientContent: {
                turns: [{ role: "user", parts: [{ text: "Say hello in one word." }] }],
                turnComplete: true,
              },
            })
          );
        } else if (data.serverContent) {
          const hasAudio = data.serverContent.modelTurn?.parts?.some((p) => p.inlineData?.data);
          const hasTranscription = Boolean(data.serverContent.outputTranscription?.text);
          const hasModelTurn = Boolean(data.serverContent.modelTurn);
          if (hasAudio || hasTranscription || hasModelTurn) {
            const ttftMs = promptSentTime > 0 ? Math.max(1, Date.now() - promptSentTime) : 0;
            finish({
              success: true,
              message: "Gemini Live 连接成功",
              time_to_first_token_ms: ttftMs,
              handshake_ms: handshakeMs,
              thinking_speed: 0,
              decode_speed: 0,
              thinking_tokens: 0,
              completion_tokens: 1,
            });
          }
        }
      };

      try {
        const parsed = parseWsData(event.data);
        if (parsed && typeof parsed.then === "function") {
          parsed.then(handleData).catch(() => {});
        } else if (parsed) {
          handleData(parsed);
        }
      } catch (err) {
        // Continue waiting until valid serverContent or timeout
      }
    };

    ws.onerror = (err) => {
      finish({
        success: false,
        message: err?.message || "Gemini Live WebSocket 连接错误",
        time_to_first_token_ms: 0,
        handshake_ms: handshakeMs,
        thinking_speed: 0,
        decode_speed: 0,
        thinking_tokens: 0,
        completion_tokens: 0,
      });
    };

    ws.onclose = () => {
      if (!settled) {
        finish({
          success: false,
          message: "Gemini Live WebSocket 连接已关闭",
          time_to_first_token_ms: 0,
          handshake_ms: handshakeMs,
          thinking_speed: 0,
          decode_speed: 0,
          thinking_tokens: 0,
          completion_tokens: 0,
        });
      }
    };
  });
}

/**
 * Vue 3 composable for Gemini 3.8 Live full-duplex session.
 *
 * @param {object} [options]
 * @param {any} [options.WebSocketImpl]
 * @param {any} [options.AudioContextImpl]
 * @param {any} [options.navigatorImpl]
 * @param {boolean} [options.autoStartMic=true]
 */
export function useGeminiLiveSession(options = {}) {
  const {
    WebSocketImpl = typeof WebSocket !== "undefined" ? WebSocket : globalThis.WebSocket,
    AudioContextImpl = typeof AudioContext !== "undefined"
      ? AudioContext
      : globalThis.AudioContext || globalThis.webkitAudioContext,
    navigatorImpl = typeof navigator !== "undefined" ? navigator : globalThis.navigator,
    autoStartMic = true,
  } = options;

  // Reactive state
  const status = ref("idle"); // 'idle' | 'connecting' | 'connected' | 'error' | 'closed'
  const error = ref("");
  const errorCode = ref(null);
  const isAiSpeaking = ref(false);
  const isMicMuted = ref(false);
  const userAudioLevel = ref(0); // 0.0 - 1.0
  const aiAudioLevel = ref(0); // 0.0 - 1.0
  const messages = ref([]); // array of { id, role, text, translation, coaching, audioChunks, streaming }
  const completedGoalIndices = ref([]);
  const turnCount = ref(0);
  const averageScore = ref(0);

  // Non-reactive internal audio & network state
  let ws = null;
  let inputAudioCtx = null;
  let micStream = null;
  let micSource = null;
  let micProcessor = null;
  let outputAudioCtx = null;
  let activeAudioSources = [];
  let nextAiPlayTime = 0;
  let aiSpeechCooldownUntil = 0;

  function ensureOutputAudioContext() {
    if (!outputAudioCtx && AudioContextImpl) {
      try {
        outputAudioCtx = new AudioContextImpl({ sampleRate: 24000 });
      } catch (e) {
        outputAudioCtx = new AudioContextImpl();
      }
    }
    if (outputAudioCtx && outputAudioCtx.state === "suspended") {
      outputAudioCtx.resume().catch(() => {});
    }
    return outputAudioCtx;
  }

  function playPcmChunk(base64Pcm) {
    const ctx = ensureOutputAudioContext();
    if (!ctx || !ctx.createBuffer) return;

    if (outputAudioCtx && outputAudioCtx.state === "suspended") {
      outputAudioCtx.resume().catch(() => {});
    }

    const float32Data = pcm16Base64ToFloat32(base64Pcm);
    if (!float32Data || float32Data.length === 0) return;

    // AI voice level RMS calculation
    let sum = 0;
    for (let i = 0; i < float32Data.length; i++) {
      sum += float32Data[i] * float32Data[i];
    }
    const rms = Math.sqrt(sum / float32Data.length);
    aiAudioLevel.value = Math.min(1, Math.max(0, rms * 4));

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
    if (nextAiPlayTime < currentTime) {
      nextAiPlayTime = currentTime;
    }
    source.start(nextAiPlayTime);
    nextAiPlayTime += audioBuffer.duration;

    isAiSpeaking.value = true;
    activeAudioSources.push(source);

    let cleanedUp = false;
    let safetyTimer = null;
    const cleanupSource = () => {
      if (cleanedUp) return;
      cleanedUp = true;
      if (safetyTimer) {
        clearTimeout(safetyTimer);
        safetyTimer = null;
      }
      const idx = activeAudioSources.indexOf(source);
      if (idx !== -1) {
        activeAudioSources.splice(idx, 1);
      }
      if (activeAudioSources.length === 0) {
        isAiSpeaking.value = false;
        aiAudioLevel.value = 0;
        aiSpeechCooldownUntil = Date.now() + 350;
      }
    };

    source.onended = cleanupSource;
    const maxWaitMs = Math.max(0, (nextAiPlayTime - currentTime) * 1000) + 400;
    safetyTimer = setTimeout(cleanupSource, maxWaitMs);
    source._safetyTimer = safetyTimer;
  }

  function stopAiPlayback() {
    for (const s of activeAudioSources) {
      if (s._safetyTimer) {
        clearTimeout(s._safetyTimer);
        s._safetyTimer = null;
      }
      s.onended = null;
      try {
        s.stop();
        s.disconnect();
      } catch (e) {}
    }
    activeAudioSources = [];
    nextAiPlayTime = 0;
    isAiSpeaking.value = false;
    aiAudioLevel.value = 0;
    aiSpeechCooldownUntil = 0;
  }

  async function startMicCapture() {
    if (!navigatorImpl?.mediaDevices?.getUserMedia) {
      status.value = "error";
      errorCode.value = "MIC_UNAVAILABLE";
      error.value = "Microphone is not supported";
      return;
    }
    try {
      micStream = await navigatorImpl.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      if (!AudioContextImpl) {
        status.value = "error";
        errorCode.value = "MIC_UNAVAILABLE";
        error.value = "WebAudio is not supported";
        return;
      }
      inputAudioCtx = new AudioContextImpl();

      micSource = inputAudioCtx.createMediaStreamSource(micStream);
      const bufferSize = 2048;
      micProcessor = inputAudioCtx.createScriptProcessor
        ? inputAudioCtx.createScriptProcessor(bufferSize, 1, 1)
        : null;

      if (!micProcessor) return;

      micProcessor.onaudioprocess = (e) => {
        if (status.value !== "connected") return;
        const inputBuffer = e.inputBuffer.getChannelData(0);

        let sum = 0;
        for (let i = 0; i < inputBuffer.length; i++) {
          sum += inputBuffer[i] * inputBuffer[i];
        }
        const rms = Math.sqrt(sum / inputBuffer.length);

        if (
          isMicMuted.value ||
          isAiSpeaking.value ||
          Date.now() < aiSpeechCooldownUntil ||
          !ws ||
          ws.readyState !== 1 /* OPEN */
        ) {
          userAudioLevel.value = 0;
          return;
        }

        userAudioLevel.value = Math.min(1, Math.max(0, rms * 4));

        const base64Chunk = float32ToPcm16Base64(inputBuffer, inputAudioCtx.sampleRate, 16000);
        if (base64Chunk) {
          ws.send(
            JSON.stringify({
              realtimeInput: {
                audio: {
                  mimeType: "audio/pcm;rate=16000",
                  data: base64Chunk,
                },
              },
            })
          );
        }
      };

      micSource.connect(micProcessor);
      const silentGain = inputAudioCtx.createGain();
      silentGain.gain.value = 0;
      micProcessor.connect(silentGain);
      silentGain.connect(inputAudioCtx.destination);

      if (inputAudioCtx.state === "suspended") {
        inputAudioCtx.resume().catch(() => {});
      }

      if (status.value === "error" && errorCode.value && errorCode.value.startsWith("MIC_")) {
        status.value = "connected";
        error.value = "";
        errorCode.value = null;
      }
    } catch (err) {
      status.value = "error";
      const errName = err?.name || "";
      if (errName === "NotAllowedError" || errName === "PermissionDeniedError") {
        errorCode.value = "MIC_PERMISSION_DENIED";
      } else if (errName === "NotFoundError" || errName === "DevicesNotFoundError") {
        errorCode.value = "MIC_NOT_FOUND";
      } else {
        errorCode.value = "MIC_ERROR";
      }
      error.value = err?.message || "Failed to access microphone";
    }
  }

  async function connect({
    apiKey,
    baseUrl,
    model = "gemini-3.8-live",
    voiceName = "Aoede",
    systemInstruction = "",
    openingLine = "",
    silenceDurationMs = 800,
    onTurnRecorded,
  } = {}) {
    if (!WebSocketImpl) {
      status.value = "error";
      errorCode.value = "WS_UNSUPPORTED";
      error.value = "WebSocket is not supported";
      return;
    }

    if (!apiKey) {
      status.value = "error";
      errorCode.value = "API_KEY_MISSING";
      error.value = "Gemini API Key not configured";
      return;
    }

    await disconnect();

    status.value = "connecting";
    error.value = "";
    errorCode.value = null;
    ensureOutputAudioContext();
    isAiSpeaking.value = false;
    isMicMuted.value = false;
    userAudioLevel.value = 0;
    aiAudioLevel.value = 0;
    messages.value = [];
    completedGoalIndices.value = [];
    turnCount.value = 0;
    averageScore.value = 0;

    const wsUrl = buildGeminiLiveWsUrl(baseUrl, apiKey);
    ws = new WebSocketImpl(wsUrl);

    ws.onopen = () => {
      const setupPayload = buildGeminiLiveSetupPayload({
        model,
        voiceName,
        systemInstruction,
        silenceDurationMs,
      });
      ws.send(JSON.stringify(setupPayload));
    };

    const handleServerMessage = (msg) => {
      if (!msg) return;

      if (msg.error) {
        status.value = "error";
        errorCode.value = "SERVER_ERROR";
        error.value = msg.error.message || "Gemini Live 服务端错误";
        return;
      }

      // 1. Setup complete
      if (msg.setupComplete) {
        status.value = "connected";
        if (autoStartMic) {
          startMicCapture();
        }
        const greetingPrompt = openingLine
          ? `Please start the roleplay now by greeting the learner in character with this opening line: "${openingLine}"`
          : "Please start the conversation now by greeting the learner in character.";
        ws.send(
          JSON.stringify({
            clientContent: {
              turns: [{ role: "user", parts: [{ text: greetingPrompt }] }],
              turnComplete: true,
            },
          })
        );
        return;
      }

      // 2. Server content
      if (msg.serverContent) {
        const sc = msg.serverContent;

        if (sc.interrupted) {
          stopAiPlayback();
          for (const m of messages.value) {
            if (m.role === "ai" && m.streaming) {
              m.streaming = false;
            }
          }
        }

        // User speech transcription
        if (sc.inputTranscription?.text) {
          let lastMsg = messages.value[messages.value.length - 1];
          if (!lastMsg || lastMsg.role !== "user" || !lastMsg.streaming) {
            lastMsg = {
              id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
              role: "user",
              text: "",
              translation: "",
              coaching: null,
              audioChunks: [],
              streaming: true,
            };
            messages.value.push(lastMsg);
          }
          lastMsg.text += sc.inputTranscription.text;
        }

        // AI speech transcription
        const outputTrans = sc.outputTranscription?.text;
        if (outputTrans) {
          let lastMsg = messages.value[messages.value.length - 1];
          if (!lastMsg || lastMsg.role !== "ai" || !lastMsg.streaming) {
            lastMsg = {
              id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
              role: "ai",
              text: "",
              translation: "",
              coaching: null,
              audioChunks: [],
              streaming: true,
            };
            messages.value.push(lastMsg);
          }
          lastMsg.text += outputTrans;
        }

        // AI audio & parts
        if (Array.isArray(sc.modelTurn?.parts)) {
          for (const part of sc.modelTurn.parts) {
            if (
              part.inlineData?.data &&
              (!part.inlineData.mimeType || part.inlineData.mimeType.startsWith("audio/pcm"))
            ) {
              const pcmBase64 = part.inlineData.data;
              let lastMsg = messages.value[messages.value.length - 1];
              if (!lastMsg || lastMsg.role !== "ai") {
                lastMsg = {
                  id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
                  role: "ai",
                  text: "",
                  translation: "",
                  coaching: null,
                  audioChunks: [],
                  streaming: true,
                };
                messages.value.push(lastMsg);
              }
              lastMsg.audioChunks.push(pcmBase64);
              playPcmChunk(pcmBase64);
            } else if (part.text && !outputTrans && !part.thought) {
              // Fallback to part.text only if outputAudioTranscription is empty and not thought
              let lastMsg = messages.value[messages.value.length - 1];
              if (!lastMsg || lastMsg.role !== "ai") {
                lastMsg = {
                  id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
                  role: "ai",
                  text: "",
                  translation: "",
                  coaching: null,
                  audioChunks: [],
                  streaming: true,
                };
                messages.value.push(lastMsg);
              }
              lastMsg.text += part.text;
            }
          }
        }

        if (sc.turnComplete) {
          for (const m of messages.value) {
            if (m.streaming) {
              m.streaming = false;
            }
          }
        }
      }

      // 3. Tool call
      if (msg.toolCall && Array.isArray(msg.toolCall.functionCalls)) {
        const functionResponses = [];
        for (const fc of msg.toolCall.functionCalls) {
          if (fc.name === "report_turn_and_progress") {
            const args = fc.args || {};
            const grammar = Number(args.grammar_score ?? 0);
            const relevance = Number(args.relevance_score ?? 0);
            const pronunciation = Number(args.pronunciation_score ?? 0);
            const total = Math.round(relevance * 0.4 + grammar * 0.3 + pronunciation * 0.3);

            const coaching = {
              grammar,
              relevance,
              pronunciation,
              total,
              betterExpression: args.better_expression || "",
              tipNative: args.tip_native || "",
            };

            // Find the most recent 'user' message
            let targetUserMsg = null;
            for (let i = messages.value.length - 1; i >= 0; i--) {
              if (messages.value[i].role === "user") {
                targetUserMsg = messages.value[i];
                break;
              }
            }
            if (targetUserMsg) {
              targetUserMsg.coaching = coaching;
            }

            // Merge completed_goal_indices
            if (Array.isArray(args.completed_goal_indices)) {
              const merged = new Set([...completedGoalIndices.value, ...args.completed_goal_indices]);
              completedGoalIndices.value = Array.from(merged).sort((a, b) => a - b);
            }

            // Update turnCount
            turnCount.value += 1;

            // Update averageScore
            const scoredMessages = messages.value.filter(
              (m) => m.role === "user" && m.coaching && typeof m.coaching.total === "number"
            );
            if (scoredMessages.length > 0) {
              const sum = scoredMessages.reduce((acc, m) => acc + m.coaching.total, 0);
              averageScore.value = Math.round(sum / scoredMessages.length);
            }

            // Trigger onTurnRecorded
            if (typeof onTurnRecorded === "function") {
              let lastAiMsg = null;
              for (let i = messages.value.length - 1; i >= 0; i--) {
                if (messages.value[i].role === "ai") {
                  lastAiMsg = messages.value[i];
                  break;
                }
              }
              try {
                onTurnRecorded({
                  aiText: lastAiMsg?.text || "",
                  userTranscript: targetUserMsg?.text || "",
                  grammarScore: grammar,
                  relevanceScore: relevance,
                  pronunciationScore: pronunciation,
                  totalScore: total,
                  betterExpression: coaching.betterExpression,
                  tipNative: coaching.tipNative,
                  completedGoalIndices: [...completedGoalIndices.value],
                });
              } catch (e) {
                console.error("onTurnRecorded error:", e);
              }
            }

            functionResponses.push({
              id: fc.id,
              name: fc.name,
              scheduling: "SILENT",
              response: {
                result: { ok: true },
                scheduling: "SILENT",
              },
            });
          }
        }

        if (functionResponses.length > 0 && ws && ws.readyState === 1 /* OPEN */) {
          ws.send(
            JSON.stringify({
              toolResponse: {
                functionResponses,
              },
            })
          );
        }
      }
    };

    ws.onmessage = (event) => {
      try {
        const parsed = parseWsData(event.data);
        if (parsed && typeof parsed.then === "function") {
          parsed.then(handleServerMessage).catch(() => {});
        } else if (parsed) {
          handleServerMessage(parsed);
        }
      } catch (e) {}
    };

    ws.onerror = (err) => {
      status.value = "error";
      errorCode.value = "WS_ERROR";
      error.value = err?.message || "WebSocket connection error";
    };

    ws.onclose = () => {
      if (status.value !== "closed") {
        status.value = "closed";
      }
    };
  }

  function toggleMute() {
    isMicMuted.value = !isMicMuted.value;
    if (isMicMuted.value) {
      userAudioLevel.value = 0;
      if (ws && ws.readyState === 1 /* OPEN */) {
        try {
          ws.send(
            JSON.stringify({
              realtimeInput: {
                audioStreamEnd: true,
              },
            })
          );
        } catch (e) {}
      }
    } else {
      if (inputAudioCtx && inputAudioCtx.state === "suspended") {
        inputAudioCtx.resume().catch(() => {});
      }
      if (outputAudioCtx && outputAudioCtx.state === "suspended") {
        outputAudioCtx.resume().catch(() => {});
      }
    }
  }

  function sendTextPrompt(text) {
    if (!text || !ws || ws.readyState !== 1 /* OPEN */) return;
    ws.send(
      JSON.stringify({
        clientContent: {
          turns: [
            {
              role: "user",
              parts: [{ text }],
            },
          ],
          turnComplete: true,
        },
      })
    );
  }

  function replayMessageAudio(message) {
    if (!message || !Array.isArray(message.audioChunks) || message.audioChunks.length === 0) {
      return;
    }
    stopAiPlayback();
    const ctx = ensureOutputAudioContext();
    if (!ctx || !ctx.createBuffer) return;

    const decodedChunks = message.audioChunks.map((b64) => pcm16Base64ToFloat32(b64));
    const totalLength = decodedChunks.reduce((acc, c) => acc + c.length, 0);
    if (totalLength === 0) return;

    const combined = new Float32Array(totalLength);
    let offset = 0;
    for (const chunk of decodedChunks) {
      combined.set(chunk, offset);
      offset += chunk.length;
    }

    const audioBuffer = ctx.createBuffer(1, combined.length, 24000);
    if (audioBuffer.copyToChannel) {
      audioBuffer.copyToChannel(combined, 0);
    } else if (audioBuffer.getChannelData) {
      audioBuffer.getChannelData(0).set(combined);
    }

    const source = ctx.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(ctx.destination);
    source.start();

    isAiSpeaking.value = true;
    activeAudioSources.push(source);

    let cleanedUp = false;
    let safetyTimer = null;
    const cleanupSource = () => {
      if (cleanedUp) return;
      cleanedUp = true;
      if (safetyTimer) {
        clearTimeout(safetyTimer);
        safetyTimer = null;
      }
      const idx = activeAudioSources.indexOf(source);
      if (idx !== -1) {
        activeAudioSources.splice(idx, 1);
      }
      if (activeAudioSources.length === 0) {
        isAiSpeaking.value = false;
        aiAudioLevel.value = 0;
        aiSpeechCooldownUntil = Date.now() + 350;
      }
    };

    source.onended = cleanupSource;
    const maxWaitMs = Math.max(0, audioBuffer.duration * 1000) + 400;
    safetyTimer = setTimeout(cleanupSource, maxWaitMs);
    source._safetyTimer = safetyTimer;
  }

  function interruptAi() {
    stopAiPlayback();
  }

  async function disconnect() {
    status.value = "closed";
    if (micStream) {
      try {
        micStream.getTracks().forEach((t) => t.stop());
      } catch (e) {}
      micStream = null;
    }
    if (micProcessor) {
      try {
        micProcessor.disconnect();
      } catch (e) {}
      micProcessor = null;
    }
    if (micSource) {
      try {
        micSource.disconnect();
      } catch (e) {}
      micSource = null;
    }
    if (inputAudioCtx && inputAudioCtx.state !== "closed") {
      try {
        await inputAudioCtx.close();
      } catch (e) {}
      inputAudioCtx = null;
    }
    stopAiPlayback();
    if (outputAudioCtx && outputAudioCtx.state !== "closed") {
      try {
        await outputAudioCtx.close();
      } catch (e) {}
      outputAudioCtx = null;
    }
    if (ws) {
      try {
        ws.onopen = null;
        ws.onmessage = null;
        ws.onerror = null;
        ws.onclose = null;
        ws.close();
      } catch (e) {}
      ws = null;
    }
    userAudioLevel.value = 0;
    aiAudioLevel.value = 0;
    isAiSpeaking.value = false;
    aiSpeechCooldownUntil = 0;
  }

  if (getCurrentInstance()) {
    onUnmounted(() => {
      disconnect();
    });
  }

  return {
    // Reactive state
    status,
    error,
    errorCode,
    isAiSpeaking,
    isMicMuted,
    userAudioLevel,
    aiAudioLevel,
    messages,
    completedGoalIndices,
    turnCount,
    averageScore,

    // Methods
    connect,
    disconnect,
    toggleMute,
    sendTextPrompt,
    replayMessageAudio,
    interruptAi,
    startMicCapture,
  };
}
