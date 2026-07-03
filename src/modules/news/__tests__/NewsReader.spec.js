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
  rewriteArticle,
  saveReadingLog,
  getDailyGoalProgress,
  getArticles,
  getArticlesReadingStatus,
  getPathCurriculum,
  getComprehensionQuiz,
  updateWordMastery,
} = vi.hoisted(() => ({
  lookupWordsMastery: vi.fn(),
  ensureWordsSeen: vi.fn().mockResolvedValue(undefined),
  getArticle: vi.fn(),
  rewriteArticle: vi.fn(),
  saveReadingLog: vi.fn().mockResolvedValue(undefined),
  getDailyGoalProgress: vi.fn(),
  getArticles: vi.fn(),
  getArticlesReadingStatus: vi.fn(),
  getPathCurriculum: vi.fn(),
  getComprehensionQuiz: vi.fn().mockResolvedValue(null),
  updateWordMastery: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/shared/api.js", () => ({
  getArticle,
  rewriteArticle,
  saveReadingLog,
  updateWordMastery,
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
    cefr: "B1",
  }),
}));

const NewsReader = (await import("@/modules/news/NewsReader.vue")).default;
const WordPopup = (await import("@/shared/components/WordPopup.vue")).default;
const SelectionTranslateOverlay = (
  await import("@/shared/components/SelectionTranslateOverlay.vue")
).default;
const { translateText, addDiscoveredWord, lookupWordIds } = await import("@/shared/api.js");
const { peekReadingSessionWords } = await import("../readingSession.js");
const { openAiContact } = await import("@/modules/ai-chat/openAiContact.js");
const { COMPREHENSION_PRACTICE_PAYLOAD_KEY } = await import("../comprehensionAiPractice.js");

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
    sessionStorage.clear();
    setLocale("zh", { persist: false });
    setActivePinia(createPinia());
    lookupWordsMastery.mockReset();
    ensureWordsSeen.mockClear();
    updateWordMastery.mockClear();
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
    rewriteArticle.mockReset();
    getArticle.mockResolvedValue({
      id: 1,
      original_title: "Titulo",
      rewritten_body: "Hola mundo nuevo",
      rewrite_level: "A2",
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

  it("passes reading context when marking a syllabus word unknown", async () => {
    const router = makeRouter();
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

    expect(updateWordMastery).toHaveBeenCalledWith(
      "u1",
      99,
      1,
      "news_reading",
      expect.any(String),
      1,
    );
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

  it("shows stale rewrite banner when article level differs from user CEFR", async () => {
    const router = makeRouter();
    await router.push("/news/1");
    await router.isReady();

    const wrapper = mount(NewsReader, {
      props: { id: "1" },
      global: { plugins: [router] },
    });
    await flushPromises();

    expect(wrapper.find(".rewrite-stale-banner").exists()).toBe(true);
    expect(wrapper.find(".rewrite-stale-text").text()).toContain("A2");
    expect(wrapper.find(".rewrite-stale-text").text()).toContain("B1");
  });

  it("dismisses stale rewrite banner", async () => {
    const router = makeRouter();
    await router.push("/news/1");
    await router.isReady();

    const wrapper = mount(NewsReader, {
      props: { id: "1" },
      global: { plugins: [router] },
    });
    await flushPromises();

    await wrapper.find(".btn-stale-dismiss").trigger("click");
    await flushPromises();
    expect(wrapper.find(".rewrite-stale-banner").exists()).toBe(false);
  });

  it("triggers rewrite refresh from stale banner", async () => {
    rewriteArticle.mockResolvedValue({
      id: 1,
      original_title: "Titulo",
      rewritten_body: "Texto nuevo para B1",
      rewrite_level: "B1",
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

    await wrapper.find(".btn-stale-refresh").trigger("click");
    await flushPromises();
    expect(rewriteArticle).toHaveBeenCalledWith(1, "B1", "u1", "es");
  });

  it("enters vocab context revisit mode from query and highlights the saved sentence", async () => {
    sessionStorage.setItem(
      "amiga:vocabContextRevisitPayload",
      JSON.stringify({
        articleId: 1,
        sentence: "Hola mundo nuevo",
        word: "mundo",
      }),
    );
    getArticle.mockResolvedValue({
      id: 1,
      original_title: "Titulo",
      rewritten_body: "Hola mundo nuevo",
      rewrite_level: "A2",
      source: "sample",
    });

    const router = makeRouter();
    await router.push({
      path: "/news/1",
      query: { vocabContextRevisit: "1", returnTo: "vocab-review" },
    });
    await router.isReady();

    const wrapper = mount(NewsReader, {
      props: { id: "1" },
      global: { plugins: [router] },
    });
    await flushPromises();
    await flushPromises();

    expect(wrapper.text()).toContain("高亮为复习语境句");
    expect(wrapper.findAll(".evidence-highlight").length).toBeGreaterThan(0);
  });

  it("highlights lesson words from lessonWords query", async () => {
    getArticle.mockResolvedValue({
      id: 1,
      original_title: "Titulo",
      rewritten_body: "Hola mundo, gracias por leer.",
      rewrite_level: "A2",
      source: "sample",
    });

    const router = makeRouter();
    const replaceSpy = vi.spyOn(router, "replace");
    await router.push({
      path: "/news/1",
      query: { lessonWords: "hola,gracias" },
    });
    await router.isReady();

    const wrapper = mount(NewsReader, {
      props: { id: "1" },
      global: { plugins: [router] },
    });
    await flushPromises();
    await flushPromises();

    expect(wrapper.find(".lesson-words-strip").exists()).toBe(true);
    expect(wrapper.findAll(".lesson-word-highlight").length).toBeGreaterThan(0);
    expect(replaceSpy).toHaveBeenCalledWith({
      name: "reader",
      params: { id: "1" },
    });
  });

  it("returns to vocab review on hardware back when returnTo is set", async () => {
    const router = makeRouter();
    const replaceSpy = vi.spyOn(router, "replace");
    await router.push({
      path: "/news/1",
      query: { vocabContextRevisit: "1", returnTo: "vocab-review" },
    });
    await router.isReady();

    mount(NewsReader, {
      props: { id: "1" },
      global: { plugins: [router] },
    });
    await flushPromises();

    const result = window.__amigaGoBackInPage?.();
    expect(result).toBe("navigated");
    expect(replaceSpy).toHaveBeenCalledWith({ name: "vocab-review" });
  });

  it("shows evidence speech controls on wrong comprehension results", async () => {
    Object.defineProperty(globalThis, "speechSynthesis", {
      configurable: true,
      value: { speak: vi.fn(), cancel: vi.fn() },
    });

    const QUIZ = {
      questions: [
        {
          id: "main-idea",
          prompt_native: "这篇文章主要讲了什么？",
          options: [
            { id: "a", text_native: "央行加息抑制通胀" },
            { id: "b", text_native: "科技公司发布新手机" },
          ],
          correct_option_id: "a",
          evidence_sentence: "El banco central subió las tasas para frenar la inflación.",
          explanation_native: "文章重点是央行通过加息应对通胀。",
        },
        {
          id: "detail",
          prompt_native: "通胀情况如何？",
          options: [
            { id: "a", text_native: "仍然偏高" },
            { id: "b", text_native: "已经消失" },
          ],
          correct_option_id: "a",
          evidence_sentence: "La inflación sigue siendo alta este año.",
          explanation_native: "文中明确提到通胀仍然偏高。",
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
    getArticle.mockResolvedValue({
      id: 1,
      original_title: "Titulo",
      rewritten_body:
        "El banco central subió las tasas para frenar la inflación. La inflación sigue siendo alta este año.",
      rewrite_level: "B1",
      source: "sample",
    });

    const router = makeRouter();
    await router.push({ path: "/news/1", query: { comprehensionRetake: "1" } });
    await router.isReady();

    const wrapper = mount(NewsReader, {
      props: { id: "1" },
      global: { plugins: [router] },
    });
    await flushPromises();
    await flushPromises();

    await wrapper.findAll(".comprehension-option")[1].trigger("click");
    await wrapper.find(".action-btn.primary").trigger("click");
    await flushPromises();
    await wrapper.findAll(".comprehension-option")[1].trigger("click");
    await flushPromises();

    expect(wrapper.find(".comprehension-result-card.wrong").exists()).toBe(true);
    expect(wrapper.findAll(".context-speech-controls").length).toBeGreaterThan(0);
    expect(wrapper.find(".comprehension-evidence-locate").exists()).toBe(true);
  });

  it("offers comprehension AI practice on wrong quiz results and opens Amiga chat", async () => {
    const QUIZ = {
      questions: [
        {
          id: "main-idea",
          prompt_native: "这篇文章主要讲了什么？",
          options: [
            { id: "a", text_native: "央行加息抑制通胀" },
            { id: "b", text_native: "科技公司发布新手机" },
          ],
          correct_option_id: "a",
          evidence_sentence: "El banco central subió las tasas para frenar la inflación.",
          explanation_native: "文章重点是央行通过加息应对通胀。",
        },
        {
          id: "detail",
          prompt_native: "通胀情况如何？",
          options: [
            { id: "a", text_native: "仍然偏高" },
            { id: "b", text_native: "已经消失" },
          ],
          correct_option_id: "a",
          evidence_sentence: "La inflación sigue siendo alta este año.",
          explanation_native: "文中明确提到通胀仍然偏高。",
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
    getArticle.mockResolvedValue({
      id: 1,
      original_title: "Titulo",
      rewritten_body:
        "El banco central subió las tasas para frenar la inflación. La inflación sigue siendo alta este año.",
      rewrite_level: "B1",
      source: "sample",
    });

    const router = makeRouter();
    await router.push({ path: "/news/1", query: { comprehensionRetake: "1" } });
    await router.isReady();

    const wrapper = mount(NewsReader, {
      props: { id: "1" },
      global: { plugins: [router] },
    });
    await flushPromises();

    await wrapper.findAll(".comprehension-option")[1].trigger("click");
    await wrapper.find(".action-btn.primary").trigger("click");
    await flushPromises();
    await wrapper.findAll(".comprehension-option")[1].trigger("click");
    await flushPromises();

    const practiceBtn = wrapper
      .findAll(".action-btn.secondary")
      .find((btn) => btn.text().includes("练懂"));
    expect(practiceBtn).toBeTruthy();
    await practiceBtn.trigger("click");
    await flushPromises();

    expect(openAiContact).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ contactType: "amiga" }),
      expect.objectContaining({
        starterId: "comprehension-practice",
        starterParams: expect.objectContaining({ from: "comprehension" }),
      }),
    );
    expect(sessionStorage.getItem(COMPREHENSION_PRACTICE_PAYLOAD_KEY)).toContain("Titulo");
  });

  it("locates a specific evidence sentence in the article from quiz results", async () => {
    const QUIZ = {
      questions: [
        {
          id: "main-idea",
          prompt_native: "这篇文章主要讲了什么？",
          options: [
            { id: "a", text_native: "央行加息抑制通胀" },
            { id: "b", text_native: "科技公司发布新手机" },
          ],
          correct_option_id: "a",
          evidence_sentence: "El banco central subió las tasas para frenar la inflación.",
          explanation_native: "文章重点是央行通过加息应对通胀。",
        },
        {
          id: "detail",
          prompt_native: "通胀情况如何？",
          options: [
            { id: "a", text_native: "仍然偏高" },
            { id: "b", text_native: "已经消失" },
          ],
          correct_option_id: "a",
          evidence_sentence: "La inflación sigue siendo alta este año.",
          explanation_native: "文中明确提到通胀仍然偏高。",
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
    getArticle.mockResolvedValue({
      id: 1,
      original_title: "Titulo",
      rewritten_body:
        "El banco central subió las tasas para frenar la inflación. La inflación sigue siendo alta este año.",
      rewrite_level: "B1",
      source: "sample",
    });

    const router = makeRouter();
    await router.push({ path: "/news/1", query: { comprehensionRetake: "1" } });
    await router.isReady();

    const wrapper = mount(NewsReader, {
      props: { id: "1" },
      global: { plugins: [router] },
    });
    await flushPromises();
    await flushPromises();

    await wrapper.findAll(".comprehension-option")[1].trigger("click");
    await wrapper.find(".action-btn.primary").trigger("click");
    await flushPromises();
    await wrapper.findAll(".comprehension-option")[1].trigger("click");
    await flushPromises();

    const locateButtons = wrapper.findAll(".comprehension-evidence-locate");
    expect(locateButtons.length).toBe(2);
    await locateButtons[1].trigger("click");
    await flushPromises();
    await flushPromises();

    expect(wrapper.find(".comprehension-revisit-strip").exists()).toBe(true);
    expect(wrapper.find(".comprehension-quiz").exists()).toBe(false);
    expect(
      wrapper.findAll("[data-evidence-sentence='La inflación sigue siendo alta este año.']").length,
    ).toBeGreaterThan(0);
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