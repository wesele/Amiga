import { describe, expect, it } from "vitest";
import { mistakeReviewCount, shouldShowMistakeReview } from "../mistakeReviewCard.js";

describe("mistakeReviewCard", () => {
  it("shows the card only when due mistakes exist", () => {
    expect(shouldShowMistakeReview(0)).toBe(false);
    expect(shouldShowMistakeReview(3)).toBe(true);
  });

  it("normalizes the displayed count", () => {
    expect(mistakeReviewCount(4)).toBe(4);
    expect(mistakeReviewCount(undefined)).toBe(0);
  });
});