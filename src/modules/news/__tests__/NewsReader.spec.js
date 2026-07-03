import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { createRouter, createMemoryHistory } from "vue-router";
import { setLocale } from "@/shared/i18n";

vi.mock("@tauri-apps/plugin-shell", () => ({ open: vi.fn() }));

const {
  lookupWordsMastery,
  ensureWordsSeen,
  getArticle,
  saveReadingLog,
  getDailyGoalProgress,
  getArticles,
  getArticlesReadingStatus,
  getPathCurriculum,
} = vi.hoisted(() => ({
  lookupWordsMastery: vi.fn(),
  ensureWordsSeen: vi.fn().mockResolvedValue(undefined),
  getArticle: vi.fn(),
  saveReadingLog: vi.fn().mockResolvedValue(undefined),
  getDailyGoalProgress: vi.fn(),
  getArticles: vi.fn(),
  getArticlesReadingStatus: vi.fn(),
  getPathCurriculum: vi.fn(),
}));

vi.mock("@/shared/api.js", () => ({
  getArticle,
  rewriteArticle: vi.fn(),
  saveReadingLog,
  updateWordMastery: vi.fn().mockResolvedValue(undefined),
  getBilingual: vi.fn(),
  translateText: vi.fn(),
  lookupWordIds: vi.fn().mockResolvedValue([99]),
  lookupWordsMastery,
  ensureWordsSeen,
  addDiscoveredWord: vi.fn().mockResolvedValue(100),
  shareText: vi.fn(),
  getDailyGoalProgress,
  getArticles,
  getArticlesReadingStatus,
  getPathCurriculum,
}));

vi.mock("@/modules/ai-chat/openAiContact.js", () => ({
  openAiContact: vi.fn().mockResolvedValue(true),
}));

vi.mock("@/shared/learningContext.js", () => ({
  loadLearningContext: vi.fn().mockResolvedValue({
    user: { id: "u1" },
    targetLang: "es",
    cefr: "A2",
  }),
}));

const NewsReader = (await import("@/modules/news/NewsReader.vue")).default;
const WordPopup = (await import("@/shared/components/WordPopup.vue")).default;

function makeRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: "/news", name: "news", component: { template: "<div/>" } },
      {
        path: "/news/:id",
        name: "reader",
        component: NewsReader,
        props: true,
        meta: { parent: "news" },
      },
      { path: "/vocab/review", name: "vocab-review", component: { template: "<div/>" } },
      { path: "/path", name: "path", component: { template: "<div/>" } },
    ],
  });
}

const ACTIVE_CURRICULUM = {
  status: "active",
  units: [
    {
      sections: [
        {
          id: "zh-es/U01-GRAMMAR",
          kind: "grammar",
          current: true,
          locked: false,
        },
      ],
    },
  ],
};

describe("NewsReader mastery visualization", () => {
  beforeEach(() => {
    setLocale("zh", { persist: false });
    setActivePinia(createPinia());
    lookupWordsMastery.mockReset();
    ensureWordsSeen.mockClear();
    getArticle.mockReset();
    getDailyGoalProgress.mockReset();
    getArticles.mockReset();
    getArticlesReadingStatus.mockReset();
    getPathCurriculum.mockReset();
    getDailyGoalProgress.mockResolvedValue({
      streak_current: 5,
      practiced_today: false,
      goal_met: false,
      target_lessons: 2,
      lessons_today: 0,
    });
    getPathCurriculum.mockResolvedValue(ACTIVE_CURRICULUM);
    getArticles.mockResolvedValue([
      { id: 1, original_title: "Current" },
      { id: 2, original_title: "Next unread" },
    ]);
    getArticlesReadingStatus.mockResolvedValue([
      { article_id: 1, read_at: null },
      { article_id: 2, read_at: null },
    ]);
    lookupWordsMastery.mockResolvedValue([
      { word: "hola", word_id: 1, mastery: 2 },
      { word: "mundo", word_id: 2, mastery: 0 },
      { word: "nuevo", word_id: 3, mastery: 1 },
    ]);
    getArticle.mockResolvedValue({
      id: 1,
      original_title: "Titulo",
      rewritten_body: "Hola mundo nuevo",
      source: "sample",
    });
  });

  it("renders mastery classes after article load", async () => {
    const router = makeRouter();
    await router.push("/news/1");
    await router.isReady();

    const wrapper = mount(NewsReader, {
      props: { id: "1" },
      global: { plugins: [router] },
    });
    await flushPromises();

    expect(ensureWordsSeen).toHaveBeenCalled();
    expect(lookupWordsMastery).toHaveBeenCalled();

    const words = wrapper.findAll(".word");
    expect(words.some((w) => w.classes().includes("word-mastered"))).toBe(true);
    expect(words.some((w) => w.classes().includes("word-new"))).toBe(true);
    expect(words.some((w) => w.classes().includes("word-seen"))).toBe(true);
  });

  it("shows review CTA after marking unknown words and navigates with from=reading", async () => {
    const router = makeRouter();
    const pushSpy = vi.spyOn(router, "push");
    await router.push("/news/1");
    await router.isReady();

    const wrapper = mount(NewsReader, {
      props: { id: "1" },
      global: { plugins: [router] },
    });
    await flushPromises();

    expect(wrapper.find(".reading-review-cta").exists()).toBe(false);

    await wrapper.find(".word.word-new").trigger("click");
    await flushPromises();
    await wrapper.findComponent(WordPopup).vm.$emit("unknown");
    await flushPromises();

    const cta = wrapper.find(".reading-review-cta");
    expect(cta.exists()).toBe(true);
    expect(cta.text()).toContain("复习本次 1 个生词");

    await cta.trigger("click");
    expect(pushSpy).toHaveBeenCalledWith({
      name: "vocab-review",
      query: { from: "reading" },
    });
  });

  it("shows completion summary on back after marking unknown words", async () => {
    const router = makeRouter();
    const replaceSpy = vi.spyOn(router, "replace");
    await router.push("/news/1");
    await router.isReady();

    const wrapper = mount(NewsReader, {
      props: { id: "1" },
      global: { plugins: [router] },
    });
    await flushPromises();

    await wrapper.find(".word.word-new").trigger("click");
    await flushPromises();
    await wrapper.findComponent(WordPopup).vm.$emit("unknown");
    await flushPromises();

    expect(wrapper.find(".completion-overlay").exists()).toBe(false);

    await wrapper.find(".mark-complete-btn").trigger("click");
    await flushPromises();

    await wrapper.find(".back-btn").trigger("click");
    await flushPromises();

    const overlay = wrapper.find(".completion-overlay");
    expect(overlay.exists()).toBe(true);
    expect(overlay.text()).toContain("阅读完成");
    expect(overlay.text()).toContain("今日练习已记录");
    expect(wrapper.find(".next-steps-panel").exists()).toBe(true);
    expect(wrapper.find(".next-steps-primary").text()).toContain("复习本次 1 个生词");
    expect(replaceSpy).not.toHaveBeenCalled();

    await overlay.find(".action-btn.primary").trigger("click");
    expect(replaceSpy).not.toHaveBeenCalled();
  });

  it("shows next-steps panel without unknown words and routes to the next unread article", async () => {
    getDailyGoalProgress.mockResolvedValue({
      streak_current: 5,
      practiced_today: true,
      goal_met: true,
      target_lessons: 2,
      lessons_today: 2,
    });

    const router = makeRouter();
    const replaceSpy = vi.spyOn(router, "replace");
    await router.push("/news/1");
    await router.isReady();

    const wrapper = mount(NewsReader, {
      props: { id: "1" },
      global: { plugins: [router] },
    });
    await flushPromises();

    await wrapper.find(".word.word-new").trigger("click");
    await flushPromises();
    await wrapper.findComponent(WordPopup).vm.$emit("known");
    await flushPromises();

    await wrapper.find(".mark-complete-btn").trigger("click");
    await flushPromises();

    await wrapper.find(".back-btn").trigger("click");
    await flushPromises();

    expect(wrapper.find(".next-steps-panel").exists()).toBe(true);
    expect(wrapper.find(".next-steps-primary").text()).toContain("读下一篇未读");

    await wrapper.find(".action-btn.primary").trigger("click");
    expect(replaceSpy).toHaveBeenCalledWith({
      name: "reader",
      params: { id: 2 },
    });
  });

  it("navigates back immediately when reading is too short with no interaction", async () => {
    const router = makeRouter();
    const replaceSpy = vi.spyOn(router, "replace");
    await router.push("/news/1");
    await router.isReady();

    const wrapper = mount(NewsReader, {
      props: { id: "1" },
      global: { plugins: [router] },
    });
    await flushPromises();

    await wrapper.find(".back-btn").trigger("click");
    await flushPromises();

    expect(wrapper.find(".completion-overlay").exists()).toBe(false);
    expect(replaceSpy).toHaveBeenCalledWith({ name: "news" });
  });
});