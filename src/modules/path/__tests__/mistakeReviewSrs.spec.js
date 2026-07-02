import { describe, expect, it } from "vitest";
import {
  SRS_MASTERED_KEY,
  SRS_NEXT_DAY_KEY,
  SRS_NEXT_DAYS_KEY,
  srsCorrectFeedback,
  srsCorrectFeedbackKey,
  srsDisplayDotStates,
  srsDisplayLevel,
  srsDisplayStageLabel,
  srsDotStates,
  srsIntervalDaysAfterCorrect,
  srsJustFilledDotIndex,
  srsStageLabel,
  srsStageNumber,
  srsStageProgress,
} from "../mistakeReviewSrs.js";

const t = (key, params) => {
  if (key === "path.mistakeReviewSrsStage") {
    return `stage ${params.stage}/${params.total}`;
  }
  if (key === "path.mistakeReviewSrsNextDays") {
    return `in ${params.n} days`;
  }
  if (key === "path.mistakeReviewSrsNextDay") return "in 1 day";
  if (key === "path.mistakeReviewSrsMastered") return "mastered";
  return key;
};

describe("mistakeReviewSrs", () => {
  it("maps SRS levels to 1-based stage numbers", () => {
    expect(srsStageNumber(0)).toBe(1);
    expect(srsStageNumber(2)).toBe(3);
    expect(srsStageNumber(99)).toBe(4);
    expect(srsStageNumber(-1)).toBe(1);
  });

  it("builds stage progress for milestone-style displays", () => {
    expect(srsStageProgress(0)).toEqual({
      stage: 1,
      total: 4,
      progress_pct: 25,
    });
    expect(srsStageProgress(3)).toEqual({
      stage: 4,
      total: 4,
      progress_pct: 100,
    });
  });

  it("renders dot states for the compact mastery row", () => {
    expect(srsDotStates(0)).toEqual([true, false, false, false]);
    expect(srsDotStates(2)).toEqual([true, true, true, false]);
    expect(srsDotStates(3)).toEqual([true, true, true, true]);
  });

  it("returns the next review interval after a correct answer", () => {
    expect(srsIntervalDaysAfterCorrect(0)).toBe(1);
    expect(srsIntervalDaysAfterCorrect(1)).toBe(3);
    expect(srsIntervalDaysAfterCorrect(2)).toBe(7);
    expect(srsIntervalDaysAfterCorrect(3)).toBeNull();
  });

  it("selects feedback keys based on the post-review schedule", () => {
    expect(srsCorrectFeedbackKey(0)).toBe(SRS_NEXT_DAY_KEY);
    expect(srsCorrectFeedbackKey(1)).toBe(SRS_NEXT_DAYS_KEY);
    expect(srsCorrectFeedbackKey(2)).toBe(SRS_NEXT_DAYS_KEY);
    expect(srsCorrectFeedbackKey(3)).toBe(SRS_MASTERED_KEY);
  });

  it("formats learner-facing stage labels and schedule feedback", () => {
    expect(srsStageLabel(1, t)).toBe("stage 2/4");
    expect(srsCorrectFeedback(0, t)).toBe("in 1 day");
    expect(srsCorrectFeedback(1, t)).toBe("in 3 days");
    expect(srsCorrectFeedback(3, t)).toBe("mastered");
  });

  it("previews the next SRS stage after a correct answer", () => {
    expect(srsDisplayLevel(0)).toBe(0);
    expect(srsDisplayLevel(0, { answeredCorrect: true })).toBe(1);
    expect(srsDisplayDotStates(0, { answeredCorrect: true })).toEqual([
      true,
      true,
      false,
      false,
    ]);
    expect(srsDisplayStageLabel(0, t, { answeredCorrect: true })).toBe("stage 2/4");
  });

  it("identifies which mastery dot just filled on a correct answer", () => {
    expect(srsJustFilledDotIndex(0)).toBe(-1);
    expect(srsJustFilledDotIndex(0, { answeredCorrect: true })).toBe(1);
    expect(srsJustFilledDotIndex(2, { answeredCorrect: true })).toBe(3);
    expect(srsJustFilledDotIndex(3, { answeredCorrect: true })).toBe(-1);
  });
});