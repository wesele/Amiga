import { describe, expect, it } from "vitest";
import {
  MICRO_REVIEW_LIMIT,
  MICRO_REVIEW_THRESHOLD,
  buildMicroReviewQueue,
  microReviewNudgeCopy,
  shouldOfferMicroReview,
} from "../readingMicroReview.js";

describe("readingMicroReview", () => {
  it("offers micro review at the threshold when not dismissed or completed", () => {
    expect(
      shouldOfferMicroReview({
        sessionWordCount: MICRO_REVIEW_THRESHOLD,
        sheetDismissed: false,
        sheetCompleted: false,
      }),
    ).toBe(true);
    expect(
      shouldOfferMicroReview({
        sessionWordCount: MICRO_REVIEW_THRESHOLD - 1,
      }),
    ).toBe(false);
    expect(
      shouldOfferMicroReview({
        sessionWordCount: 5,
        sheetDismissed: true,
      }),
    ).toBe(false);
    expect(
      shouldOfferMicroReview({
        sessionWordCount: 5,
        sheetCompleted: true,
      }),
    ).toBe(false);
  });

  it("builds a capped micro-review queue", () => {
    const sessionWords = [
      { word: "alpha", context: "Alpha ctx" },
      { word: "beta", context: "Beta ctx" },
      { word: "gamma", context: "Gamma ctx" },
      { word: "delta", context: "Delta ctx" },
      { word: "epsilon", context: "Epsilon ctx" },
      { word: "zeta", context: "Zeta ctx" },
    ];
    const dueWords = [{ id: 9, word: "omega", mastery: 1 }];
    const queue = buildMicroReviewQueue(sessionWords, dueWords);
    expect(queue).toHaveLength(MICRO_REVIEW_LIMIT);
    expect(queue.map((entry) => entry.word)).toEqual([
      "alpha",
      "beta",
      "gamma",
      "delta",
      "epsilon",
    ]);
  });

  it("returns nudge copy between nudge and offer thresholds", () => {
    const t = (key, params) => `${key}:${params.n}:${params.remaining}`;
    expect(microReviewNudgeCopy(1, t)).toBeNull();
    expect(microReviewNudgeCopy(2, t)).toBe("news.microReviewNudge:2:1");
    expect(microReviewNudgeCopy(3, t)).toBeNull();
  });
});