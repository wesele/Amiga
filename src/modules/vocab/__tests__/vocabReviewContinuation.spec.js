import { describe, expect, it } from "vitest";
import {
  REMAINING_PEEK_LIMIT,
  remainingVocabReviewCount,
  shouldOfferVocabContinuation,
  vocabContinueLabelKey,
} from "../vocabReviewContinuation.js";

describe("vocabReviewContinuation", () => {
  it("offers continuation only when more words are due", () => {
    expect(shouldOfferVocabContinuation(0)).toBe(false);
    expect(shouldOfferVocabContinuation(3)).toBe(true);
  });

  it("counts peeked words for the continue prompt", () => {
    expect(remainingVocabReviewCount([{ id: 1 }, { id: 2 }])).toBe(2);
    expect(remainingVocabReviewCount(null)).toBe(0);
  });

  it("uses capped label when peek limit is reached", () => {
    expect(vocabContinueLabelKey(12)).toBe("vocab.reviewContinue");
    expect(vocabContinueLabelKey(REMAINING_PEEK_LIMIT)).toBe("vocab.reviewContinueMore");
    expect(vocabContinueLabelKey(99, 50)).toBe("vocab.reviewContinueMore");
  });
});