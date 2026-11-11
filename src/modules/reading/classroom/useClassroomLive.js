import { ref } from "vue";
import {
  buildGeminiLiveWsUrl,
  buildGeminiLiveSetupPayload,
  float32ToPcm16Base64,
  pcm16Base64ToFloat32,
} from "@/modules/speaking/useGeminiLiveSession.js";
import { classroomTools } from "./classroomTools.js";

// Drop the brief echo tail when playback stops or drains.
const ECHO_TAIL_MS = 500;
export function useClassroomLive({
  WebSocketImpl = globalThis.WebSocket,
  AudioContextImpl = globalThis.AudioContext || globalThis.webkitAudioContext,
  navigatorImpl = globalThis.navigator,
  onEvent = () => {},
  onTool = () => ({ ok: false }),
  acceptOutput = () => true,
} = {}) {
  const status = ref("idle");
  const error = ref("");
  const micError = ref("");
  const micEnabled = ref(false);
  const speaking = ref(false);
  const connected = ref(false);
  let socket, output, input, stream, processor, source, gain, workletUrl;
  let sources = new Set();
  let playAt = 0;
  let busy = false;
  let responseHasContent = false;
  let interrupted = false;
  let dropping = false;
  let pending = null;
  let boundaryTimer, handshakeTimer;
  let eventQueue = Promise.resolve();
  let sessionHandle = "";
  let connectionGeneration = 0;
  let micGeneration = 0;
  let echoTailUntil = 0;
  let captureBlockedThrough = 0;

  function blockEchoTail() {
    echoTailUntil = Date.now() + ECHO_TAIL_MS;
    if (input) captureBlockedThrough = input.currentTime + ECHO_TAIL_MS / 1000;
  }

  function emit(event) {
    onEvent(event);
  }
  function stopAudio({ protectEchoTail = true } = {}) {
    if (protectEchoTail && sources.size) blockEchoTail();
    for (const source of sources) {
      source.onended = null;
      clearTimeout(source.cleanupTimer);
      try {
        source.stop();
        source.disconnect();
      } catch {
        /* already ended */
      }
    }
    sources = new Set();
    playAt = 0;
    speaking.value = false;
  }
  function play(data, mime = "audio/pcm;rate=24000") {
    if (!acceptOutput() || !output) return;
    const samples = pcm16Base64ToFloat32(data);
    if (!samples.length) return;
    const rate = Number(mime.match(/rate=(\d+)/)?.[1]) || 24000;
    const buffer = output.createBuffer(1, samples.length, rate);
    buffer.copyToChannel(samples, 0);
    const item = output.createBufferSource();
    item.buffer = buffer;
    item.connect(output.destination);
    playAt = Math.max(output.currentTime, playAt);
    item.start(playAt);
    playAt += buffer.duration;
    sources.add(item);
    const wasSpeaking = speaking.value;
    speaking.value = true;
    if (!wasSpeaking) emit({ type: "audio_started" });
    const ended = () => {
      if (!sources.delete(item)) return;
      clearTimeout(item.cleanupTimer);
      item.disconnect();
      if (!sources.size) {
        blockEchoTail();
        speaking.value = false;
        emit({ type: "audio_drained" });
      }
    };
    item.onended = ended;
    // Some Android WebViews miss onended while foregrounding. Never count audio
    // as heard merely because wall time passed while the AudioContext is suspended.
    const check = () => {
      if (output?.state === "running" && output.currentTime >= playAt) ended();
      else item.cleanupTimer = setTimeout(check, 500);
    };
    item.cleanupTimer = setTimeout(check, Math.max(0, (playAt - output.currentTime) * 1000) + 400);
  }
  function write(payload) {
    if (socket?.readyState === 1) {
      socket.send(JSON.stringify(payload));
      return true;
    }
    return false;
  }
  function beginResponse() {
    busy = true;
    responseHasContent = true;
  }
  function dispatch(text) {
    busy = true;
    responseHasContent = false;
    interrupted = false;
    write({ clientContent: { turns: [{ role: "user", parts: [{ text }] }], turnComplete: true } });
  }
  function send(text) {
    if (!connected.value) return false;
    if (busy) {
      pending = text;
      if (!dropping) {
        dropping = true;
        stopAudio();
        write({
          clientContent: {
            turns: [
              {
                role: "user",
                parts: [
                  {
                    text: "Stop the current turn immediately and remain silent. A new classroom instruction follows.",
                  },
                ],
              },
            ],
            turnComplete: true,
          },
        });
        boundaryTimer = setTimeout(() => {
          if (dropping) {
            error.value = "课堂响应超时，请重新连接";
            void disconnect();
            emit({ type: "connection_lost" });
          }
        }, 6000);
      }
    } else {
      stopAudio();
      dispatch(text);
    }
    return true;
  }
  function silence(
    instruction = "The student paused. Stop speaking and end your turn. Remain silent until explicit continue.",
  ) {
    pending = null;
    stopAudio();
    if (connected.value && !dropping) {
      dropping = busy;
      busy = true;
      write({
        clientContent: {
          turns: [{ role: "user", parts: [{ text: instruction }] }],
          turnComplete: true,
        },
      });
      boundaryTimer = setTimeout(() => {
        if (dropping) void disconnect();
      }, 6000);
    }
  }
  async function receive(message) {
    if (message.error) {
      sessionHandle = "";
      error.value = message.error.message || "Gemini Live 错误";
      emit({ type: "connection_lost" });
      await disconnect();
      return;
    }
    if (message.setupComplete) {
      clearTimeout(handshakeTimer);
      connected.value = true;
      status.value = "connected";
      emit({ type: "ready" });
    }
    if (message.sessionResumptionUpdate?.newHandle)
      sessionHandle = message.sessionResumptionUpdate.newHandle;
    if (message.goAway) emit({ type: "go_away" });
    const content = message.serverContent;
    const wasDropping = dropping;
    if (
      !dropping &&
      (message.voiceActivity?.type === "ACTIVITY_START" || content?.speechState === "SPEECH")
    ) {
      if (!busy && speaking.value) stopAudio({ protectEchoTail: false });
      emit({ type: "student_started" });
    }
    if (content) {
      if (content.interrupted) {
        interrupted = true;
        stopAudio({ protectEchoTail: dropping });
        if (!dropping) emit({ type: "interrupted" });
      }
      if (!dropping && !interrupted) {
        if (content.outputTranscription?.text || content.modelTurn?.parts?.length) beginResponse();
        if (content.outputTranscription?.text && acceptOutput())
          emit({ type: "teacher_text", text: content.outputTranscription.text });
        for (const part of content.modelTurn?.parts || []) {
          if (part.inlineData?.data && String(part.inlineData.mimeType).startsWith("audio/pcm")) {
            busy = true;
            play(part.inlineData.data, part.inlineData.mimeType);
          }
        }
      }
    }
    if (message.toolCall?.functionCalls && !dropping && !interrupted) {
      // A tool can arrive after turnComplete while the teacher's audio drains.
      // Acknowledge it without treating it as a new turn or a student interruption.
      if (busy || !speaking.value) {
        busy = true;
        if (message.toolCall.functionCalls.some((call) => call.name !== "write_classroom_board"))
          responseHasContent = true;
      }
      for (const call of message.toolCall.functionCalls) {
        let result;
        try {
          result = onTool(call.name, call.args || {});
        } catch {
          result = { ok: false, reason: "Invalid classroom state" };
        }
        write({
          toolResponse: {
            functionResponses: [
              { id: call.id, name: call.name, response: { result, scheduling: "SILENT" } },
            ],
          },
        });
      }
    }
    if (content?.turnComplete && (content.interactionStatus !== "IN_PROGRESS" || content.interrupted)) {
      const hadContent = responseHasContent;
      responseHasContent = false;
      busy = false;
      const cancelled = interrupted || dropping;
      interrupted = false;
      if (dropping) {
        dropping = false;
        clearTimeout(boundaryTimer);
        const next = pending;
        pending = null;
        if (next) {
          dispatch(next);
          return;
        }
      }
      if (hadContent || cancelled) emit({ type: "turn_ended", cancelled, audible: speaking.value });
    }
    if (!wasDropping && !dropping && content?.inputTranscription) {
      const { text, finished } = content.inputTranscription;
      if (text || finished) emit({ type: "student_text", text: text || "", finished });
    }
  }
  async function connect(config, instruction) {
    await disconnect();
    error.value = "";
    status.value = "connecting";
    const generation = ++connectionGeneration;
    if (!config.api_key) throw new Error("请先配置 Gemini Live");
    const audio = new AudioContextImpl({ sampleRate: 24000 });
    output = audio;
    let resumeTimer;
    try {
      await Promise.race([
        audio.resume(),
        new Promise((_, reject) => {
          resumeTimer = setTimeout(
            () => reject(new Error("声音初始化超时，请再次点击开始上课")),
            10000,
          );
        }),
      ]);
    } catch (cause) {
      if (generation !== connectionGeneration) return;
      await disconnect();
      throw cause;
    } finally {
      clearTimeout(resumeTimer);
    }
    if (generation !== connectionGeneration) {
      await audio.close().catch(() => {});
      return;
    }
    const token = config.api_key.startsWith("auth_tokens/");
    const url = token
      ? `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContentConstrained?access_token=${encodeURIComponent(config.api_key)}`
      : buildGeminiLiveWsUrl(config.base_url, config.api_key);
    const current = new WebSocketImpl(url);
    socket = current;
    current.onopen = () => {
      if (socket !== current) return;
      const payload = buildGeminiLiveSetupPayload({
        model: config.model || "gemini-3.8-live",
        systemInstruction: instruction,
        silenceDurationMs: 1200,
      });
      payload.setup.tools = [{ functionDeclarations: classroomTools }];
      payload.setup.sessionResumption = sessionHandle ? { handle: sessionHandle } : {};
      payload.setup.contextWindowCompression = { slidingWindow: {} };
      write(payload);
    };
    current.onmessage = (event) => {
      eventQueue = eventQueue
        .then(async () => {
          if (socket !== current) return;
          const raw = typeof event.data === "string" ? event.data : await event.data.text();
          const message = JSON.parse(raw);
          if (socket === current) await receive(message);
        })
        .catch(() => {
          error.value = "课堂连接数据异常，请重新连接";
          emit({ type: "connection_lost" });
          void disconnect();
        });
    };
    current.onerror = () => {
      if (socket === current) {
        error.value = "无法连接 Gemini Live，请检查语音配置和网络";
        sessionHandle = "";
      }
    };
    current.onclose = () => {
      if (socket === current) {
        connected.value = false;
        status.value = "closed";
        stopAudio();
        void stopMic();
        emit({ type: "connection_lost" });
      }
    };
    handshakeTimer = setTimeout(() => {
      if (!connected.value && socket === current) {
        error.value = "连接 AI 老师超时";
        void disconnect();
        emit({ type: "connection_lost" });
      }
    }, 15000);
  }
  async function stopMic() {
    micGeneration += 1;
    micEnabled.value = false;
    if (stream) for (const track of stream.getTracks()) track.stop();
    stream = null;
    if (processor) {
      processor.onaudioprocess = null;
      if (processor.port) processor.port.onmessage = null;
      processor.disconnect();
    }
    source?.disconnect();
    gain?.disconnect();
    processor = source = gain = null;
    if (input) await input.close().catch(() => {});
    input = null;
    if (workletUrl) URL.revokeObjectURL(workletUrl);
    workletUrl = null;
    if (connected.value) write({ realtimeInput: { audioStreamEnd: true } });
  }
  async function startMic() {
    if (micEnabled.value) return;
    const generation = ++micGeneration;
    micError.value = "";
    try {
      const current = socket;
      const captured = await navigatorImpl.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: false,
        },
      });
      if (!connected.value || socket !== current || generation !== micGeneration) {
        captured.getTracks().forEach((t) => t.stop());
        return;
      }
      stream = captured;
      input = new AudioContextImpl();
      await input.resume();
      if (!connected.value || socket !== current || generation !== micGeneration) return;
      captureBlockedThrough = input.currentTime + Math.max(0, echoTailUntil - Date.now()) / 1000;
      source = input.createMediaStreamSource(stream);
      const upload = (samples, capturedAt = input.currentTime) => {
        if (!connected.value || !micEnabled.value) return;
        // Echo cancellation is requested above so the microphone stays live
        // during speech. Use the capture timestamp to drop echo-tail blocks.
        if (
          dropping ||
          Date.now() < echoTailUntil ||
          capturedAt - samples.length / input.sampleRate < captureBlockedThrough
        )
          return;
        write({
          realtimeInput: {
            audio: {
              mimeType: "audio/pcm;rate=16000",
              data: float32ToPcm16Base64(samples, input.sampleRate, 16000),
            },
          },
        });
      };
      if (input.audioWorklet && globalThis.AudioWorkletNode) {
        workletUrl = URL.createObjectURL(
          new Blob(
            [
              `class ClassroomMic extends AudioWorkletProcessor { constructor(){super();this.samples=[];} process(inputs){const channel=inputs[0]?.[0];if(channel){this.samples.push(...channel);if(this.samples.length>=1024){this.port.postMessage({samples:new Float32Array(this.samples),endTime:currentTime+channel.length/sampleRate});this.samples=[];}}return true;}} registerProcessor('classroom-mic',ClassroomMic);`,
            ],
            { type: "text/javascript" },
          ),
        );
        await input.audioWorklet.addModule(workletUrl);
        if (!connected.value || socket !== current || generation !== micGeneration) return;
        processor = new AudioWorkletNode(input, "classroom-mic");
        processor.port.onmessage = (event) => upload(event.data.samples, event.data.endTime);
      } else {
        processor = input.createScriptProcessor(2048, 1, 1);
        processor.onaudioprocess = (event) => upload(event.inputBuffer.getChannelData(0));
      }
      gain = input.createGain();
      gain.gain.value = 0;
      source.connect(processor);
      processor.connect(gain);
      gain.connect(input.destination);
      micEnabled.value = true;
    } catch {
      if (generation === micGeneration) {
        await stopMic();
        micError.value = "麦克风不可用，可以继续用文字提问";
      }
    }
  }
  async function disconnect() {
    connectionGeneration += 1;
    clearTimeout(handshakeTimer);
    clearTimeout(boundaryTimer);
    pending = null;
    const previous = socket;
    socket = null;
    connected.value = false;
    status.value = "closed";
    busy = false;
    responseHasContent = false;
    dropping = interrupted = false;
    if (previous) {
      previous.onmessage = previous.onclose = previous.onerror = previous.onopen = null;
      previous.close();
    }
    stopAudio();
    const previousOutput = output;
    output = null;
    await stopMic();
    if (previousOutput) await previousOutput.close().catch(() => {});
  }
  return {
    status,
    error,
    micError,
    micEnabled,
    speaking,
    connected,
    connect,
    disconnect,
    send,
    silence,
    stopAudio,
    startMic,
    stopMic,
    clearResumption: () => {
      sessionHandle = "";
    },
  };
}
