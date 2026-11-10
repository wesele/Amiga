import { afterEach, describe, expect, it, vi } from "vitest";
import { useClassroomLive } from "../classroom/useClassroomLive.js";

class Socket {
  static instances = [];
  readyState = 1;
  sent = [];
  constructor(url) {
    this.url = url;
    Socket.instances.push(this);
  }
  send(value) {
    this.sent.push(JSON.parse(value));
  }
  close() {
    this.readyState = 3;
  }
  async receive(value) {
    this.onmessage?.({ data: JSON.stringify(value) });
    await flush();
  }
}
const flush = async () => {
  for (let n = 0; n < 8; n++) await Promise.resolve();
};
class Audio {
  currentTime = 0;
  state = "running";
  sampleRate = 48000;
  destination = {};
  sources = [];
  resume = async () => {};
  close = async () => {
    this.state = "closed";
  };
  createBuffer(_channels, length, rate) {
    return { duration: length / rate, copyToChannel() {} };
  }
  createBufferSource() {
    const s = { connect() {}, start() {}, stop: vi.fn(), disconnect() {} };
    this.sources.push(s);
    return s;
  }
  createMediaStreamSource() {
    return { connect() {}, disconnect() {} };
  }
  createGain() {
    return { gain: { value: 0 }, connect() {}, disconnect() {} };
  }
  createScriptProcessor() {
    this.processor = { connect() {}, disconnect() {}, onaudioprocess: null };
    return this.processor;
  }
}
const sessions = [];
afterEach(async () => {
  for (const s of sessions.splice(0)) await s.disconnect();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
async function setup(extra = {}) {
  const events = [],
    contexts = [],
    stop = vi.fn();
  const s = useClassroomLive({
    WebSocketImpl: Socket,
    AudioContextImpl: class extends Audio {
      constructor(...args) {
        super(...args);
        contexts.push(this);
      }
    },
    navigatorImpl: {
      mediaDevices: { getUserMedia: async () => ({ getTracks: () => [{ stop }] }) },
    },
    onEvent: (e) => events.push(e),
    ...extra,
  });
  sessions.push(s);
  await s.connect({ api_key: "test", model: "gemini-3.8-live" }, "Teacher");
  const socket = Socket.instances.at(-1);
  socket.onopen();
  await socket.receive({ setupComplete: {} });
  return { s, socket, events, contexts, stop };
}
describe("Classroom Live transport", () => {
  it("does not end a teaching turn for a board-only acknowledgement before speech", async () => {
    const h = await setup({ onTool: () => ({ ok: true }) });
    h.s.send("Explain and write a note");
    await h.socket.receive({
      toolCall: { functionCalls: [{ id: "board", name: "write_classroom_board", args: {} }] },
    });
    await h.socket.receive({ serverContent: { turnComplete: true } });
    expect(h.events.some((event) => event.type === "turn_ended")).toBe(false);
    await h.socket.receive({
      serverContent: {
        outputTranscription: { text: "La expresión significa…" },
        modelTurn: {
          parts: [{ inlineData: { mimeType: "audio/pcm;rate=24000", data: "AAAAAA==" } }],
        },
      },
    });
    await h.socket.receive({
      toolCall: { functionCalls: [{ id: "done", name: "complete_teaching_beat", args: {} }] },
    });
    await h.socket.receive({ serverContent: { turnComplete: true } });
    expect(h.events.filter((event) => event.type === "turn_ended")).toHaveLength(1);
  });
  it("keeps buffered teacher audio playing when a late board note arrives", async () => {
    const h = await setup({ onTool: () => ({ ok: true }) });
    h.s.send("Explain");
    await h.socket.receive({
      serverContent: {
        modelTurn: {
          parts: [{ inlineData: { mimeType: "audio/pcm;rate=24000", data: "AAAAAA==" } }],
        },
        turnComplete: true,
      },
    });
    await h.socket.receive({
      toolCall: { functionCalls: [{ id: "board-late", name: "write_classroom_board", args: {} }] },
    });
    expect(h.contexts[0].sources[0].stop).not.toHaveBeenCalled();
    expect(h.s.speaking.value).toBe(true);
  });
  it("stops old buffered speech when the student speaks after server generation ended", async () => {
    const h = await setup();
    h.s.send("Explain");
    await h.socket.receive({
      serverContent: {
        modelTurn: {
          parts: [{ inlineData: { mimeType: "audio/pcm;rate=24000", data: "AAAAAA==" } }],
        },
        turnComplete: true,
      },
    });
    expect(h.s.speaking.value).toBe(true);
    expect(h.events.some((event) => event.type === "audio_started")).toBe(true);
    await h.socket.receive({ serverContent: { inputTranscription: { text: "等一下" } } });
    expect(h.contexts[0].sources[0].stop).toHaveBeenCalled();
    expect(h.s.speaking.value).toBe(false);
  });
  it("treats a tool-only voice-control turn as busy until its boundary", async () => {
    const h = await setup({ onTool: () => ({ ok: true }) });
    await h.socket.receive({
      toolCall: { functionCalls: [{ id: "control", name: "request_classroom_control", args: {} }] },
    });
    h.s.send("Continue after skipped practice");
    expect(h.socket.sent.at(-1).clientContent.turns[0].parts[0].text).toContain(
      "Stop the current turn",
    );
    await h.socket.receive({ serverContent: { interrupted: true, turnComplete: true } });
    expect(h.socket.sent.at(-1).clientContent.turns[0].parts[0].text).toBe(
      "Continue after skipped practice",
    );
  });
  it("drops microphone PCM during playback and its echo tail, then resumes student input", async () => {
    vi.useFakeTimers();
    const h = await setup();
    await h.s.startMic();
    const mic = h.contexts[1];
    const capture = () =>
      mic.processor.onaudioprocess({
        inputBuffer: { getChannelData: () => new Float32Array(2048).fill(0.1) },
      });
    const uploaded = () => h.socket.sent.filter((item) => item.realtimeInput?.audio).length;
    mic.currentTime = 1;
    capture();
    expect(uploaded()).toBe(1);
    h.s.send("Teach");
    await h.socket.receive({
      serverContent: {
        modelTurn: {
          parts: [{ inlineData: { mimeType: "audio/pcm;rate=24000", data: "AAAAAA==" } }],
        },
      },
    });
    expect(h.s.speaking.value).toBe(true);
    capture();
    expect(uploaded()).toBe(1);
    await h.socket.receive({ serverContent: { turnComplete: true } });
    capture();
    expect(uploaded()).toBe(1); // Generation ended, but local audio is still playing.
    mic.currentTime = 1.1;
    h.contexts[0].sources[0].onended();
    await vi.advanceTimersByTimeAsync(499);
    mic.currentTime = 1.599;
    capture();
    expect(uploaded()).toBe(1);
    await vi.advanceTimersByTimeAsync(101);
    mic.currentTime = 1.7;
    capture();
    expect(uploaded()).toBe(2);
    expect(h.socket.sent.at(-1).realtimeInput.audio.mimeType).toBe("audio/pcm;rate=16000");
    await h.s.disconnect();
    expect(h.stop).toHaveBeenCalled();
  });
  it("rejects delayed worklet blocks captured during playback, including after explicit stop", async () => {
    vi.useFakeTimers();
    const nodes = [];
    vi.stubGlobal(
      "AudioWorkletNode",
      class {
        port = {};
        connect() {}
        disconnect() {}
        constructor() {
          nodes.push(this);
        }
      },
    );
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:classroom-test");
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    const h = await setup({
      AudioContextImpl: class extends Audio {
        audioWorklet = { addModule: async () => {} };
      },
    });
    await h.s.startMic();
    await h.socket.receive({
      serverContent: {
        modelTurn: {
          parts: [{ inlineData: { mimeType: "audio/pcm;rate=24000", data: "AAAAAA==" } }],
        },
      },
    });
    h.s.stopAudio();
    await vi.advanceTimersByTimeAsync(600);
    const capture = (endTime) =>
      nodes[0].port.onmessage({
        data: {
          samples: new Float32Array(1024).fill(0.1),
          endTime,
        },
      });
    capture(0.1);
    expect(h.socket.sent.filter((item) => item.realtimeInput?.audio)).toHaveLength(0);
    capture(0.7);
    expect(h.socket.sent.filter((item) => item.realtimeInput?.audio)).toHaveLength(1);
  });
  it("times out suspended audio initialization instead of leaving start stuck", async () => {
    vi.useFakeTimers();
    let audio;
    const sockets = Socket.instances.length;
    const s = useClassroomLive({
      WebSocketImpl: Socket,
      AudioContextImpl: class extends Audio {
        constructor() {
          super();
          audio = this;
        }
        resume = () => new Promise(() => {});
      },
    });
    sessions.push(s);
    const result = expect(s.connect({ api_key: "test" }, "Teacher")).rejects.toThrow(
      "声音初始化超时",
    );
    await flush();
    await vi.advanceTimersByTimeAsync(10000);
    await result;
    expect(audio.state).toBe("closed");
    expect(s.status.value).toBe("closed");
    expect(Socket.instances).toHaveLength(sockets);
  });
  it("drops canceled audio and tools until the interrupted turn boundary", async () => {
    const onTool = vi.fn(() => ({ ok: true }));
    const h = await setup({ onTool });
    h.s.send("Old lesson");
    h.s.send("Skip to new instruction");
    await h.socket.receive({
      toolCall: { functionCalls: [{ id: "stale", name: "complete_teaching_beat" }] },
    });
    expect(onTool).not.toHaveBeenCalled();
    await h.socket.receive({ serverContent: { interrupted: true, turnComplete: true } });
    expect(h.socket.sent.at(-1).clientContent.turns[0].parts[0].text).toBe(
      "Skip to new instruction",
    );
    expect(h.events.some((e) => e.type === "turn_ended" && !e.cancelled)).toBe(false);
    await h.socket.receive({
      serverContent: { outputTranscription: { text: "New explanation" }, turnComplete: true },
    });
    expect(h.events.at(-1)).toMatchObject({ type: "turn_ended", cancelled: false });
  });
  it("ignores an empty completion after a SILENT tool acknowledgement", async () => {
    const h = await setup({ onTool: () => ({ ok: true }) });
    h.s.send("Ask one question");
    await h.socket.receive({
      toolCall: { functionCalls: [{ id: "invite", name: "begin_interaction", args: {} }] },
    });
    await h.socket.receive({ serverContent: { turnComplete: true } });
    await h.socket.receive({ serverContent: { turnComplete: true } });
    expect(h.events.filter((e) => e.type === "turn_ended")).toHaveLength(1);
  });
  it("keeps microphone denial separate from a working text connection", async () => {
    const h = await setup({
      navigatorImpl: {
        mediaDevices: {
          getUserMedia: async () => {
            throw new Error("denied");
          },
        },
      },
    });
    await h.s.startMic();
    expect(h.s.connected.value).toBe(true);
    expect(h.s.micError.value).not.toBe("");
    expect(h.s.send("Text question")).toBe(true);
  });
  it("uses the constrained endpoint for short-lived credentials", async () => {
    const h = await setup();
    await h.s.connect({ api_key: "auth_tokens/temporary" }, "Teacher");
    expect(Socket.instances.at(-1).url).toContain(
      "BidiGenerateContentConstrained?access_token=auth_tokens%2Ftemporary",
    );
  });
});
