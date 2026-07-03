import { describe, expect, it } from "vitest";
import {
  comprehensionCelebration,
  comprehensionNeedsRetake,
  scoreComprehension,
  shouldOfferComprehensionQuiz,
  shouldOfferComprehensionRetake,
  shouldRevisitAfterComprehension,
} from "../readingComprehension.js";

const QUESTIONS = [
  {
    id: "main-idea",
    correct_option_id: "b",
    prompt_native: "主旨？",
    options: [
      { id: "a", text_native: "A" },
      { id: "b", text_native: "B" },
      { id: "c", text_native: "C" },
    ],
  },
  {
    id: "detail",
    correct_option_id: "a",
    prompt_native: "细节？",
    options: [
      { id: "a", text_native: "A" },
      { id: "b", text_native: "B" },
      { id: "c", text_native: "C" },
    ],
  },
];

describe("shouldOfferComprehensionQuiz", () => {
  it("offers quiz only for meaningful complete reads with quiz data", () => {
    expect(
      shouldOfferComprehensionQuiz({
        summaryMode: "complete",
        isValidReading: true,
        quizAvailable: true,
      }),
    ).toBe(true);
    expect(
      shouldOfferComprehensionQuiz({
        summaryMode: "checkpoint",
        isValidReading: true,
        quizAvailable: true,
      }),
    ).toBe(false);
    expect(
      shouldOfferComprehensionQuiz({
        summaryMode: "complete",
        isValidReading: false,
        quizAvailable: true,
      }),
    ).toBe(false);
    expect(
      shouldOfferComprehensionQuiz({
        summaryMode: "complete",
        isValidReading: true,
        quizAvailable: false,
      }),
    ).toBe(false);
  });
});

describe("scoreComprehension", () => {
  it("scores correct and wrong answers", () => {
    const result = scoreComprehension(QUESTIONS, {
      "main-idea": "b",
      detail: "c",
    });
    expect(result.score).toBe(1);
    expect(result.total).toBe(2);
    expect(result.details[0].correct).toBe(true);
    expect(result.details[1].correct).toBe(false);
  });
});

describe("comprehensionCelebration", () => {
  it("returns perfect and partial keys", () => {
    expect(comprehensionCelebration(2, 2)).toEqual({
      key: "news.comprehensionPerfect",
      params: {},
    });
    expect(comprehensionCelebration(1, 2)).toEqual({
      key: "news.comprehensionPartial",
      params: { n: 1, total: 2 },
    });
    expect(comprehensionCelebration(0, 2, true)).toBeNull();
  });
});

describe("shouldRevisitAfterComprehension", () => {
  it("flags partial scores but not skips or perfect runs", () => {
    expect(shouldRevisitAfterComprehension({ score: 1, total: 2, skipped: false })).toBe(true);
    expect(shouldRevisitAfterComprehension({ score: 2, total: 2, skipped: false })).toBe(false);
    expect(shouldRevisitAfterComprehension({ score: 0, total: 2, skipped: true })).toBe(false);
  });
});

describe("comprehensionNeedsRetake", () => {
  it("flags skipped or partial completed reads", () => {
    expect(
      comprehensionNeedsRetake({
        completed: true,
        comprehension_skipped: true,
      }),
    ).toBe(true);
    expect(
      comprehensionNeedsRetake({
        completed: true,
        comprehension_score: 1,
        comprehension_skipped: false,
      }),
    ).toBe(true);
    expect(
      comprehensionNeedsRetake({
        completed: true,
        comprehension_score: 2,
        comprehension_skipped: false,
      }),
    ).toBe(false);
    expect(comprehensionNeedsRetake({ completed: false, comprehension_skipped: true })).toBe(
      false,
    );
  });
});

describe("shouldOfferComprehensionRetake", () => {
  it("requires cached quiz and incomplete comprehension", () => {
    expect(
      shouldOfferComprehensionRetake({
        status: {
          completed: true,
          comprehension_skipped: true,
        },
        quizAvailable: true,
      }),
    ).toBe(true);
    expect(
      shouldOfferComprehensionRetake({
        status: {
          completed: true,
          comprehension_skipped: true,
        },
        quizAvailable: false,
      }),
    ).toBe(false);
    expect(
      shouldOfferComprehensionRetake({
        status: {
          completed: true,
          comprehension_score: 2,
          comprehension_skipped: false,
        },
        quizAvailable: true,
      }),
    ).toBe(false);
  });
});