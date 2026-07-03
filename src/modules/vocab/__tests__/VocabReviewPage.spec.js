import { beforeEach, describe, expect, it, vi, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { flushPromises, mount } from "@vue/test-utils";
import { createMemoryHistory, createRouter } from "vue-router";
import { createPinia, setActivePinia } from "pinia";
import * as api from "@/shared/api.js";
import { setLocale } from "@/shared/i18n";
import * as vocabRatingFeedback from "../vocabRatingFeedback.js";
import * as wordSpeech from "@/shared/wordSpeech.js";
import { saveReadingSessionSummary } from "@/modules/news/readingSession.js";

const VOCAB_PAGE_SOURCE = readFileSync(
  resolve(import.meta.dirname, "../VocabReviewPage.vue"),
  "utf8",
);

vi.mock("@tauri-apps/plugin-shell", () => ({}));

vi.mock("../vocabRatingFeedback.js", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    waitVocabRatingAck: vi.fn(() => Promise.resolve()),
    playVocabRatingFeedback: vi.fn(),
  };
});

const VocabReviewPage = (await import("@/modules/vocab/VocabReviewPage.vue")).default;

const MOCK_WORDS = [
  {
    id: 1,
    word: "hola",
    mastery: 1,
    definition_zh: "你好",
    definition_es: "saludo",
    example: "Hola, ¿cómo estás?",
    pos: "interj",
  },
  {
    id: 2,
    word: "casa",
    mastery: null,
    definition_zh: "房子",
    definition_es: "vivienda",
  },
];

function makeRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: "/learn", name: "learn", component: { template: "<div />" } },
      { path: "/vocab/review", name: "vocab-review", component: VocabReviewPage },
    ],
  });
}

function defaultInvoke(cmd) {
  if (cmd === "get_target_language_cmd") return Promise.resolve("es");
  if (cmd === "get_current_user") {
    return Promise.resolve({ id: "u1", native_language: "zh" });
  }
  if (cmd === "get_learning_goals_cmd") {
    return Promise.resolve([{ target_language: "es", cefr_level: "A1" }]);
  }
  if (cmd === "get_unknown_words_cmd") return Promise.resolve(MOCK_WORDS);
  if (cmd === "update_word_mastery_cmd") return Promise.resolve();
  if (cmd === "record_review_practice_cmd") {
    return Promise.resolve({
      streak: { extended: true, current: 3 },
      daily_goal_just_met: false,
      daily_goal: {
        lessons_today: 0,
        review_sessions_today: 1,
        effective_lessons_today: 1,
        target_lessons: 2,
        goal_met: false,
      },
    });
  }
  if (cmd === "get_user_vocab_stats_cmd") {
    return Promise.resolve({ total_known: 0, total_learning: 2, total: 1000 });
  }
  return Promise.resolve(null);
}

describe("VocabReviewPage", () => {
  let mockInvoke;

  beforeEach(() => {
    sessionStorage.clear();
    setActivePinia(createPinia());
    setLocale("zh", { persist: false });
    mockInvoke = vi.fn().mockImplementation(defaultInvoke);
    api.__setInvoke(mockInvoke);
    vi.mocked(vocabRatingFeedback.waitVocabRatingAck).mockImplementation(() => Promise.resolve());
    vi.mocked(vocabRatingFeedback.playVocabRatingFeedback).mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("shows a pronunciation button on the review flashcard", async () => {
    vi.spyOn(wordSpeech, "isSpeechSynthesisAvailable").mockReturnValue(true);

    const router = makeRouter();
    await router.push("/vocab/review");
    const wrapper = mount(VocabReviewPage, {
      global: { plugins: [router] },
    });
    await flushPromises();

    const speechBtn = wrapper.find(".word-speech-btn");
    expect(speechBtn.exists()).toBe(true);
    expect(speechBtn.attributes("aria-label")).toBe("播放发音");
  });

  it("shows flashcard with first word and reinforcement badge", async () => {
    const router = makeRouter();
    await router.push("/vocab/review");
    const wrapper = mount(VocabReviewPage, {
      global: { plugins: [router] },
    });
    await flushPromises();

    expect(wrapper.text()).toContain("hola");
    expect(wrapper.text()).toContain("待巩固");
    expect(wrapper.text()).toContain("1/2");
    expect(wrapper.find(".action-btn.primary").attributes("disabled")).toBeDefined();
  });

  it("ticks the progress bar when the learner rates a card", async () => {
    const router = makeRouter();
    await router.push("/vocab/review");
    const wrapper = mount(VocabReviewPage, {
      global: { plugins: [router] },
    });
    await flushPromises();

    expect(wrapper.find(".progress-fill").attributes("style")).toContain("width: 50%");

    await wrapper.find(".flashcard").trigger("click");
    await wrapper.find(".review-footer .action-btn.primary").trigger("click");
    await flushPromises();

    expect(wrapper.find(".progress-fill").attributes("style")).toContain("width: 100%");
    expect(wrapper.text()).toContain("casa");
  });

  it("shows positive acknowledgment styling and plays feedback when rated known", async () => {
    let releaseAck;
    vi.mocked(vocabRatingFeedback.waitVocabRatingAck).mockImplementation(
      () =>
        new Promise((resolve) => {
          releaseAck = resolve;
        }),
    );

    const router = makeRouter();
    await router.push("/vocab/review");
    const wrapper = mount(VocabReviewPage, {
      global: { plugins: [router] },
    });
    await flushPromises();

    await wrapper.find(".flashcard").trigger("click");
    await wrapper.find(".review-footer .action-btn.primary").trigger("click");
    await flushPromises();

    expect(wrapper.find(".flashcard").classes()).toContain("is-ack-positive");
    expect(vocabRatingFeedback.playVocabRatingFeedback).toHaveBeenCalledWith(2);
    expect(wrapper.text()).toContain("hola");

    releaseAck();
    await flushPromises();

    expect(wrapper.find(".flashcard").classes()).not.toContain("is-ack-positive");
    expect(wrapper.text()).toContain("casa");
  });

  it("wires swipe-to-rate handlers on the flashcard", () => {
    expect(VOCAB_PAGE_SOURCE).toMatch(/vocabSwipeRating\.js/);
    expect(VOCAB_PAGE_SOURCE).toMatch(/@pointerdown="onSwipePointerDown"/);
    expect(VOCAB_PAGE_SOURCE).toMatch(/reviewSwipeHint/);
    expect(VOCAB_PAGE_SOURCE).toMatch(/swipe-overlay-left/);
  });

  it("rates a card when the learner swipes right after flipping", async () => {
    const router = makeRouter();
    await router.push("/vocab/review");
    const wrapper = mount(VocabReviewPage, {
      global: { plugins: [router] },
    });
    await flushPromises();

    await wrapper.find(".flashcard").trigger("click");
    const card = wrapper.find(".flashcard");

    await card.trigger("pointerdown", { clientX: 100, clientY: 200 });
    await card.trigger("pointermove", { clientX: 190, clientY: 200 });
    await card.trigger("pointerup", { clientX: 190, clientY: 200 });
    await flushPromises();

    expect(vocabRatingFeedback.playVocabRatingFeedback).toHaveBeenCalledWith(2);
    expect(wrapper.text()).toContain("casa");
  });

  it("rates a card when the learner swipes left after flipping", async () => {
    const router = makeRouter();
    await router.push("/vocab/review");
    const wrapper = mount(VocabReviewPage, {
      global: { plugins: [router] },
    });
    await flushPromises();

    await wrapper.find(".flashcard").trigger("click");
    const card = wrapper.find(".flashcard");

    await card.trigger("pointerdown", { clientX: 200, clientY: 200 });
    await card.trigger("pointermove", { clientX: 110, clientY: 200 });
    await card.trigger("pointerup", { clientX: 110, clientY: 200 });
    await flushPromises();

    expect(vocabRatingFeedback.playVocabRatingFeedback).toHaveBeenCalledWith(1);
    expect(wrapper.text()).toContain("casa");
  });

  it("reveals definition on flip and enables mastery actions", async () => {
    const router = makeRouter();
    await router.push("/vocab/review");
    const wrapper = mount(VocabReviewPage, {
      global: { plugins: [router] },
    });
    await flushPromises();

    await wrapper.find(".flashcard").trigger("click");
    await flushPromises();

    expect(wrapper.text()).toContain("你好");
    expect(wrapper.find(".action-btn.primary").attributes("disabled")).toBeUndefined();
  });

  it("completes session after marking all words", async () => {
    const router = makeRouter();
    await router.push("/vocab/review");
    const wrapper = mount(VocabReviewPage, {
      global: { plugins: [router] },
    });
    await flushPromises();

    await wrapper.find(".flashcard").trigger("click");
    await wrapper.find(".review-footer .action-btn.primary").trigger("click");
    await flushPromises();

    await wrapper.find(".flashcard").trigger("click");
    await wrapper.find(".review-footer .action-btn.primary").trigger("click");
    await flushPromises();

    expect(wrapper.text()).toContain("复习完成");
    expect(
      mockInvoke.mock.calls.filter(([cmd]) => cmd === "update_word_mastery_cmd").length,
    ).toBe(2);
    expect(mockInvoke).toHaveBeenCalledWith("record_review_practice_cmd", {
      userId: "u1",
      itemsReviewed: 2,
      sessionComplete: true,
      targetLanguage: "es",
    });
    expect(wrapper.find(".streak-banner").text()).toContain("3 天连胜");
    expect(wrapper.text()).toContain("继续复习（还有 2 个）");
    expect(
      mockInvoke.mock.calls.filter(([cmd]) => cmd === "get_unknown_words_cmd").length,
    ).toBeGreaterThanOrEqual(2);
  });

  it("hides continue button when no more words are due", async () => {
    mockInvoke.mockImplementation((cmd, args) => {
      if (cmd === "get_unknown_words_cmd") {
        if (args?.limit === 50) return Promise.resolve([]);
        return Promise.resolve(MOCK_WORDS);
      }
      return defaultInvoke(cmd);
    });

    const router = makeRouter();
    await router.push("/vocab/review");
    const wrapper = mount(VocabReviewPage, {
      global: { plugins: [router] },
    });
    await flushPromises();

    await wrapper.find(".flashcard").trigger("click");
    await wrapper.find(".review-footer .action-btn.primary").trigger("click");
    await flushPromises();

    await wrapper.find(".flashcard").trigger("click");
    await wrapper.find(".review-footer .action-btn.primary").trigger("click");
    await flushPromises();

    expect(wrapper.text()).toContain("复习完成");
    expect(wrapper.text()).not.toContain("继续复习");
  });

  it("starts a new session when learner taps continue reviewing", async () => {
    let peekCount = 0;
    mockInvoke.mockImplementation((cmd, args) => {
      if (cmd === "get_unknown_words_cmd") {
        const limit = args?.limit ?? 5;
        if (limit === 50) {
          peekCount += 1;
          return Promise.resolve(peekCount === 1 ? MOCK_WORDS : []);
        }
        return Promise.resolve(MOCK_WORDS);
      }
      return defaultInvoke(cmd);
    });

    const router = makeRouter();
    await router.push("/vocab/review");
    const wrapper = mount(VocabReviewPage, {
      global: { plugins: [router] },
    });
    await flushPromises();

    await wrapper.find(".flashcard").trigger("click");
    await wrapper.find(".review-footer .action-btn.primary").trigger("click");
    await flushPromises();

    await wrapper.find(".flashcard").trigger("click");
    await wrapper.find(".review-footer .action-btn.primary").trigger("click");
    await flushPromises();

    const continueBtn = wrapper
      .findAll(".summary-actions .action-btn.primary")
      .find((btn) => btn.text().includes("继续复习"));
    expect(continueBtn).toBeTruthy();
    await continueBtn.trigger("click");
    await flushPromises();

    expect(wrapper.text()).toContain("hola");
    expect(wrapper.text()).toContain("1/2");
  });

  it("loads article review words from reading log when articleId query is set", async () => {
    mockInvoke.mockImplementation((cmd, args) => {
      if (cmd === "get_articles_reading_status_cmd") {
        return Promise.resolve([
          {
            article_id: Number(args.articleIds[0]),
            words_unknown: '["casa"]',
            unknown_count: 1,
            read_at: "2026-07-03 10:00:00",
            read_today: true,
          },
        ]);
      }
      if (cmd === "lookup_words_mastery_cmd") {
        return Promise.resolve([{ word: "casa", mastery: 1, word_id: 2 }]);
      }
      if (cmd === "get_unknown_words_cmd") {
        return Promise.resolve([
          { id: 2, word: "casa", mastery: 1, definition_zh: "房子", source: "news_reading" },
        ]);
      }
      return defaultInvoke(cmd, args);
    });

    const router = makeRouter();
    await router.push({ path: "/vocab/review", query: { from: "reading", articleId: "12" } });
    const wrapper = mount(VocabReviewPage, {
      global: { plugins: [router] },
    });
    await flushPromises();

    expect(wrapper.text()).toContain("casa");
    expect(wrapper.text()).toContain("1/1");
  });

  it("prioritizes reading-session words and shows highlighted context on flip", async () => {
    saveReadingSessionSummary({
      unknownCount: 1,
      words: [{ word: "casa", context: "Mi casa es grande.", articleId: 12 }],
    });
    mockInvoke.mockImplementation((cmd, args) => {
      if (cmd === "get_unknown_words_cmd") {
        return Promise.resolve([
          { id: 2, word: "casa", mastery: null, definition_zh: "房子", source: "news_reading" },
        ]);
      }
      return defaultInvoke(cmd, args);
    });

    const router = makeRouter();
    await router.push({ path: "/vocab/review", query: { from: "reading" } });
    const wrapper = mount(VocabReviewPage, {
      global: { plugins: [router] },
    });
    await flushPromises();

    expect(wrapper.text()).toContain("casa");
    expect(wrapper.text()).toContain("1/1");

    await wrapper.find(".flashcard").trigger("click");
    await flushPromises();

    expect(wrapper.text()).toContain("来自新闻阅读");
    expect(wrapper.find(".flashcard-context-mark").text()).toBe("casa");
    expect(wrapper.text()).toContain("Mi casa es grande.");
  });

  it("celebrates vocabulary milestone when session crosses a threshold", async () => {
    mockInvoke.mockImplementation((cmd) => {
      if (cmd === "get_user_vocab_stats_cmd") {
        return Promise.resolve({ total_known: 99, total_learning: 5, total: 1000 });
      }
      return defaultInvoke(cmd);
    });

    const router = makeRouter();
    await router.push("/vocab/review");
    const wrapper = mount(VocabReviewPage, {
      global: { plugins: [router] },
    });
    await flushPromises();

    await wrapper.find(".flashcard").trigger("click");
    await wrapper.find(".review-footer .action-btn.primary").trigger("click");
    await flushPromises();

    await wrapper.find(".flashcard").trigger("click");
    await wrapper.find(".review-footer .action-btn.primary").trigger("click");
    await flushPromises();

    expect(wrapper.find(".vocab-milestone-banner").text()).toContain("100 个单词");
  });
});