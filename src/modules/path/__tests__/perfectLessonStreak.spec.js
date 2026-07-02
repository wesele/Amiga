import { describe, expect, it } from "vitest";
import {
  PERFECT_LESSON_MILESTONES,
  perfectLessonMilestoneKey,
  shouldShowPerfectStreakCard,
} from "../perfectLessonStreak.js";

describe("perfectLessonMilestoneKey", () => {
  it("maps milestone counts to i18n keys", () => {
    for (const days of PERFECT_LESSON_MILESTONES) {
      expect(perfectLessonMilestoneKey(days)).toBe(`path.perfectLessonStreak${days}`);
    }
  });
});

describe("shouldShowPerfectStreakCard", () => {
  it("shows the card when the learner has an active perfect streak", () => {
    expect(shouldShowPerfectStreakCard(1)).toBe(true);
    expect(shouldShowPerfectStreakCard(5)).toBe(true);
  });

  it("hides the card when streak is zero or missing", () => {
    expect(shouldShowPerfectStreakCard(0)).toBe(false);
    expect(shouldShowPerfectStreakCard(null)).toBe(false);
    expect(shouldShowPerfectStreakCard(undefined)).toBe(false);
  });
});