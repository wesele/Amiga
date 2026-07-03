import { describe, expect, it } from "vitest";
import { FOCUS_IDS, pickLearningHubFocus, pickSecondarySuggestions } from "../learningHubFocus.js";

const resumeTarget = {
  section: {
    id: "zh-es/U01-PRACTICE",
    kind: "practice",
    title_native: "闯关练习",
  },
};

describe("learningHubFocus", () => {
  it("prioritizes streak at risk in the evening", () => {
    const focus = pickLearningHubFocus({
      dailyGoal: {
        streak_current: 12,
        practiced_today: false,
        goal_met: false,
        lessons_today: 0,
        target_lessons: 2,
      },
      resumeTarget,
      dueMistakes: 3,
      localHour: 21,
    });
    expect(focus.id).toBe(FOCUS_IDS.STREAK_AT_RISK);
    expect(focus.route.name).toBe("path-lesson");
  });

  it("routes streak-at-risk to mistake review when the daily goal is met", () => {
    const focus = pickLearningHubFocus({
      dailyGoal: {
        streak_current: 8,
        practiced_today: false,
        goal_met: true,
      },
      dueMistakes: 2,
      localHour: 20,
    });
    expect(focus.id).toBe(FOCUS_IDS.STREAK_AT_RISK);
    expect(focus.actionId).toBe(FOCUS_IDS.MISTAKE_REVIEW);
    expect(focus.route.name).toBe("path-mistake-review");
  });

  it("prefers continuing the current section when the daily goal is unfinished", () => {
    const focus = pickLearningHubFocus({
      dailyGoal: {
        goal_met: false,
        practiced_today: true,
        streak_current: 3,
      },
      resumeTarget,
      dueMistakes: 2,
      localHour: 10,
    });
    expect(focus.id).toBe(FOCUS_IDS.CONTINUE_SECTION);
    expect(focus.route.name).toBe("path-lesson");
  });

  it("surfaces due mistakes when no resume target is available", () => {
    const focus = pickLearningHubFocus({
      dailyGoal: { goal_met: true, practiced_today: true },
      dueMistakes: 4,
      localHour: 10,
    });
    expect(focus.id).toBe(FOCUS_IDS.MISTAKE_REVIEW);
    expect(focus.route.name).toBe("path-mistake-review");
  });

  it("surfaces vocab review when mistakes are cleared", () => {
    const focus = pickLearningHubFocus({
      dailyGoal: { goal_met: true, practiced_today: true },
      dueVocabWords: [{ word: "hola" }],
      localHour: 10,
    });
    expect(focus.id).toBe(FOCUS_IDS.VOCAB_REVIEW);
    expect(focus.route.name).toBe("vocab-review");
  });

  it("treats review credit as daily goal progress for remaining lessons", () => {
    const focus = pickLearningHubFocus({
      dailyGoal: {
        goal_met: false,
        lessons_today: 0,
        review_sessions_today: 1,
        effective_lessons_today: 1,
        target_lessons: 2,
      },
      localHour: 10,
    });
    expect(focus.id).toBe(FOCUS_IDS.DAILY_GOAL);
    expect(focus.remaining).toBe(1);
  });

  it("routes streak-at-risk to news when the daily goal is unfinished and articles are unread", () => {
    const focus = pickLearningHubFocus({
      dailyGoal: {
        streak_current: 12,
        practiced_today: false,
        goal_met: false,
        lessons_today: 0,
        target_lessons: 2,
      },
      newsUnreadCount: 3,
      localHour: 21,
    });
    expect(focus.id).toBe(FOCUS_IDS.STREAK_AT_RISK);
    expect(focus.actionId).toBe(FOCUS_IDS.READ_NEWS);
    expect(focus.route.name).toBe("news");
  });

  const pendingComprehensionArticle = {
    articleId: 9,
    title: "昨夜科技要闻",
    comprehensionSkipped: true,
    comprehensionScore: null,
    total: 2,
  };

  it("surfaces comprehension retake before mistakes when a pending article exists", () => {
    const focus = pickLearningHubFocus({
      dailyGoal: { goal_met: true, practiced_today: true },
      dueMistakes: 2,
      pendingComprehensionArticle,
      pendingComprehensionCount: 1,
      localHour: 10,
    });
    expect(focus.id).toBe(FOCUS_IDS.COMPREHENSION_RETAKE);
    expect(focus.route).toEqual({
      name: "reader",
      params: { id: 9 },
      query: { comprehensionRetake: "1" },
    });
    expect(focus.articleTitle).toBe("昨夜科技要闻");
  });

  it("keeps continue reading ahead of comprehension retake", () => {
    const focus = pickLearningHubFocus({
      dailyGoal: { goal_met: true, practiced_today: true },
      continueReadingArticle,
      pendingComprehensionArticle,
      pendingComprehensionCount: 2,
      localHour: 10,
    });
    expect(focus.id).toBe(FOCUS_IDS.CONTINUE_READING);
  });

  it("adds comprehension retake secondary when hero is elsewhere and count > 1", () => {
    const focus = pickLearningHubFocus({
      dailyGoal: { goal_met: true, practiced_today: true },
      dueMistakes: 2,
      localHour: 10,
    });
    const suggestions = pickSecondarySuggestions(
      {
        dueMistakes: 2,
        dueVocabWords: [],
        pendingComprehensionCount: 3,
        pendingComprehensionArticle,
      },
      focus,
    );
    expect(suggestions).toContainEqual({ type: "comprehensionRetake", count: 2 });
  });

  it("omits duplicate comprehension retake from secondary suggestions when it is the hero", () => {
    const focus = pickLearningHubFocus({
      dailyGoal: { goal_met: true, practiced_today: true },
      pendingComprehensionArticle,
      pendingComprehensionCount: 2,
      localHour: 10,
    });
    const suggestions = pickSecondarySuggestions(
      {
        pendingComprehensionCount: 2,
        pendingComprehensionArticle,
        dueMistakes: 0,
        dueVocabWords: [],
      },
      focus,
    );
    expect(suggestions.some((item) => item.type === "comprehensionRetake")).toBe(false);
  });

  it("falls back to explore path when everything is complete", () => {
    const focus = pickLearningHubFocus({
      dailyGoal: { goal_met: true, practiced_today: true },
      localHour: 10,
    });
    expect(focus.id).toBe(FOCUS_IDS.EXPLORE_PATH);
    expect(focus.route.name).toBe("path");
  });

  const continueReadingArticle = {
    articleId: 42,
    title: "今日科技要闻",
    scrollPct: 65,
    remainingPct: 35,
  };

  it("surfaces continue reading as hero focus when a valid in-progress article exists", () => {
    const focus = pickLearningHubFocus({
      dailyGoal: { goal_met: true, practiced_today: true },
      continueReadingArticle,
      localHour: 10,
    });
    expect(focus.id).toBe(FOCUS_IDS.CONTINUE_READING);
    expect(focus.route).toEqual({ name: "reader", params: { id: 42 } });
    expect(focus.articleTitle).toBe("今日科技要闻");
    expect(focus.remainingPct).toBe(35);
  });

  it("keeps lesson resume ahead of continue reading when the daily goal is unfinished", () => {
    const focus = pickLearningHubFocus({
      dailyGoal: { goal_met: false, practiced_today: true, streak_current: 3 },
      resumeTarget,
      continueReadingArticle,
      localHour: 10,
    });
    expect(focus.id).toBe(FOCUS_IDS.CONTINUE_SECTION);
  });

  it("routes streak-at-risk to continue reading when no lesson resume is available", () => {
    const focus = pickLearningHubFocus({
      dailyGoal: {
        streak_current: 12,
        practiced_today: false,
        goal_met: false,
        lessons_today: 0,
        target_lessons: 2,
      },
      continueReadingArticle,
      newsUnreadCount: 3,
      localHour: 21,
    });
    expect(focus.id).toBe(FOCUS_IDS.STREAK_AT_RISK);
    expect(focus.actionId).toBe(FOCUS_IDS.CONTINUE_READING);
    expect(focus.route).toEqual({ name: "reader", params: { id: 42 } });
    expect(focus.articleTitle).toBe("今日科技要闻");
  });

  it("prefers explore path over continue reading only when no valid candidate exists", () => {
    const focus = pickLearningHubFocus({
      dailyGoal: { goal_met: true, practiced_today: true },
      continueReadingArticle: {
        articleId: 1,
        title: "刚点开",
        scrollPct: 2,
        remainingPct: 98,
      },
      localHour: 10,
    });
    expect(focus.id).toBe(FOCUS_IDS.EXPLORE_PATH);
  });

  it("omits duplicate continue reading from secondary suggestions when it is the hero focus", () => {
    const focus = pickLearningHubFocus({
      dailyGoal: { goal_met: true, practiced_today: true },
      continueReadingArticle,
      localHour: 10,
    });
    const suggestions = pickSecondarySuggestions(
      { continueReadingArticle, dueMistakes: 0, dueVocabWords: [] },
      focus,
    );
    expect(suggestions.some((item) => item.type === "continueReading")).toBe(false);
  });

  it("omits duplicate continue reading when streak hero already points to it", () => {
    const focus = pickLearningHubFocus({
      dailyGoal: {
        streak_current: 12,
        practiced_today: false,
        goal_met: false,
      },
      continueReadingArticle,
      localHour: 21,
    });
    const suggestions = pickSecondarySuggestions(
      { continueReadingArticle, dueMistakes: 0, dueVocabWords: [] },
      focus,
    );
    expect(suggestions.some((item) => item.type === "continueReading")).toBe(false);
  });
});