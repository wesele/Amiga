import { describe, it, expect } from "vitest";
import {
  mistakeReviewNudgeCount,
  shouldShowMistakeReviewNudge,
} from "../mistakeReviewNudge.js";

describe("mistakeReviewNudge", () => {
  it("shows nudge when due mistakes existed before the lesson and daily goal is met", () => {
    expect(
      shouldShowMistakeReviewNudge(
        { passed: true },
        { dueAtStart: 3, dailyGoalNudgeActive: false },
      ),
    ).toBe(true);
  });

  it("hides nudge while the daily goal nudge is still active", () => {
    expect(
      shouldShowMistakeReviewNudge(
        { passed: true },
        { dueAtStart: 2, dailyGoalNudgeActive: true },
      ),
    ).toBe(false);
  });

  it("hides nudge when no mistakes were due before the lesson", () => {
    expect(
      shouldShowMistakeReviewNudge(
        { passed: true },
        { dueAtStart: 0, dailyGoalNudgeActive: false },
      ),
    ).toBe(false);
    expect(shouldShowMistakeReviewNudge({ passed: false }, { dueAtStart: 4 })).toBe(
      false,
    );
  });

  it("returns a non-negative due count for the banner", () => {
    expect(mistakeReviewNudgeCount(5)).toBe(5);
    expect(mistakeReviewNudgeCount(-1)).toBe(0);
    expect(mistakeReviewNudgeCount("bad")).toBe(0);
  });
});