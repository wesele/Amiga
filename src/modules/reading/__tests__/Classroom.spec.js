import { describe, it, expect, vi, afterEach } from "vitest";
import { ref } from "vue";
import {
  chapterContext,
  normalizePlan,
  freshSession,
  validateSession,
  teacherInstruction,
} from "../classroom/teachingPlan.js";
import { useClassroom } from "../classroom/useClassroom.js";

const context = {
  title: "Test",
  native_language: "zh",
  target_language: "es",
  cefr_level: "A2",
  paragraphs: [{ para_idx: 2, start: 3, end: 5, text: "Me viene bien mañana." }],
};
const raw = {
  goals: ["Use venir bien"],
  nodes: [
    {
      title: "表达",
      objective: "Understand",
      focus_expression: "viene bien",
      source_quote: "Me viene bien mañana.",
      key_points: ["venir bien 表示时间合适"],
      examples: [{ text: "Me viene bien el lunes.", meaning: "星期一对我合适。" }],
      para_idx: 2,
      beats: [
        { objective: "Meaning", board_text: "viene bien = 合适" },
        { objective: "Usage", board_text: "Me viene bien el lunes." },
      ],
      practice: {
        kind: "rephrase",
        objective: "Ask when",
        scaffold: "Me viene bien… + 时间",
        answer_example: "Me viene bien el lunes.",
      },
    },
    {
      title: "mañana",
      objective: "说明时间并回顾表达",
      focus_expression: "mañana",
      source_quote: "Me viene bien mañana.",
      key_points: ["mañana 表示明天"],
      examples: [{ text: "Hasta mañana.", meaning: "明天见。" }],
      para_idx: 2,
      beats: [{ objective: "Recap", board_text: "mañana = 明天" }],
    },
  ],
};
function harness(savedSession) {
  let callbacks;
  const live = {
    connected: ref(false),
    speaking: ref(false),
    error: ref(""),
    micError: ref(""),
    send: vi.fn(),
    silence: vi.fn(),
    stopAudio: vi.fn(),
    startMic: vi.fn(),
    stopMic: vi.fn(),
    clearResumption: vi.fn(),
    connect: vi.fn(async () => {
      live.connected.value = true;
      callbacks.onEvent({ type: "ready" });
    }),
    disconnect: vi.fn(async () => {
      live.connected.value = false;
    }),
  };
  const plan = normalizePlan(raw, context, "v1");
  const saveSession = vi.fn(async (value) => ({ ...value, revision: value.revision + 1 }));
  const room = useClassroom({
    plan,
    savedSession,
    saveSession,
    getConfig: async () => ({ api_key: "fake" }),
    liveFactory: (options) => {
      callbacks = options;
      return live;
    },
  });
  const current = () =>
    JSON.parse(live.send.mock.calls.at(-1)[0].split("Current classroom state: ")[1]);
  const call = (name, args = {}) =>
    callbacks.onTool(name, { control_epoch: current().control_epoch, ...args });
  const end = () => callbacks.onEvent({ type: "turn_ended", cancelled: false });
  const complete = () => {
    const p = current();
    call("complete_teaching_beat", { node_id: p.node_id, beat_id: p.beat_id });
    end();
  };
  return {
    room,
    live,
    callbacks: () => callbacks,
    plan,
    current,
    call,
    end,
    complete,
    saveSession,
  };
}
const rooms = [];
afterEach(async () => {
  for (const room of rooms.splice(0)) await room.close();
  vi.useRealTimers();
});
describe("AI teacher classroom", () => {
  it("starts teaching without opening the microphone", async () => {
    const h = harness();
    rooms.push(h.room);
    await h.room.start();
    expect(h.room.connecting.value).toBe(false);
    expect(h.room.phase.value).toBe("teaching");
    expect(h.live.send).toHaveBeenCalled();
    expect(h.live.startMic).not.toHaveBeenCalled();
  });
  it("pauses with a retry message if the teacher never responds, keeping progress intact", async () => {
    vi.useFakeTimers();
    const h = harness();
    rooms.push(h.room);
    await h.room.start();
    await vi.advanceTimersByTimeAsync(20000);
    expect(h.room.phase.value).toBe("paused");
    expect(h.room.notice.value).toContain("暂未回应");
    expect(h.room.session.value.completed_beats).toEqual([]);
    expect(h.live.disconnect).toHaveBeenCalled();
    h.room.resume();
    await Promise.resolve();
    await Promise.resolve();
    expect(h.room.phase.value).toBe("teaching");
    expect(h.room.session.value.beat_index).toBe(0);
  });
  it("clears the response watchdog when audible teaching begins", async () => {
    vi.useFakeTimers();
    const h = harness();
    rooms.push(h.room);
    await h.room.start();
    h.callbacks().onEvent({ type: "audio_started" });
    await vi.advanceTimersByTimeAsync(25000);
    expect(h.room.phase.value).toBe("teaching");
    expect(h.live.disconnect).not.toHaveBeenCalled();
  });
  it("starts with a blank board, then reveals only spoken teaching notes", async () => {
    const h = harness();
    rooms.push(h.room);
    expect(h.room.board.value.items).toEqual([]);
    await h.room.start();
    const ids = h.current();
    expect(
      h.call("write_classroom_board", { ...ids, kind: "explanation", text: "表示时间合适" }),
    ).toEqual({ ok: true });
    expect(h.room.board.value.items).toEqual([]);
    h.callbacks().onEvent({ type: "audio_started" });
    expect(h.room.board.value.items.map((item) => item.kind)).toEqual([
      "source",
      "expression",
      "explanation",
    ]);
    expect(h.room.board.value.items.some((item) => item.kind === "example")).toBe(false);
    h.call("write_classroom_board", { ...ids, kind: "source", text: "Invented quotation" });
    expect(h.room.board.value.items[0].text).toBe(context.paragraphs[0].text);
    h.call("write_classroom_board", { ...ids, kind: "example", text: "Me viene bien el lunes." });
    expect(h.room.board.value.items.at(-1).text).toBe("Me viene bien el lunes.");
    h.complete();
    expect(h.room.board.value.items).toHaveLength(4);
    const old = h.current();
    h.room.pause();
    expect(
      h.callbacks().onTool("write_classroom_board", { ...old, kind: "explanation", text: "Late" })
        .ok,
    ).toBe(false);
    expect(h.room.board.value.items).toHaveLength(4);
    h.room.resume();
    h.complete();
    h.call("begin_interaction", { interaction_id: h.current().interaction_id });
    h.end();
    h.room.skipInteraction();
    expect(h.room.board.value.node_id).toBe("node-2");
    expect(h.room.board.value.items).toEqual([]);
  });
  it("discards queued board notes on interruption rather than showing unheard content", async () => {
    const h = harness();
    rooms.push(h.room);
    await h.room.start();
    h.call("write_classroom_board", { ...h.current(), kind: "example", text: "Not yet heard" });
    h.callbacks().onEvent({ type: "interrupted" });
    h.call("report_student_question");
    h.callbacks().onEvent({ type: "audio_started" });
    expect(h.room.board.value.items.some((item) => item.text === "Not yet heard")).toBe(false);
  });
  it("changes teaching language with the cursor intact and reconnects without old-language context", async () => {
    const h = harness();
    rooms.push(h.room);
    await h.room.start();
    h.complete();
    const before = h.room.session.value.completed_beats.slice();
    await h.room.setTeachingLanguage("target");
    expect(h.room.phase.value).toBe("paused");
    expect(h.room.session.value.teaching_language).toBe("target");
    expect(h.room.session.value.beat_index).toBe(1);
    expect(h.room.session.value.completed_beats).toEqual(before);
    expect(h.room.board.value.items).toEqual([]);
    expect(h.live.clearResumption).toHaveBeenCalled();
    expect(h.live.disconnect).toHaveBeenCalled();
    await h.room.start();
    expect(h.live.connect.mock.calls.at(-1)[1]).toContain("Teaching language: es");
    expect(h.live.connect.mock.calls.at(-1)[1]).toContain("CEFR A2");
    expect(h.current()).toMatchObject({
      teaching_language: "target",
      teaching_language_code: "es",
      cefr_level: "A2",
    });
    const saved = JSON.parse(JSON.stringify(h.room.session.value));
    const reopened = harness(saved);
    rooms.push(reopened.room);
    expect(reopened.room.session.value.teaching_language).toBe("target");
    expect(reopened.live.connect).not.toHaveBeenCalled();
    await expect(h.room.setTeachingLanguage("invalid")).resolves.toBeUndefined();
    expect(h.room.session.value.teaching_language).toBe("target");
  });
  it.each(["A0", "A1", "A2", "B1", "B2", "C1"])(
    "constrains target-language teaching and board notes to %s",
    (level) => {
      const plan = { ...normalizePlan(raw, context), cefr_level: level };
      const instruction = teacherInstruction(plan, "target");
      expect(instruction).toContain(`at CEFR ${level}`);
      expect(instruction).toContain("board notes must be in es");
      expect(instruction).toContain("never copy them verbatim");
      expect(teacherInstruction(plan)).toContain(
        "Explain, ask questions, give feedback and write board notes in zh",
      );
      expect(() =>
        validateSession({ ...freshSession(plan), teaching_language: "invalid" }, plan),
      ).toThrow(/语言/);
    },
  );
  it("restores the last board without automatically speaking, preserving language when reviewing", async () => {
    const plan = normalizePlan(raw, context);
    const saved = {
      ...freshSession(plan),
      phase: "completed",
      teaching_language: "target",
      board: {
        node_id: "node-1",
        language_mode: "target",
        items: [{ kind: "explanation", text: "Es un buen momento." }],
      },
    };
    const h = harness(saved);
    rooms.push(h.room);
    expect(h.room.board.value.items[0].text).toBe("Es un buen momento.");
    expect(h.live.connect).not.toHaveBeenCalled();
    await h.room.start();
    expect(h.room.session.value.teaching_language).toBe("target");
    expect(h.room.board.value.items).toEqual([]);
  });
  it("orders teaching nodes by source position without changing the raw model response", () => {
    const generated = structuredClone(raw);
    generated.nodes[0].para_idx = 3;
    const source = {
      ...context,
      paragraphs: [...context.paragraphs, { ...context.paragraphs[0], para_idx: 3 }],
    };
    const plan = normalizePlan(generated, source);
    expect(plan.nodes.map((node) => node.source.para_idx)).toEqual([2, 3]);
    expect(plan.nodes.map((node) => node.id)).toEqual(["node-1", "node-2"]);
    expect(generated.nodes[0].para_idx).toBe(3);
  });
  it("rejects a whole long paragraph even when the quotation is accurate", () => {
    const generated = structuredClone(raw);
    const paragraph = "Me viene bien mañana. ".repeat(15);
    generated.nodes[0].source_quote = paragraph;
    expect(() =>
      normalizePlan(generated, {
        ...context,
        paragraphs: [{ ...context.paragraphs[0], text: paragraph }],
      }),
    ).toThrow(/原句/);
  });
  it("cleans subtitles and keeps a short verified quote with the full paragraph audio range", () => {
    const source = chapterContext(
      {
        target_language: "es",
        subtitles_json: JSON.stringify([
          { start: 3, end: 20, text: "Hola.&nbsp; Me viene bien ma&#241;ana. &#xBF;Y a ti?" },
        ]),
      },
      { title: "Test", start_para_idx: 0, end_para_idx: 0 },
    );
    const generated = structuredClone(raw);
    generated.nodes.forEach((node) => {
      node.para_idx = 0;
    });
    const plan = normalizePlan(generated, source, "v2");
    expect(plan.schema_version).toBe(2);
    expect(plan.nodes[0].source).toEqual({
      para_idx: 0,
      text: "Me viene bien mañana.",
      paragraph_text: "Hola. Me viene bien mañana. ¿Y a ti?",
      start_sec: 3,
      end_sec: 20,
    });
    expect(plan.nodes[0].examples[0].meaning).toBe("星期一对我合适。");
    expect(plan.nodes[0].practice.scaffold).toContain("Me viene bien");
  });
  it.each([
    [
      "invented quotation",
      (r) => {
        r.nodes[0].source_quote = "Me viene bien hoy.";
      },
    ],
    [
      "expression outside quote",
      (r) => {
        r.nodes[0].focus_expression = "hay que";
      },
    ],
    [
      "duplicate expression",
      (r) => {
        r.nodes[1].focus_expression = r.nodes[0].focus_expression;
      },
    ],
    [
      "missing usage",
      (r) => {
        r.nodes[0].key_points = [];
      },
    ],
    [
      "missing example meaning",
      (r) => {
        delete r.nodes[0].examples[0].meaning;
      },
    ],
    [
      "unsupported practice",
      (r) => {
        delete r.nodes[0].practice.scaffold;
      },
    ],
    [
      "missing board",
      (r) => {
        delete r.nodes[0].beats[0].board_text;
      },
    ],
    [
      "missing goals",
      (r) => {
        r.goals = [];
      },
    ],
    [
      "no practice",
      (r) => {
        r.nodes[0].practice = null;
      },
    ],
  ])("rejects low-quality generated plans: %s", (_, mutate) => {
    const generated = structuredClone(raw);
    mutate(generated);
    expect(() => normalizePlan(generated, context)).toThrow();
  });
  it("switches to listen-only during speech without racing a pause and resume", async () => {
    const h = harness();
    rooms.push(h.room);
    await h.room.start();
    const sends = h.live.send.mock.calls.length;
    h.room.setInteractionMode("listen_only");
    expect(h.live.send).toHaveBeenCalledTimes(sends);
    expect(h.live.silence).not.toHaveBeenCalled();
    h.complete();
    h.complete();
    expect(h.room.session.value.node_index).toBe(1);
  });
  it("pins source quotations to the transcript and rejects a foreign reference", () => {
    const plan = normalizePlan(raw, context, "v1");
    expect(plan.nodes[0].source.text).toBe(context.paragraphs[0].text);
    const invalid = structuredClone(raw);
    invalid.nodes[0].para_idx = 999;
    expect(() => normalizePlan(invalid, context)).toThrow(/原文/);
    expect(() => validateSession({ ...freshSession(plan), beat_index: 9 }, plan)).toThrow();
    expect(() =>
      validateSession({ ...freshSession(plan), turns: [{ text: "字".repeat(90000) }] }, plan),
    ).toThrow(/过长/);
  });
  it("keeps listen-only preference when reviewing a completed lesson", async () => {
    const plan = normalizePlan(raw, context, "v1");
    const saved = { ...freshSession(plan), phase: "completed", interaction_mode: "listen_only" };
    const h = harness(saved);
    rooms.push(h.room);
    await h.room.start();
    expect(h.room.session.value.interaction_mode).toBe("listen_only");
  });
  it("does not advance until the teaching audio actually ends", async () => {
    const h = harness();
    rooms.push(h.room);
    await h.room.start();
    h.live.speaking.value = true;
    h.complete();
    expect(h.room.session.value.completed_beats).toHaveLength(0);
    h.live.speaking.value = false;
    h.callbacks().onEvent({ type: "audio_drained" });
    expect(h.room.session.value.completed_beats).toEqual(["node-1/beat-1"]);
    expect(h.room.session.value.beat_index).toBe(1);
  });
  it("waits for an optional answer, records feedback, then continues", async () => {
    vi.useFakeTimers();
    const h = harness();
    rooms.push(h.room);
    await h.room.start();
    h.complete();
    h.complete();
    h.call("begin_interaction", { interaction_id: h.current().interaction_id });
    h.end();
    expect(h.room.phase.value).toBe("awaiting_answer");
    h.end();
    expect(h.room.phase.value).toBe("awaiting_answer");
    const count = h.live.send.mock.calls.length;
    await vi.advanceTimersByTimeAsync(30000);
    expect(h.live.send).toHaveBeenCalledTimes(count);
    h.callbacks().onEvent({ type: "student_text", text: "¿Te viene bien mañana?" });
    h.call("finish_interaction", {
      interaction_id: h.current().interaction_id,
      feedback: "Correct",
    });
    h.end();
    expect(h.room.session.value.interactions["node-1"].status).toBe("answered");
    expect(h.room.session.value.node_index).toBe(1);
    h.complete();
    expect(h.room.phase.value).toBe("completed");
  });
  it("keeps Q&A off the teaching cursor and resumes only explicitly", async () => {
    const h = harness();
    rooms.push(h.room);
    await h.room.start();
    h.callbacks().onEvent({ type: "interrupted" });
    h.callbacks().onEvent({ type: "student_text", text: "为什么用 viene？" });
    h.call("report_student_question");
    h.end();
    expect(h.room.phase.value).toBe("awaiting_continue");
    expect(h.room.session.value.completed_beats).toEqual([]);
    const sends = h.live.send.mock.calls.length;
    await h.room.persist();
    expect(h.live.send).toHaveBeenCalledTimes(sends);
    h.room.resume();
    expect(h.room.session.value.beat_index).toBe(0);
    expect(h.live.send).toHaveBeenCalledTimes(sends + 1);
  });
  it("rejects stale completion after pause, and stale feedback after skip", async () => {
    const h = harness();
    rooms.push(h.room);
    await h.room.start();
    const stale = h.current();
    h.room.pause();
    expect(h.callbacks().onTool("complete_teaching_beat", { ...stale })).toMatchObject({
      ok: false,
    });
    h.room.resume();
    h.complete();
    h.complete();
    const invited = h.current();
    h.room.skipInteraction();
    expect(h.room.session.value.interactions["node-1"].status).toBe("skipped");
    expect(h.callbacks().onTool("finish_interaction", { ...invited })).toMatchObject({ ok: false });
    expect(h.room.session.value.node_index).toBe(1);
  });
  it("listen-only skips invitations but preserves spontaneous questions", async () => {
    const h = harness();
    rooms.push(h.room);
    h.room.setInteractionMode("listen_only");
    await h.room.start();
    h.complete();
    h.complete();
    expect(h.room.session.value.node_index).toBe(1);
    h.callbacks().onEvent({ type: "interrupted" });
    h.call("report_student_question");
    h.end();
    expect(h.room.phase.value).toBe("awaiting_continue");
  });
  it("serializes revisions and restores a saved classroom without auto-playing", async () => {
    const h = harness();
    rooms.push(h.room);
    await h.room.start();
    h.complete();
    await h.room.persist();
    await h.room.persist();
    const snapshots = h.saveSession.mock.calls.map(([s]) => s.revision);
    expect(snapshots).toEqual([...snapshots].sort((a, b) => a - b));
    const saved = JSON.parse(JSON.stringify(h.room.session.value));
    const reopened = harness(saved);
    rooms.push(reopened.room);
    expect(reopened.room.session.value.beat_index).toBe(1);
    expect(reopened.live.connect).not.toHaveBeenCalled();
    expect(reopened.room.phase.value).toBe("ready");
  });
});
