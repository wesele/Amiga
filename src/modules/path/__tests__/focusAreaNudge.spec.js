import { describe, it, expect } from "vitest";
import { shouldShowFocusAreaNudge } from "../focusAreaNudge.js";

describe("focusAreaNudge", () => {
  const focusArea = { typeId: "T05", accuracyPct: 62, attempts: 8 };

  it("shows nudge when a focus area exists and no higher-priority nudge is active", () => {
    expect(
      shouldShowFocusAreaNudge(
        { passed: true },
        {
          focusArea,
          dailyGoalNudgeActive: false,
          mistakeReviewNudgeActive: false,
          vocabReviewNudgeActive: false,
        },
      ),
    ).toBe(true);
  });

  it("hides nudge when the lesson failed", () => {
    expect(
      shouldShowFocusAreaNudge(
        { passed: false },
        { focusArea },
      ),
    ).toBe(false);
  });

  it("hides nudge when daily goal nudge is active", () => {
    expect(
      shouldShowFocusAreaNudge(
        { passed: true },
        { focusArea, dailyGoalNudgeActive: true },
      ),
    ).toBe(false);
  });

  it("hides nudge when mistake review nudge is active", () => {
    expect(
      shouldShowFocusAreaNudge(
        { passed: true },
        { focusArea, mistakeReviewNudgeActive: true },
      ),
    ).toBe(false);
  });

  it("hides nudge when vocab review nudge is active", () => {
    expect(
      shouldShowFocusAreaNudge(
        { passed: true },
        { focusArea, vocabReviewNudgeActive: true },
      ),
    ).toBe(false);
  });

  it("hides nudge when no focus area qualifies", () => {
    expect(
      shouldShowFocusAreaNudge(
        { passed: true },
        { focusArea: null },
      ),
    ).toBe(false);
  });
});