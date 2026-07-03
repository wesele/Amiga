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
  getComprehensionQuiz,
} = vi.hoisted(() => ({
  lookupWordsMastery: vi.fn(),
  ensureWordsSeen: vi.fn().mockResolvedValue(undefined),
  getArticle: vi.fn(),
  saveReadingLog: vi.fn().mockResolvedValue(undefined),
  getDailyGoalProgress: vi.fn(),
  getArticles: vi.fn(),
  getArticlesReadingStatus: vi.fn(),
  getPathCurriculum: vi.fn(),
  getComprehensionQuiz: vi.fn().mockResolvedValue(null),
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
  getComprehensionQuiz,
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
const SelectionTranslateOverlay = (
  await import("@/shared/components/SelectionTranslateOverlay.vue")
).default;
const { translateText, addDiscoveredWord, lookupWordIds } = await import("@/shared/api.js");
const { peekReadingSessionWords } = await import("../readingSession.js");

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

    expect(wrapper.find(".next-steps-panel").exists()).toBe(true);
    expect(wrapper.find(".next-steps-primary").text()).toContain("读下一篇未读");

    await wrapper.find(".action-btn.primary").trigger("click");
    expect(replaceSpy).toHaveBeenCalledWith({
      name: "reader",
      params: { id: 2 },
    });
  });

  it("shows checkpoint summary on back with marked unknown words before completion", async () => {
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

    await wrapper.find(".back-btn").trigger("click");
    await flushPromises();

    const overlay = wrapper.find(".completion-overlay");
    expect(overlay.exists()).toBe(true);
    expect(overlay.text()).toContain("本次阅读小结");
    expect(wrapper.find(".next-steps-primary").text()).toContain("复习本次 1 个生词");
    expect(replaceSpy).not.toHaveBeenCalled();
  });

  it("shows checkpoint with continue reading when session is long enough without marked words", async () => {
    vi.useFakeTimers();
    const router = makeRouter();
    await router.push("/news/1");
    await router.isReady();

    const wrapper = mount(NewsReader, {
      props: { id: "1" },
      global: { plugins: [router] },
    });
    await flushPromises();

    const body = wrapper.find(".article-body").element;
    Object.defineProperty(body, "scrollHeight", { value: 1000, configurable: true });
    Object.defineProperty(body, "clientHeight", { value: 200, configurable: true });
    Object.defineProperty(body, "scrollTop", {
      value: 400,
      configurable: true,
      writable: true,
    });
    await body.dispatchEvent(new Event("scroll"));
    await flushPromises();

    vi.advanceTimersByTime(31_000);
    await wrapper.find(".back-btn").trigger("click");
    await flushPromises();

    const overlay = wrapper.find(".completion-overlay");
    expect(overlay.exists()).toBe(true);
    expect(overlay.text()).toContain("本次阅读小结");
    expect(wrapper.find(".action-btn.primary").text()).toContain("继续阅读");
    vi.useRealTimers();
  });

  it("shows complete summary instead of checkpoint when scroll reaches 90%", async () => {
    vi.useFakeTimers();
    const router = makeRouter();
    await router.push("/news/1");
    await router.isReady();

    const wrapper = mount(NewsReader, {
      props: { id: "1" },
      global: { plugins: [router] },
    });
    await flushPromises();

    const body = wrapper.find(".article-body").element;
    Object.defineProperty(body, "scrollHeight", { value: 1000, configurable: true });
    Object.defineProperty(body, "clientHeight", { value: 200, configurable: true });
    Object.defineProperty(body, "scrollTop", {
      value: 720,
      configurable: true,
      writable: true,
    });
    await body.dispatchEvent(new Event("scroll"));
    await flushPromises();

    vi.advanceTimersByTime(31_000);
    await wrapper.find(".back-btn").trigger("click");
    await flushPromises();

    expect(wrapper.find(".completion-overlay").text()).toContain("阅读完成");
    expect(wrapper.find(".completion-overlay").text()).not.toContain("本次阅读小结");
    vi.useRealTimers();
  });

  it("marks translated phrases for review and includes them in session summary", async () => {
    translateText.mockResolvedValue("利率");
    lookupWordIds.mockResolvedValue([]);
    getArticle.mockResolvedValue({
      id: 1,
      original_title: "Titulo",
      rewritten_body: "La tasa de interés subió ayer en España.",
      source: "sample",
    });

    const router = makeRouter();
    await router.push("/news/1");
    await router.isReady();

    const wrapper = mount(NewsReader, {
      props: { id: "1" },
      global: { plugins: [router] },
    });
    await flushPromises();

    window.__amigaTranslateSelection("tasa de interés");
    await flushPromises();
    await flushPromises();

    const overlay = wrapper.findComponent(SelectionTranslateOverlay);
    expect(overlay.props("showActions")).toBe(true);
    await overlay.vm.$emit("unknown");
    await flushPromises();

    expect(addDiscoveredWord).toHaveBeenCalledWith(
      "u1",
      "tasa de interés",
      "es",
      "La tasa de interés subió ayer en España.",
    );

    const cta = wrapper.find(".reading-review-cta");
    expect(cta.exists()).toBe(true);
    expect(cta.text()).toContain("复习本次 1 个生词");

    await cta.trigger("click");
    await flushPromises();

    const sessionWords = peekReadingSessionWords();
    expect(sessionWords).toHaveLength(1);
    expect(sessionWords[0].word).toBe("tasa de interés");
    expect(sessionWords[0].translation).toBe("利率");
    expect(sessionWords[0].context).toContain("tasa de interés");
  });

  it("opens comprehension retake sheet from deep link query", async () => {
    const QUIZ = {
      questions: [
        {
          id: "main-idea",
          prompt_native: "主旨？",
          options: [
            { id: "a", text_native: "A" },
            { id: "b", text_native: "B" },
          ],
          correct_option_id: "a",
        },
        {
          id: "detail",
          prompt_native: "细节？",
          options: [
            { id: "a", text_native: "A" },
            { id: "b", text_native: "B" },
          ],
          correct_option_id: "a",
        },
      ],
    };
    getComprehensionQuiz.mockResolvedValue(QUIZ);
    getArticlesReadingStatus.mockResolvedValue([
      {
        article_id: 1,
        read_at: "2026-07-03 10:00:00",
        completed: true,
        comprehension_skipped: true,
      },
    ]);

    const router = makeRouter();
    const replaceSpy = vi.spyOn(router, "replace");
    await router.push({ path: "/news/1", query: { comprehensionRetake: "1" } });
    await router.isReady();

    const wrapper = mount(NewsReader, {
      props: { id: "1" },
      global: { plugins: [router] },
    });
    await flushPromises();
    await flushPromises();

    expect(wrapper.find(".comprehension-quiz").exists()).toBe(true);
    expect(replaceSpy).toHaveBeenCalledWith({
      name: "reader",
      params: { id: "1" },
    });
  });

  it("persists comprehension fields after retake and clears skipped flag", async () => {
    const QUIZ = {
      questions: [
        {
          id: "main-idea",
          prompt_native: "主旨？",
          options: [
            { id: "a", text_native: "A" },
            { id: "b", text_native: "B" },
          ],
          correct_option_id: "a",
        },
        {
          id: "detail",
          prompt_native: "细节？",
          options: [
            { id: "a", text_native: "A" },
            { id: "b", text_native: "B" },
          ],
          correct_option_id: "a",
        },
      ],
    };
    getComprehensionQuiz.mockResolvedValue(QUIZ);
    getArticlesReadingStatus.mockResolvedValue([
      {
        article_id: 1,
        read_at: "2026-07-03 10:00:00",
        completed: true,
        comprehension_skipped: true,
      },
    ]);

    const router = makeRouter();
    await router.push({ path: "/news/1", query: { comprehensionRetake: "1" } });
    await router.isReady();

    const wrapper = mount(NewsReader, {
      props: { id: "1" },
      global: { plugins: [router] },
    });
    await flushPromises();
    await flushPromises();

    await wrapper.findAll(".comprehension-option")[0].trigger("click");
    await wrapper.find(".action-btn.primary").trigger("click");
    await flushPromises();
    await wrapper.findAll(".comprehension-option")[0].trigger("click");
    await flushPromises();
    await wrapper.find(".action-btn.primary").trigger("click");
    await flushPromises();

    expect(saveReadingLog).toHaveBeenCalled();
    const lastCall = saveReadingLog.mock.calls.at(-1)[0];
    expect(lastCall.comprehension_score).toBe(2);
    expect(lastCall.comprehension_skipped).toBe(false);
    expect(lastCall.comprehension_answers_json).toBeTruthy();
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