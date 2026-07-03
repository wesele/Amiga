import { describe, expect, it } from "vitest";
import {
  VOCAB_REVIEW_SCHEDULE_MASTERED_KEY,
  VOCAB_REVIEW_SCHEDULE_PRIORITY_KEY,
  VOCAB_REVIEW_SCHEDULE_REINFORCED_KEY,
  vocabDisplayDotStates,
  vocabDisplayLevel,
  vocabDisplayStageLabel,
  vocabDotStates,
  vocabJustFilledDotIndex,
  vocabRatingFeedback,
  vocabRatingFeedbackKey,
  vocabStageLabel,
  vocabStageNumber,
  vocabStageProgress,
} from "../vocabReviewMastery.js";

const t = (key, params) => {
  if (key === "vocab.reviewMasteryStage") {
    return `stage ${params.stage}/${params.total}`;
  }
  if (key === "vocab.reviewSchedulePriority") return "priority";
  if (key === "vocab.reviewScheduleMastered") return "mastered";
  if (key === "vocab.reviewScheduleReinforced") return "reinforced";
  return key;
};

describe("vocabReviewMastery", () => {
  it("maps mastery values to 1-based stage numbers", () => {
    expect(vocabStageNumber(null)).toBe(1);
    expect(vocabStageNumber(0)).toBe(1);
    expect(vocabStageNumber(1)).toBe(2);
    expect(vocabStageNumber(2)).toBe(3);
    expect(vocabStageNumber(99)).toBe(3);
  });

  it("builds stage progress for display", () => {
    expect(vocabStageProgress(null)).toEqual({
      stage: 1,
      total: 3,
      progress_pct: 33,
    });
    expect(vocabStageProgress(1)).toEqual({
      stage: 2,
      total: 3,
      progress_pct: 67,
    });
    expect(vocabStageProgress(2)).toEqual({
      stage: 3,
      total: 3,
      progress_pct: 100,
    });
  });

  it("renders dot states for the compact mastery row", () => {
    expect(vocabDotStates(null)).toEqual([true, false, false]);
    expect(vocabDotStates(1)).toEqual([true, true, false]);
    expect(vocabDotStates(2)).toEqual([true, true, true]);
  });

  it("keeps stage on still learning and previews mastered on got it", () => {
    expect(vocabDisplayLevel(0)).toBe(0);
    expect(vocabDisplayLevel(0, { ratedMastery: 1 })).toBe(0);
    expect(vocabDisplayLevel(1, { ratedMastery: 1 })).toBe(1);
    expect(vocabDisplayLevel(0, { ratedMastery: 2 })).toBe(2);
    expect(vocabDisplayLevel(1, { ratedMastery: 2 })).toBe(2);
    expect(vocabDisplayDotStates(0, { ratedMastery: 2 })).toEqual([
      true,
      true,
      true,
    ]);
  });

  it("identifies the last dot as just filled after got it", () => {
    expect(vocabJustFilledDotIndex(0)).toBe(-1);
    expect(vocabJustFilledDotIndex(0, { ratedMastery: 1 })).toBe(-1);
    expect(vocabJustFilledDotIndex(0, { ratedMastery: 2 })).toBe(2);
    expect(vocabJustFilledDotIndex(1, { ratedMastery: 2 })).toBe(2);
    expect(vocabJustFilledDotIndex(2, { ratedMastery: 2 })).toBe(-1);
  });

  it("selects schedule feedback keys from mastery and rating", () => {
    expect(vocabRatingFeedbackKey(0, 1)).toBe(VOCAB_REVIEW_SCHEDULE_PRIORITY_KEY);
    expect(vocabRatingFeedbackKey(1, 1)).toBe(VOCAB_REVIEW_SCHEDULE_PRIORITY_KEY);
    expect(vocabRatingFeedbackKey(0, 2)).toBe(VOCAB_REVIEW_SCHEDULE_MASTERED_KEY);
    expect(vocabRatingFeedbackKey(1, 2)).toBe(VOCAB_REVIEW_SCHEDULE_MASTERED_KEY);
    expect(vocabRatingFeedbackKey(2, 2)).toBe(VOCAB_REVIEW_SCHEDULE_REINFORCED_KEY);
  });

  it("formats learner-facing stage labels and schedule feedback", () => {
    expect(vocabStageLabel(1, t)).toBe("stage 2/3");
    expect(vocabDisplayStageLabel(0, t, { ratedMastery: 2 })).toBe("stage 3/3");
    expect(vocabRatingFeedback(1, 1, t)).toBe("priority");
    expect(vocabRatingFeedback(1, 2, t)).toBe("mastered");
    expect(vocabRatingFeedback(2, 2, t)).toBe("reinforced");
  });
});