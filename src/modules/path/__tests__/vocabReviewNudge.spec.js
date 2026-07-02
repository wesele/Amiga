import { describe, it, expect } from "vitest";
import {
  shouldShowVocabReviewNudge,
  vocabReviewNudgeCount,
} from "../vocabReviewNudge.js";

describe("vocabReviewNudge", () => {
  it("shows nudge when due vocab existed before the lesson and higher-priority nudges are inactive", () => {
    expect(
      shouldShowVocabReviewNudge(
        { passed: true },
        {
          dueAtStart: 4,
          dailyGoalNudgeActive: false,
          mistakeReviewNudgeActive: false,
        },
      ),
    ).toBe(true);
  });

  it("hides nudge while the daily goal nudge is still active", () => {
    expect(
      shouldShowVocabReviewNudge(
        { passed: true },
        {
          dueAtStart: 3,
          dailyGoalNudgeActive: true,
          mistakeReviewNudgeActive: false,
        },
      ),
    ).toBe(false);
  });

  it("hides nudge while the mistake review nudge is still active", () => {
    expect(
      shouldShowVocabReviewNudge(
        { passed: true },
        {
          dueAtStart: 3,
          dailyGoalNudgeActive: false,
          mistakeReviewNudgeActive: true,
        },
      ),
    ).toBe(false);
  });

  it("hides nudge when no vocabulary was due before the lesson", () => {
    expect(
      shouldShowVocabReviewNudge(
        { passed: true },
        { dueAtStart: 0, dailyGoalNudgeActive: false, mistakeReviewNudgeActive: false },
      ),
    ).toBe(false);
    expect(
      shouldShowVocabReviewNudge({ passed: false }, { dueAtStart: 4 }),
    ).toBe(false);
  });

  it("returns a non-negative due count for the banner", () => {
    expect(vocabReviewNudgeCount(5)).toBe(5);
    expect(vocabReviewNudgeCount(-1)).toBe(0);
    expect(vocabReviewNudgeCount("bad")).toBe(0);
  });
});