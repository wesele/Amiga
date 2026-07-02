import { describe, it, expect } from "vitest";
import {
  buildAchievements,
  buildLessonAchievements,
  buildMistakeAchievements,
  buildPerfectAchievements,
  buildStreakAchievements,
  buildVocabAchievements,
  isMilestoneUnlocked,
  shouldShowAchievements,
} from "../achievements.js";

describe("achievements", () => {
  it("unlocks milestones when the learner meets the threshold", () => {
    expect(isMilestoneUnlocked(10, 9)).toBe(false);
    expect(isMilestoneUnlocked(10, 10)).toBe(true);
    expect(isMilestoneUnlocked(10, null)).toBe(false);
  });

  it("builds lesson achievements from completed count", () => {
    const items = buildLessonAchievements(25);
    expect(items).toHaveLength(6);
    expect(items.filter((item) => item.unlocked).map((item) => item.threshold)).toEqual([
      10, 25,
    ]);
    expect(items[0]).toMatchObject({
      id: "lessons-10",
      category: "lessons",
      icon: "🏆",
      labelKey: "profile.achievementLesson",
    });
  });

  it("builds perfect-lesson achievements from best streak", () => {
    const items = buildPerfectAchievements(5);
    expect(items.filter((item) => item.unlocked).map((item) => item.threshold)).toEqual([
      3, 5,
    ]);
  });

  it("builds streak achievements from longest streak", () => {
    const items = buildStreakAchievements(14);
    expect(items.filter((item) => item.unlocked).map((item) => item.threshold)).toEqual([
      7, 14,
    ]);
  });

  it("builds vocabulary achievements from mastered word count", () => {
    const items = buildVocabAchievements(250);
    expect(items).toHaveLength(3);
    expect(items.filter((item) => item.unlocked).map((item) => item.threshold)).toEqual([
      100,
    ]);
    expect(items[0]).toMatchObject({
      id: "vocab-100",
      category: "vocab",
      icon: "📚",
      labelKey: "profile.achievementVocab",
    });
  });

  it("builds mistake-review achievements from mastered mistake count", () => {
    const items = buildMistakeAchievements(30);
    expect(items).toHaveLength(4);
    expect(items.filter((item) => item.unlocked).map((item) => item.threshold)).toEqual([
      10, 25,
    ]);
    expect(items[0]).toMatchObject({
      id: "mistakes-10",
      category: "mistakes",
      icon: "🔁",
      labelKey: "profile.achievementMistake",
    });
  });

  it("aggregates all achievement tracks", () => {
    const result = buildAchievements({
      lessonProgress: { completed: 50 },
      perfectStreak: { current: 2, best: 3 },
      learningStreak: { current: 8, longest: 30 },
      vocabStats: { total_known: 150 },
      mistakeMastery: { mastered: 12 },
    });
    expect(result.totalCount).toBe(22);
    expect(result.unlockedCount).toBe(9);
    expect(shouldShowAchievements(result)).toBe(true);
  });

  it("always exposes the achievement grid when tracks exist", () => {
    expect(shouldShowAchievements(buildAchievements())).toBe(true);
  });
});