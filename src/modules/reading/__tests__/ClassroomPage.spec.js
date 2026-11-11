import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import ClassroomPage from "../ClassroomPage.vue";
import {
  getChapterClassroom,
  generateChapterTeachingPlan,
  getImportedArticleChapters,
  saveChapterClassroom,
  getClassroomLiveConfig,
} from "@/shared/api.js";

const transport = vi.hoisted(() => ({ live: null, onEvent: null, onTool: null, push: vi.fn() }));

vi.mock("vue-router", () => ({
  useRouter: () => ({ push: transport.push }),
  onBeforeRouteLeave: vi.fn(),
}));
vi.mock("@/shared/inPageBack.js", () => ({ pushInPageBackHandler: () => () => {} }));
vi.mock("@/shared/api.js", () => ({
  getChapterClassroom: vi.fn(),
  generateChapterTeachingPlan: vi.fn(),
  saveChapterClassroom: vi.fn(),
  getClassroomLiveConfig: vi.fn(),
  getImportedArticleChapters: vi.fn(),
}));
vi.mock("../classroom/useClassroomLive.js", async () => {
  const { ref } = await import("vue");
  return {
    useClassroomLive: ({ onEvent, onTool }) => {
      const live = {
        connected: ref(false),
        speaking: ref(false),
        error: ref(""),
        micError: ref(""),
        micEnabled: ref(false),
        send: vi.fn(),
        silence: vi.fn(),
        stopAudio: vi.fn(),
        startMic: vi.fn(),
        stopMic: vi.fn(),
        clearResumption: vi.fn(),
        disconnect: vi.fn(async () => {}),
        connect: vi.fn(async () => {
          live.connected.value = true;
          onEvent({ type: "ready" });
        }),
      };
      transport.live = live;
      transport.onEvent = onEvent;
      transport.onTool = onTool;
      return live;
    },
  };
});

const plan = {
  version: "v1",
  native_language: "zh",
  target_language: "es",
  cefr_level: "A2",
  goals: ["学会表达需要做某事"],
  nodes: [
    {
      id: "node-1",
      title: "表达需要",
      focus_expression: "tienes que",
      source: { text: "tienes que desarrollar cada habilidad", start_sec: 10, end_sec: 20 },
      key_points: ["不要在开课前显示全部解释"],
      beats: [
        { id: "beat-1", objective: "理解 tienes que 的含义", board_text: "不要提前显示板书" },
      ],
    },
  ],
};
let wrapper;
beforeEach(() => {
  vi.clearAllMocks();
  getChapterClassroom.mockResolvedValue({
    chapter: { id: 1, article_id: 2, chapter_index: 0, title: "第 1 章" },
    article: { id: 2 },
    plan,
    session: null,
  });
  getImportedArticleChapters.mockResolvedValue([]);
  getClassroomLiveConfig.mockResolvedValue({ api_key: "test" });
  saveChapterClassroom.mockImplementation(async (_id, session) => ({
    ...session,
    revision: session.revision + 1,
  }));
});
afterEach(async () => {
  wrapper?.unmount();
  await flushPromises();
});
describe("Classroom page presentation", () => {
  it("places beat navigation outside the microphone and text controls and updates the cursor", async () => {
    const result = await getChapterClassroom();
    const node = plan.nodes[0];
    getChapterClassroom.mockResolvedValue({
      ...result,
      plan: {
        ...plan,
        nodes: [
          {
            ...node,
            beats: [
              ...node.beats,
              { ...node.beats[0], id: "beat-2", objective: "用 tienes que 造句" },
            ],
          },
        ],
      },
    });
    wrapper = mount(ClassroomPage, { props: { id: 2, chapterId: 1 } });
    await flushPromises();
    const actions = wrapper.findAll(".classroom-actions button");
    expect(actions.map((button) => button.attributes("aria-label"))).toEqual([
      "上一小段",
      "开启麦克风",
      undefined,
      "文字提问",
      "下一小段",
    ]);
    const [previous, , , , next] = actions;
    const marks = () =>
      wrapper.findAll(".board-ledge-mark").map((mark) => mark.classes("is-current"));
    expect(previous.element.disabled).toBe(true);
    expect(wrapper.get(".classroom-beat-position").text()).toBe("小段 1 / 2");
    expect(wrapper.get(".board-topic").text()).toBe("理解 tienes que 的含义");
    expect(marks()).toEqual([true, false]);
    await next.trigger("click");
    await flushPromises();
    expect(wrapper.get(".classroom-beat-position").text()).toBe("小段 2 / 2");
    expect(wrapper.get(".board-topic").text()).toBe("用 tienes que 造句");
    expect(marks()).toEqual([false, true]);
    expect(next.element.disabled).toBe(true);
    expect(wrapper.get(".classroom-primary").text()).toBe("继续上课");
    expect(saveChapterClassroom.mock.lastCall[1]).toMatchObject({
      beat_index: 1,
      completed_beats: [],
    });
    await previous.trigger("click");
    await flushPromises();
    expect(wrapper.get(".classroom-beat-position").text()).toBe("小段 1 / 2");
    expect(wrapper.get(".board-topic").text()).toBe("理解 tienes que 的含义");
    expect(marks()).toEqual([true, false]);

    await wrapper.get(".classroom-primary").trigger("click");
    await flushPromises();
    const { control_epoch, node_id, beat_id } = JSON.parse(
      transport.live.send.mock.lastCall[0].split("Current classroom state: ")[1],
    );
    expect(transport.onTool("complete_teaching_beat", { control_epoch, node_id, beat_id }).ok).toBe(
      true,
    );
    transport.onEvent({ type: "turn_ended" });
    await flushPromises();
    expect(marks()).toEqual([false, true]);
    expect(wrapper.get(".board-topic").text()).toBe("用 tienes que 造句");
  });
  it("shows connection progress from the real start action, then teaches without auto capture", async () => {
    let resolve;
    getClassroomLiveConfig.mockReturnValue(
      new Promise((done) => {
        resolve = done;
      }),
    );
    wrapper = mount(ClassroomPage, { props: { id: 2, chapterId: 1 } });
    await flushPromises();
    await wrapper.find(".classroom-primary").trigger("click");
    expect(wrapper.find(".classroom-primary").text()).toBe("正在连接…");
    expect(wrapper.find(".classroom-primary").element.disabled).toBe(true);
    resolve({ api_key: "test" });
    await flushPromises();
    expect(transport.live.connect).toHaveBeenCalled();
    expect(transport.live.send).toHaveBeenCalled();
    expect(transport.live.startMic).not.toHaveBeenCalled();
    expect(wrapper.find(".classroom-primary").text()).toBe("暂停");
    expect(wrapper.find(".teacher-caption").text()).toBe("老师正在准备讲解…");
    transport.live.speaking.value = true;
    transport.onEvent({ type: "audio_started" });
    await flushPromises();
    expect(wrapper.find(".teaching-board").text()).toContain("tienes que");
    await wrapper.find('button[aria-label="开启麦克风"]').trigger("click");
    expect(transport.live.silence).toHaveBeenCalled();
    expect(transport.live.startMic).toHaveBeenCalledOnce();
    expect(wrapper.find(".classroom-primary").text()).toBe("继续上课");
  });
  it("keeps the central board empty and persists the selected CEFR-aware teaching language", async () => {
    wrapper = mount(ClassroomPage, { props: { id: 2, chapterId: 1 } });
    await flushPromises();
    expect(wrapper.find(".teaching-board").text()).toBe("");
    expect(wrapper.text()).not.toContain("不要在开课前显示全部解释");
    expect(wrapper.text()).not.toContain("不要提前显示板书");
    expect(wrapper.find("select").exists()).toBe(false);
    expect(wrapper.find(".classroom-composer").exists()).toBe(false);
    expect(wrapper.text()).not.toContain("配置 Gemini Live");
    await wrapper.find('button[aria-label="课堂"]').trigger("click");
    await flushPromises();
    expect(wrapper.find('[role="dialog"]').exists()).toBe(true);
    expect(wrapper.find(".classroom-main").attributes("inert")).toBeDefined();
    expect(wrapper.find("select").element.value).toBe("native");
    await wrapper.find("select").setValue("target");
    await flushPromises();
    expect(wrapper.find(".classroom-level").text()).toBe("A2");
    expect(wrapper.find(".classroom-language-hint").text()).toContain("适合 A2");
    expect(saveChapterClassroom.mock.calls.at(-1)[1].teaching_language).toBe("target");
    await wrapper.find('button[aria-label="关闭"]').trigger("click");
    await flushPromises();
    expect(wrapper.find('[role="dialog"]').exists()).toBe(false);
  });
  it("opens completed lessons with a blank legacy board and a collapsed summary", async () => {
    const result = await getChapterClassroom();
    getChapterClassroom.mockResolvedValue({
      ...result,
      session: {
        plan_version: "v1",
        node_index: 0,
        beat_index: 0,
        interaction_mode: "guided",
        phase: "completed",
        completed_beats: ["node-1/beat-1"],
        interactions: {},
        turns: [],
        summary: "本节小结",
        revision: 0,
      },
    });
    wrapper = mount(ClassroomPage, { props: { id: 2, chapterId: 1 } });
    await flushPromises();
    expect(wrapper.find(".teaching-board").text()).toBe("");
    expect(wrapper.find(".classroom-summary").exists()).toBe(false);
    expect(wrapper.find(".classroom-primary").text()).toBe("复习本节");
    await wrapper.find('button[aria-label="课堂"]').trigger("click");
    await wrapper.findAll('[role="tab"]')[0].trigger("click");
    expect(wrapper.find(".classroom-summary").text()).toContain("本节小结");
  });
  it("moves between article chapters and restores the selected chapter's progress", async () => {
    const result = await getChapterClassroom();
    const second = { ...result.chapter, id: 3, chapter_index: 1, title: "第 2 章" };
    getImportedArticleChapters.mockResolvedValue([result.chapter, second]);
    getChapterClassroom.mockImplementation(async (id) =>
      id === second.id
        ? {
            ...result,
            chapter: second,
            session: {
              plan_version: plan.version,
              node_index: 0,
              beat_index: 0,
              interaction_mode: "guided",
              phase: "paused",
              completed_beats: [],
              interactions: {},
              revision: 1,
              turns: [{ role: "teacher", text: "上次的课堂记录" }],
            },
          }
        : result,
    );
    wrapper = mount(ClassroomPage, { props: { id: 2, chapterId: 1 } });
    await flushPromises();
    const [previous, next] = wrapper.findAll(".classroom-chapters button");
    expect(previous.element.disabled).toBe(true);
    expect(wrapper.find(".classroom-chapters span").text()).toBe("1 / 2");
    await next.trigger("click");
    expect(transport.push).toHaveBeenLastCalledWith({
      name: "reading-classroom",
      params: { id: 2, chapterId: 3 },
    });
    const firstRoomLive = transport.live;
    await wrapper.setProps({ chapterId: 3 });
    await flushPromises();
    expect(firstRoomLive.disconnect).toHaveBeenCalledOnce();
    expect(saveChapterClassroom).not.toHaveBeenCalled();
    expect(wrapper.find("h1").text()).toBe("第 2 章");
    expect(wrapper.find(".classroom-primary").text()).toBe("继续上课");
    expect(wrapper.find(".teacher-caption").text()).toBe("上次的课堂记录");
    expect(next.element.disabled).toBe(true);
    await previous.trigger("click");
    expect(transport.push).toHaveBeenLastCalledWith({
      name: "reading-classroom",
      params: { id: 2, chapterId: 1 },
    });
  });
  it("confirms regeneration, keeps the existing lesson on failure, and resets on success", async () => {
    const result = await getChapterClassroom();
    getChapterClassroom.mockResolvedValue({
      ...result,
      session: {
        plan_version: plan.version,
        node_index: 0,
        beat_index: 0,
        interaction_mode: "guided",
        phase: "completed",
        completed_beats: ["node-1/beat-1"],
        interactions: {},
        turns: [],
        revision: 1,
      },
    });
    generateChapterTeachingPlan.mockRejectedValueOnce(new Error("生成超时"));
    let finish;
    generateChapterTeachingPlan.mockReturnValueOnce(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    wrapper = mount(ClassroomPage, { props: { id: 2, chapterId: 1 } });
    await flushPromises();
    async function requestRegeneration() {
      await wrapper.get('button[aria-label="课堂"]').trigger("click");
      await wrapper.get(".classroom-regenerate button").trigger("click");
      return wrapper.findAll(".classroom-regenerate button");
    }
    const [cancel] = await requestRegeneration();
    expect(generateChapterTeachingPlan).not.toHaveBeenCalled();
    await cancel.trigger("click");
    await wrapper.get(".classroom-regenerate button").trigger("click");
    await wrapper.findAll(".classroom-regenerate button")[1].trigger("click");
    await flushPromises();
    expect(wrapper.get('[role="alert"]').text()).toContain("生成超时");
    expect(wrapper.get(".classroom-primary").text()).toBe("复习本节");
    const [, confirm] = await requestRegeneration();
    await confirm.trigger("click");
    await flushPromises();
    expect(generateChapterTeachingPlan).toHaveBeenCalledTimes(2);
    expect(generateChapterTeachingPlan).toHaveBeenLastCalledWith(1, true);
    expect(wrapper.get(".classroom-empty").text()).toBe("正在重新生成课程…");
    finish({ ...result, plan: { ...plan, version: "v2" } });
    await flushPromises();
    expect(wrapper.get(".classroom-primary").text()).toBe("开始上课");
    expect(wrapper.get(".classroom-progress").element.value).toBe(0);
  });
  it("keeps text input behind the question control and closes the panel with Escape", async () => {
    wrapper = mount(ClassroomPage, { props: { id: 2, chapterId: 1 } });
    await flushPromises();
    await wrapper.find('button[aria-label="文字提问"]').trigger("click");
    expect(wrapper.find(".classroom-composer").exists()).toBe(true);
    await wrapper.find('button[aria-label="文字提问"]').trigger("click");
    expect(wrapper.find(".classroom-composer").exists()).toBe(false);
    await wrapper.find('button[aria-label="课堂"]').trigger("click");
    await flushPromises();
    await wrapper.find('[role="dialog"]').trigger("keydown", { key: "Escape" });
    await flushPromises();
    expect(wrapper.find('[role="dialog"]').exists()).toBe(false);
  });
});
