import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import ClassroomPage from "../ClassroomPage.vue";
import {
  getChapterClassroom,
  getImportedArticleChapters,
  saveChapterClassroom,
  getClassroomLiveConfig,
} from "@/shared/api.js";

const transport = vi.hoisted(() => ({ live: null, onEvent: null }));

vi.mock("vue-router", () => ({
  useRouter: () => ({ push: vi.fn() }),
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
    useClassroomLive: ({ onEvent }) => {
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
      beats: [{ id: "beat-1", objective: "表达需要", board_text: "不要提前显示板书" }],
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
