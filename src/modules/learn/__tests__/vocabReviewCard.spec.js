import { describe, expect, it } from "vitest";
import {
  VOCAB_PREVIEW_MAX,
  VOCAB_REVIEW_LIMIT,
  shouldShowVocabReview,
  vocabReviewCount,
  vocabReviewHasMore,
  vocabReviewFromNewsCount,
  vocabReviewPreview,
} from "../vocabReviewCard.js";

describe("vocabReviewCard", () => {
  const words = [
    { id: 1, word: "hola" },
    { id: 2, word: "gracias" },
    { id: 3, word: "casa" },
    { id: 4, word: "perro" },
  ];

  it("exports review limits", () => {
    expect(VOCAB_REVIEW_LIMIT).toBe(5);
    expect(VOCAB_PREVIEW_MAX).toBe(3);
  });

  it("shouldShowVocabReview is true only when words exist", () => {
    expect(shouldShowVocabReview(words)).toBe(true);
    expect(shouldShowVocabReview([])).toBe(false);
    expect(shouldShowVocabReview(null)).toBe(false);
  });

  it("vocabReviewCount returns array length", () => {
    expect(vocabReviewCount(words)).toBe(4);
    expect(vocabReviewCount([])).toBe(0);
  });

  it("vocabReviewPreview joins up to maxPreview words", () => {
    expect(vocabReviewPreview(words)).toBe("hola, gracias, casa");
    expect(vocabReviewPreview(words.slice(0, 2))).toBe("hola, gracias");
    expect(vocabReviewPreview([])).toBe("");
  });

  it("vocabReviewHasMore detects truncated previews", () => {
    expect(vocabReviewHasMore(words)).toBe(true);
    expect(vocabReviewHasMore(words.slice(0, 3))).toBe(false);
  });

  it("vocabReviewFromNewsCount counts news_reading source", () => {
    const mixed = [
      { word: "hola", source: "news_reading" },
      { word: "casa", source: "exercise" },
      { word: "perro", source: "news_reading" },
    ];
    expect(vocabReviewFromNewsCount(mixed)).toBe(2);
    expect(vocabReviewFromNewsCount([])).toBe(0);
  });
});