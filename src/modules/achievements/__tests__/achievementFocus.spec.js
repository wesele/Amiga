import { describe, it, expect } from "vitest";
import { buildAchievements } from "../achievements.js";
import { pickNextAchievementFocus } from "../achievementFocus.js";

function baseItems() {
  return buildAchievements({
    lessonProgress: { completed: 18 },
    perfectStreak: { best: 2 },
    learningStreak: { current: 5, longest: 5 },
    vocabStats: { total_known: 80 },
    mistakeMastery: { mastered: 3 },
    comboBest: 2,
    accuracyBest: 65,
  }).items;
}

describe("pickNextAchievementFocus", () => {
  it("returns null when all categories are fully unlocked", () => {
    const items = buildAchievements({
      lessonProgress: { completed: 500 },
      perfectStreak: { best: 10 },
      learningStreak: { current: 365, longest: 365 },
      vocabStats: { total_known: 1000 },
      mistakeMastery: { mastered: 100 },
      comboBest: 10,
      accuracyBest: 95,
    }).items;
    const focus = pickNextAchievementFocus(
      {
        lesson: { completed: 500, next_milestone: null, progress_pct: 100 },
        perfect: { best: 10, next_milestone: 10, progress_pct: 100, all_unlocked: true },
        streak: { current: 365, longest: 365, next_milestone: 365, progress_pct: 100, all_unlocked: true },
        vocab: { known: 1000, next_milestone: null, progress_pct: 100 },
        mistake: { mastered: 100, next_milestone: null, progress_pct: 100 },
        combo: { best: 10, next_milestone: 10, progress_pct: 100, all_unlocked: true },
        accuracy: { best: 95, next_milestone: 95, progress_pct: 100, all_unlocked: true },
      },
      items,
    );
    expect(focus).toBeNull();
  });

  it("picks the category with the highest progress_pct", () => {
    const items = baseItems();
    const focus = pickNextAchievementFocus(
      {
        lesson: { completed: 18, next_milestone: 25, progress_pct: 53 },
        perfect: { best: 2, next_milestone: 3, progress_pct: 67, all_unlocked: false },
        streak: { current: 5, longest: 5, next_milestone: 7, progress_pct: 71, all_unlocked: false },
        vocab: { known: 80, next_milestone: 100, progress_pct: 80 },
        mistake: { mastered: 3, next_milestone: 10, progress_pct: 30 },
        combo: { best: 2, next_milestone: 3, progress_pct: 50, all_unlocked: false },
        accuracy: { best: 65, next_milestone: 70, progress_pct: 50, all_unlocked: false },
      },
      items,
    );
    expect(focus?.category).toBe("vocab");
    expect(focus?.target).toBe(100);
    expect(focus?.remaining).toBe(20);
  });

  it("breaks ties using category priority", () => {
    const items = baseItems();
    const focus = pickNextAchievementFocus(
      {
        lesson: { completed: 8, next_milestone: 10, progress_pct: 80 },
        perfect: { best: 2, next_milestone: 3, progress_pct: 80, all_unlocked: false },
        streak: { current: 5, longest: 5, next_milestone: 7, progress_pct: 80, all_unlocked: false },
        vocab: { known: 80, next_milestone: 100, progress_pct: 80 },
        mistake: { mastered: 8, next_milestone: 10, progress_pct: 80 },
        combo: { best: 2, next_milestone: 3, progress_pct: 80, all_unlocked: false },
        accuracy: { best: 68, next_milestone: 70, progress_pct: 80, all_unlocked: false },
      },
      items,
    );
    expect(focus?.category).toBe("lessons");
  });

  it("still picks a focus when progress_pct is zero", () => {
    const items = baseItems();
    const focus = pickNextAchievementFocus(
      {
        lesson: { completed: 0, next_milestone: 10, progress_pct: 0 },
        perfect: { best: 0, next_milestone: 3, progress_pct: 0, all_unlocked: false },
        streak: { current: 0, longest: 0, next_milestone: 7, progress_pct: 0, all_unlocked: false },
        vocab: { known: 0, next_milestone: 100, progress_pct: 0 },
        mistake: { mastered: 0, next_milestone: 10, progress_pct: 0 },
        combo: { best: 0, next_milestone: 3, progress_pct: 0, all_unlocked: false },
        accuracy: { best: 0, next_milestone: 70, progress_pct: 0, all_unlocked: false },
      },
      items,
    );
    expect(focus?.category).toBe("lessons");
    expect(focus?.route).toEqual({ name: "path" });
  });
});