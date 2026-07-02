import { describe, expect, it } from "vitest";
import {
  REMAINING_PEEK_LIMIT,
  mistakeContinueLabelKey,
  remainingMistakeReviewCount,
  shouldOfferMistakeContinuation,
} from "../mistakeReviewContinuation.js";

describe("mistakeReviewContinuation", () => {
  it("offers continuation only when more mistakes are due", () => {
    expect(shouldOfferMistakeContinuation(0)).toBe(false);
    expect(shouldOfferMistakeContinuation(2)).toBe(true);
  });

  it("counts peeked mistakes for the continue prompt", () => {
    expect(remainingMistakeReviewCount([{ question_id: "q1" }])).toBe(1);
    expect(remainingMistakeReviewCount(null)).toBe(0);
  });

  it("uses capped label when peek limit is reached", () => {
    expect(mistakeContinueLabelKey(3)).toBe("path.mistakeReviewContinueRound");
    expect(mistakeContinueLabelKey(REMAINING_PEEK_LIMIT)).toBe("path.mistakeReviewContinueMore");
    expect(mistakeContinueLabelKey(99, 50)).toBe("path.mistakeReviewContinueMore");
  });
});