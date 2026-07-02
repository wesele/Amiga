import { describe, it, expect } from "vitest";
import {
  buildAchievements,
  buildLessonAchievements,
  buildPerfectAchievements,
  buildStreakAchievements,
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

  it("aggregates all achievement tracks", () => {
    const result = buildAchievements({
      lessonProgress: { completed: 50 },
      perfectStreak: { current: 2, best: 3 },
      learningStreak: { current: 8, longest: 30 },
    });
    expect(result.totalCount).toBe(15);
    expect(result.unlockedCount).toBe(7);
    expect(shouldShowAchievements(result)).toBe(true);
  });

  it("always exposes the achievement grid when tracks exist", () => {
    expect(shouldShowAchievements(buildAchievements())).toBe(true);
  });
});