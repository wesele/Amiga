import { describe, expect, it } from "vitest";
import {
  VOCAB_SWIPE_COMMIT_PX,
  canSwipeToRate,
  isVocabSwipeTap,
  shouldAbortVocabSwipe,
  vocabSwipeDragStyle,
  vocabSwipeHintOpacity,
  vocabSwipeRating,
} from "../vocabSwipeRating.js";

describe("vocabSwipeRating", () => {
  it("only allows swipe when the card is flipped and idle", () => {
    expect(canSwipeToRate({ flipped: false })).toBe(false);
    expect(canSwipeToRate({ flipped: true })).toBe(true);
    expect(canSwipeToRate({ flipped: true, acting: true })).toBe(false);
    expect(canSwipeToRate({ flipped: true, ratingAck: "positive" })).toBe(false);
  });

  it("commits got it on right swipe and still learning on left swipe", () => {
    expect(vocabSwipeRating(VOCAB_SWIPE_COMMIT_PX - 1)).toBeNull();
    expect(vocabSwipeRating(VOCAB_SWIPE_COMMIT_PX)).toBe("got_it");
    expect(vocabSwipeRating(-VOCAB_SWIPE_COMMIT_PX)).toBe("still_learning");
  });

  it("clamps drag transform and tilts toward the swipe direction", () => {
    expect(vocabSwipeDragStyle(40).transform).toContain("translateX(40px)");
    expect(vocabSwipeDragStyle(40).transform).toMatch(/rotate\([\d.]+deg\)/);
    expect(vocabSwipeDragStyle(200).transform).toContain("translateX(110px)");
    expect(vocabSwipeDragStyle(-200).transform).toContain("translateX(-110px)");
  });

  it("ramps hint opacity as the learner drags toward a rating", () => {
    expect(vocabSwipeHintOpacity(0)).toEqual({ stillLearning: 0, gotIt: 0 });
    expect(vocabSwipeHintOpacity(36).gotIt).toBeCloseTo(0.5, 2);
    expect(vocabSwipeHintOpacity(-72).stillLearning).toBe(1);
    expect(vocabSwipeHintOpacity(72).gotIt).toBe(1);
  });

  it("aborts swipe when vertical movement dominates", () => {
    expect(shouldAbortVocabSwipe({ deltaX: 4, deltaY: 20 })).toBe(true);
    expect(shouldAbortVocabSwipe({ deltaX: 30, deltaY: 10 })).toBe(false);
  });

  it("treats tiny movement as a tap for flip toggling", () => {
    expect(isVocabSwipeTap(0, 0)).toBe(true);
    expect(isVocabSwipeTap(9, 4)).toBe(true);
    expect(isVocabSwipeTap(12, 0)).toBe(false);
  });
});