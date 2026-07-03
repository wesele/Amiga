import { describe, expect, it } from "vitest";
import {
  computeLearnNavBadge,
  computeModuleBadges,
  computeNavBadges,
  formatBadgeCount,
} from "../navAttention.js";

const resumeTarget = {
  section: {
    id: "zh-es/U01-PRACTICE",
    kind: "practice",
    question_count: 10,
    locked: false,
  },
};

describe("formatBadgeCount", () => {
  it("caps counts above 9", () => {
    expect(formatBadgeCount(10)).toBe("9+");
    expect(formatBadgeCount(3)).toBe("3");
    expect(formatBadgeCount(0)).toBe("");
  });
});

describe("computeLearnNavBadge", () => {
  it("returns hidden when there are no todos", () => {
    expect(computeLearnNavBadge({})).toEqual({
      show: false,
      count: 0,
      urgent: false,
      kind: null,
    });
  });

  it("counts due vocab and daily goal separately", () => {
    const badge = computeLearnNavBadge({
      dailyGoal: { target_lessons: 2, lessons_today: 1 },
      dueVocabCount: 5,
      localHour: 10,
    });
    expect(badge.show).toBe(true);
    expect(badge.count).toBe(2);
    expect(badge.urgent).toBe(false);
  });

  it("flags streak-at-risk as urgent", () => {
    const badge = computeLearnNavBadge({
      dailyGoal: {
        streak_current: 7,
        practiced_today: false,
        target_lessons: 2,
        lessons_today: 0,
      },
      localHour: 20,
    });
    expect(badge.show).toBe(true);
    expect(badge.urgent).toBe(true);
    expect(badge.kind).toBe("streakAtRisk");
  });

  it("includes pending vocab and continue-reading items", () => {
    const badge = computeLearnNavBadge({
      pendingVocab: { entries: [{ word: "hola", context: "Hola" }] },
      continueReadingArticle: {
        articleId: 1,
        title: "News",
        scrollPct: 40,
        remainingPct: 60,
      },
      localHour: 10,
    });
    expect(badge.count).toBe(2);
  });
});

describe("computeNavBadges", () => {
  it("hides learn badge when learn tab is active", () => {
    const badges = computeNavBadges(
      {
        dueVocabCount: 3,
        dailyGoal: { target_lessons: 2, lessons_today: 0 },
      },
      { activeTab: "learn" },
    );
    expect(badges.learn.show).toBe(false);
  });

  it("shows chat dot when pending practice is ready", () => {
    const badges = computeNavBadges({
      pendingAiPractice: { source: "reading", words: ["a", "b", "c"], at: Date.now() },
    });
    expect(badges.chat.show).toBe(true);
    expect(badges.chat.dotOnly).toBe(true);
  });

  it("hides chat badge on the chat tab", () => {
    const badges = computeNavBadges(
      {
        pendingAiPractice: { source: "reading", words: ["a", "b", "c"], at: Date.now() },
      },
      { activeTab: "chat" },
    );
    expect(badges.chat.show).toBe(false);
  });
});

describe("computeModuleBadges", () => {
  it("prefers resume badge over daily goal on path tile", () => {
    const badges = computeModuleBadges({
      resumeTarget,
      dailyGoal: { target_lessons: 2, lessons_today: 0 },
    });
    expect(badges.path.show).toBe(true);
    expect(badges.path.labelKey).toBe("learn.pathResumeBadge");
  });

  it("shows path todo badge when only the daily goal is unfinished", () => {
    const badges = computeModuleBadges({
      dailyGoal: { target_lessons: 2, lessons_today: 1 },
    });
    expect(badges.path.labelKey).toBe("learn.pathTodoBadge");
    expect(badges.path.labelParams).toEqual({ n: 1 });
  });

  it("shows vocab and news counts symmetrically", () => {
    const badges = computeModuleBadges({
      dueVocabCount: 4,
      newsUnreadCount: 2,
    });
    expect(badges.vocab.labelKey).toBe("learn.vocabDueBadge");
    expect(badges.vocab.labelParams).toEqual({ n: 4 });
    expect(badges.news.labelKey).toBe("learn.newsUnreadBadge");
    expect(badges.news.labelParams).toEqual({ n: 2 });
  });
});