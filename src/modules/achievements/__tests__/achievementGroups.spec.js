import { describe, it, expect } from "vitest";
import { buildAchievements } from "../achievements.js";
import { groupAchievements, ACHIEVEMENT_CATEGORIES } from "../achievementGroups.js";

describe("groupAchievements", () => {
  it("groups badges by category with unlocked counts", () => {
    const { items } = buildAchievements({
      lessonProgress: { completed: 25 },
      learningStreak: { current: 14, longest: 14 },
    });
    const groups = groupAchievements(items);
    expect(groups).toHaveLength(ACHIEVEMENT_CATEGORIES.length);
    const lessons = groups.find((group) => group.category.id === "lessons");
    expect(lessons.unlocked).toBe(2);
    expect(lessons.total).toBe(6);
    expect(lessons.badges).toHaveLength(6);
  });
});