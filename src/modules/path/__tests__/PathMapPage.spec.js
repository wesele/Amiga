import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { createRouter, createMemoryHistory } from "vue-router";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

vi.mock("@/shared/api.js", () => ({
  getPathCurriculum: vi.fn(),
  getCurrentUser: vi.fn().mockResolvedValue({ id: "u1", native_language: "zh" }),
  getLearningGoals: vi.fn().mockResolvedValue([{ target_language: "es", cefr_level: "A1" }]),
  getLearningStreak: vi.fn().mockResolvedValue({ current: 3 }),
  getTeachingContent: vi.fn().mockResolvedValue({
    grammar_points: ["ser 和 estar 的区别", "定冠词用法"],
    words: [{ word: "hola" }, { word: "gracias" }],
  }),
  updateLearningGoalCefr: vi.fn(),
}));

vi.mock("@/stores/targetLang.js", () => ({
  useTargetLangStore: () => ({
    code: "es",
    load: vi.fn().mockResolvedValue("es"),
  }),
}));

const ROOT = resolve(__dirname, "../../../..");
function readVue(rel) {
  return readFileSync(resolve(ROOT, rel), "utf8");
}

describe("PathMapPage unit guide layout", () => {
  it("lets guide-text shrink in the flex row so subtitles are not truncated", () => {
    const source = readVue("src/modules/path/PathMapPage.vue");
    const guideText = source.match(/\.guide-text\s*\{[\s\S]*?\}/);
    expect(guideText, ".guide-text rule not found").toBeTruthy();
    expect(guideText[0]).toMatch(/flex:\s*1/);
    expect(guideText[0]).toMatch(/min-width:\s*0/);
  });

  it("wraps or clamps the unit subtitle instead of clipping horizontally", () => {
    const source = readVue("src/modules/path/PathMapPage.vue");
    const guideSub = source.match(/\.guide-sub\s*\{[\s\S]*?\}/);
    expect(guideSub, ".guide-sub rule not found").toBeTruthy();
    expect(guideSub[0]).toMatch(/overflow-wrap:\s*break-word/);
    expect(guideSub[0]).toMatch(/-webkit-line-clamp:\s*2/);
    expect(guideSub[0]).toMatch(/-webkit-box-orient:\s*vertical/);
  });

  it("avoids duplicate kind labels and draws a single curved connector between nodes", () => {
    const source = readVue("src/modules/path/PathMapPage.vue");
    expect(source).toMatch(/showKindLabel\(section\)/);
    expect(source).toMatch(/connectorPath\(idx, idx \+ 1\)/);
    expect(source).toMatch(/idx < unit\.sections\.length - 1/);
    expect(source).toMatch(/\.path-connector\s*\{[\s\S]*height:\s*40px/);
    expect(source).toMatch(/\.connector-line\s*\{[\s\S]*stroke:\s*var\(--green\)/);
    expect(source).not.toMatch(/connector-shadow/);
    expect(source).not.toMatch(/\.path-lane::before/);
    expect(source).toMatch(/class="step-body"/);
  });

  it("offsets nodes left, center, and right with captions below the node", () => {
    const source = readVue("src/modules/path/PathMapPage.vue");
    expect(source).toMatch(/\.path-step\.lane-left \.step-body\s*\{[\s\S]*align-self:\s*flex-start/);
    expect(source).toMatch(/\.path-step\.lane-center \.step-body\s*\{[\s\S]*align-self:\s*center/);
    expect(source).toMatch(/\.path-step\.lane-right \.step-body\s*\{[\s\S]*align-self:\s*flex-end/);
    expect(source).toMatch(/\.step-body\s*\{[\s\S]*flex-direction:\s*column/);
    expect(source).toMatch(/\.node-caption\s*\{[\s\S]*text-align:\s*center/);
  });

  it("shows streak pill in header when user has an active streak", () => {
    const source = readVue("src/modules/path/PathMapPage.vue");
    expect(source).toMatch(/learningStreak\?\.current > 0/);
    expect(source).toMatch(/class="streak-pill"/);
    expect(source).toMatch(/path\.streakDays/);
  });

  it("shows current level in one button and opens a picker sheet", () => {
    const source = readVue("src/modules/path/PathMapPage.vue");
    expect(source).toMatch(/class="level-btn"/);
    expect(source).toMatch(/showLevelPicker/);
    expect(source).toMatch(/level-sheet-option/);
    expect(source).not.toMatch(/class="level-pill"/);
  });

  it("keeps the level button compact so header text has more room", () => {
    const source = readVue("src/modules/path/PathMapPage.vue");
    const levelBtn = source.match(/\.level-btn\s*\{[\s\S]*?\}/);
    expect(levelBtn, ".level-btn rule not found").toBeTruthy();
    expect(levelBtn[0]).toMatch(/min-width:\s*0/);
    expect(levelBtn[0]).toMatch(/padding:\s*6px\s+10px/);
    expect(levelBtn[0]).not.toMatch(/min-width:\s*56px/);
  });

  it("places connectors in the gap below captions", () => {
    const source = readVue("src/modules/path/PathMapPage.vue");
    expect(source).toMatch(/class="step-body"[\s\S]*class="path-connector"/);
    expect(source).toMatch(/\.path-connector\s*\{[\s\S]*margin:\s*2px 0 8px/);
    expect(source).toMatch(/\.step-body\s*\{[\s\S]*gap:\s*6px/);
  });

  it("auto-scrolls to the current node and shows a floating continue entry", () => {
    const source = readVue("src/modules/path/PathMapPage.vue");
    expect(source).toMatch(/currentSectionDomId\(section\)/);
    expect(source).toMatch(/scrollToCurrentSection/);
    expect(source).toMatch(/IntersectionObserver/);
    expect(source).toMatch(/shouldShowJumpToCurrent/);
    expect(source).toMatch(/class="jump-current-bar"/);
    expect(source).toMatch(/path\.continueCurrent/);
    expect(source).toMatch(/PATH_FOCUS_QUERY/);
  });

  it("plays path completion celebration from celebrate query", () => {
    const source = readVue("src/modules/path/PathMapPage.vue");
    expect(source).toMatch(/runCelebrationIfNeeded/);
    expect(source).toMatch(/parseCelebrationQuery/);
    expect(source).toMatch(/class="celebration-toast"/);
    expect(source).toMatch(/is-celebrating/);
    expect(source).toMatch(/celebrate-pop/);
    expect(source).toMatch(/celebrationToastCopy/);
  });

  it("opens a node briefing sheet on map clicks while FAB keeps direct launch", () => {
    const source = readVue("src/modules/path/PathMapPage.vue");
    expect(source).toMatch(/openBriefing\(unit, section\)/);
    expect(source).toMatch(/class="briefing-sheet"/);
    expect(source).toMatch(/path\.briefingStart/);
    expect(source).toMatch(/shouldShowNodeBriefing/);
    const jumpFn = source.match(/function onJumpCurrentClick\(\)\s*\{[\s\S]*?\n\}/);
    expect(jumpFn?.[0]).toMatch(/pathSectionRoute\(section\)/);
    expect(jumpFn?.[0]).not.toMatch(/openBriefing/);
  });
});

function makeCurriculum() {
  const sections = Array.from({ length: 6 }, (_, idx) => ({
    id: `zh-es-U0${idx + 1}-GRAMMAR`,
    kind: "grammar",
    title_native: `节点 ${idx + 1}`,
    title_target: `Node ${idx + 1}`,
    locked: idx > 2,
    current: idx === 2,
    stars: idx < 2 ? 1 : 0,
    question_count: 0,
  }));
  return {
    status: "active",
    cefr: "A1",
    completed_sections: 2,
    total_sections: 6,
    total_stars: 2,
    units: [{ id: "U01", title_native: "单元一", title_target: "Unit 1", sections }],
  };
}

class MockIntersectionObserver {
  constructor(callback) {
    this.callback = callback;
  }
  observe() {}
  disconnect() {}
}

describe("PathMapPage scroll behavior", () => {
  let scrollIntoViewSpy;

  beforeEach(() => {
    scrollIntoViewSpy = vi.fn();
    HTMLElement.prototype.scrollIntoView = scrollIntoViewSpy;
    globalThis.IntersectionObserver = MockIntersectionObserver;
    setActivePinia(createPinia());
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("tags the current section with a stable DOM id after curriculum loads", async () => {
    const api = await import("@/shared/api.js");
    api.getPathCurriculum.mockResolvedValue(makeCurriculum());

    const PathMapPage = (await import("@/modules/path/PathMapPage.vue")).default;
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: "/learn", name: "learn", component: { template: "<div/>" } },
        { path: "/learn/path", name: "path", component: PathMapPage },
      ],
    });
    await router.push("/learn/path");
    await router.isReady();

    const wrapper = mount(PathMapPage, { global: { plugins: [router] } });
    await flushPromises();
    await vi.waitUntil(() => wrapper.find(".path-scroll").exists(), { timeout: 2000 });

    const currentStep = wrapper.find(".path-step.is-current");
    expect(currentStep.exists()).toBe(true);
    expect(currentStep.attributes("id")).toBe("path-node-zh-es-U03-GRAMMAR");
  });

  it("opens a briefing sheet when clicking an unlocked map node", async () => {
    const api = await import("@/shared/api.js");
    api.getPathCurriculum.mockResolvedValue({
      status: "active",
      cefr: "A1",
      completed_sections: 2,
      total_sections: 4,
      total_stars: 2,
      units: [
        {
          id: "U01",
          title_native: "基础问候",
          title_target: "Saludos",
          sections: [
            {
              id: "zh-es/U01-GRAMMAR",
              kind: "grammar",
              title_native: "单元知识",
              title_target: "Gramática",
              locked: false,
              current: false,
              stars: 1,
              question_count: 1,
            },
            {
              id: "zh-es/U01-VOCAB",
              kind: "vocab",
              title_native: "单词学习",
              title_target: "Vocabulario",
              locked: false,
              current: false,
              stars: 0,
              question_count: 12,
            },
            {
              id: "zh-es/U01-S01",
              kind: "practice",
              title_native: "基础问候与回应",
              title_target: "Saludos básicos",
              locked: false,
              current: true,
              stars: 0,
              question_count: 8,
            },
          ],
        },
      ],
    });

    const PathMapPage = (await import("@/modules/path/PathMapPage.vue")).default;
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: "/learn", name: "learn", component: { template: "<div/>" } },
        { path: "/learn/path", name: "path", component: PathMapPage },
        { path: "/learn/path/:sectionId", name: "path-lesson", component: { template: "<div/>" } },
      ],
    });
    await router.push("/learn/path");
    await router.isReady();

    const host = document.createElement("div");
    document.body.appendChild(host);

    const wrapper = mount(PathMapPage, { global: { plugins: [router] }, attachTo: host });
    await flushPromises();
    await vi.waitUntil(() => wrapper.find(".path-scroll").exists(), { timeout: 2000 });

    const practiceNode = wrapper.find(".path-node.practice:not([disabled])");
    expect(practiceNode.exists()).toBe(true);
    await practiceNode.trigger("click");
    await flushPromises();

    const sheet = document.body.querySelector(".briefing-sheet");
    expect(sheet).toBeTruthy();
    expect(sheet.textContent).toMatch(/8/);
    expect(sheet.textContent).toMatch(/开始/);

    wrapper.unmount();
    host.remove();
  });

  it("shows celebration toast and node highlight when celebrate query is present", async () => {
    const api = await import("@/shared/api.js");
    api.getPathCurriculum.mockResolvedValue({
      status: "active",
      cefr: "A1",
      completed_sections: 2,
      total_sections: 4,
      total_stars: 5,
      units: [
        {
          id: "U01",
          title_native: "基础问候",
          title_target: "Saludos",
          sections: [
            {
              id: "zh-es/U01-GRAMMAR",
              kind: "grammar",
              title_native: "单元知识",
              title_target: "Gramática",
              locked: false,
              current: false,
              stars: 1,
              question_count: 1,
            },
            {
              id: "zh-es/U01-S01",
              kind: "practice",
              title_native: "基础问候与回应",
              title_target: "Saludos básicos",
              locked: false,
              current: false,
              stars: 3,
              question_count: 8,
            },
            {
              id: "zh-es/U02-GRAMMAR",
              kind: "grammar",
              title_native: "自我介绍",
              title_target: "Presentación",
              locked: false,
              current: true,
              stars: 0,
              question_count: 1,
            },
          ],
        },
      ],
    });

    const PathMapPage = (await import("@/modules/path/PathMapPage.vue")).default;
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: "/learn", name: "learn", component: { template: "<div/>" } },
        { path: "/learn/path", name: "path", component: PathMapPage },
      ],
    });
    await router.push({
      name: "path",
      query: {
        focus: "current",
        celebrate: "zh-es/U01-S01",
        stars: "3",
        kind: "practice",
      },
    });
    await router.isReady();

    const host = document.createElement("div");
    document.body.appendChild(host);
    const wrapper = mount(PathMapPage, { global: { plugins: [router] }, attachTo: host });
    await flushPromises();
    await vi.waitUntil(() => wrapper.find(".path-scroll").exists(), { timeout: 2000 });
    await vi.waitUntil(() => document.body.querySelector(".celebration-toast"), { timeout: 2000 });

    expect(document.body.querySelector(".celebration-toast")?.textContent).toMatch(/练习完成/);
    expect(wrapper.find(".path-step.is-celebrating").exists()).toBe(true);
    expect(wrapper.find(".jump-current-bar").exists()).toBe(false);

    wrapper.unmount();
    host.remove();
  });
});