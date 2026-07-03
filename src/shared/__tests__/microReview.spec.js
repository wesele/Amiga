import { describe, expect, it } from "vitest";
import {
  MICRO_REVIEW_THRESHOLD,
  microReviewNudgeCopy,
  shouldOfferMicroReview,
} from "../microReview.js";

describe("shared microReview", () => {
  const t = (key, params) => `${key}:${params.n}:${params.remaining ?? ""}`;

  it("microReviewNudgeCopy supports custom nudge keys", () => {
    expect(microReviewNudgeCopy(2, t, "path.microReviewNudge")).toBe(
      "path.microReviewNudge:2:1",
    );
    expect(microReviewNudgeCopy(3, t, "path.microReviewNudge")).toBeNull();
  });

  it("shouldOfferMicroReview blocks completed sheets", () => {
    expect(
      shouldOfferMicroReview({
        sessionWordCount: MICRO_REVIEW_THRESHOLD,
        sheetCompleted: true,
      }),
    ).toBe(false);
  });
});