import { describe, expect, it } from "vitest";
import {
  mistakeReviewCount,
  mistakeReviewPreview,
  shouldShowMistakeReview,
} from "../mistakeReviewCard.js";

const t = (key) => {
  const map = {
    "path.listenChoose": "听句子，选择正确答案",
  };
  return map[key] ?? key;
};

describe("mistakeReviewCard", () => {
  it("shows the card only when due mistakes exist", () => {
    expect(shouldShowMistakeReview(0)).toBe(false);
    expect(shouldShowMistakeReview(3)).toBe(true);
  });

  it("normalizes the displayed count", () => {
    expect(mistakeReviewCount(4)).toBe(4);
    expect(mistakeReviewCount(undefined)).toBe(0);
  });

  it("mistakeReviewPreview joins up to maxPreview prompts", () => {
    const entries = [
      { question: { id: "q1", type: "T09", hint: "hola" } },
      { question: { id: "q2", type: "T08", question: "¿Cómo estás?" } },
      { question: { id: "q3", type: "T09", hint: "gracias" } },
    ];
    expect(mistakeReviewPreview(entries, t)).toBe("hola, ¿Cómo estás?");
    expect(mistakeReviewPreview(entries.slice(0, 1), t)).toBe("hola");
    expect(mistakeReviewPreview([], t)).toBe("");
    expect(mistakeReviewPreview(entries, null)).toBe("");
  });
});