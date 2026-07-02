import { describe, expect, it } from "vitest";
import { setLocale } from "@/shared/i18n";
import { shouldShowYourAnswer, yourAnswerText } from "../wrongAnswerFeedback.js";

const t09 = { type: "T09", answer: "hola", hint: "hello" };
const t01 = {
  type: "T01",
  options: ["A", "B", "C"],
  answerIdx: 1,
};

describe("shouldShowYourAnswer", () => {
  it("returns false when result is hidden or answer was correct", () => {
    expect(
      shouldShowYourAnswer({
        showResult: false,
        lastCorrect: false,
        question: t01,
        answer: 0,
        commonMistakeFeedback: "",
        nearMissFeedback: "",
      }),
    ).toBe(false);

    expect(
      shouldShowYourAnswer({
        showResult: true,
        lastCorrect: true,
        question: t01,
        answer: 0,
        commonMistakeFeedback: "",
        nearMissFeedback: "",
      }),
    ).toBe(false);
  });

  it("returns false when common mistake or near-miss feedback already compares answers", () => {
    expect(
      shouldShowYourAnswer({
        showResult: true,
        lastCorrect: false,
        question: t09,
        answer: "ola",
        commonMistakeFeedback: "common tip",
        nearMissFeedback: "",
      }),
    ).toBe(false);

    expect(
      shouldShowYourAnswer({
        showResult: true,
        lastCorrect: false,
        question: t09,
        answer: "hol",
        commonMistakeFeedback: "",
        nearMissFeedback: "near miss tip",
      }),
    ).toBe(false);
  });

  it("returns true for choice questions with a formatted user answer", () => {
    expect(
      shouldShowYourAnswer({
        showResult: true,
        lastCorrect: false,
        question: t01,
        answer: 0,
        commonMistakeFeedback: "",
        nearMissFeedback: "",
      }),
    ).toBe(true);
  });

  it("returns true for ordinary T09 wrong answers without near-miss", () => {
    expect(
      shouldShowYourAnswer({
        showResult: true,
        lastCorrect: false,
        question: t09,
        answer: "adios",
        commonMistakeFeedback: "",
        nearMissFeedback: "",
      }),
    ).toBe(true);
  });

  it("returns false when user answer cannot be formatted", () => {
    expect(
      shouldShowYourAnswer({
        showResult: true,
        lastCorrect: false,
        question: t01,
        answer: null,
        commonMistakeFeedback: "",
        nearMissFeedback: "",
      }),
    ).toBe(false);
  });
});

describe("yourAnswerText", () => {
  it("formats localized your-answer line", () => {
    setLocale("zh", { persist: false });
    const t = (key, params) =>
      key === "path.yourAnswer" ? `你的答案：${params.answer}` : key;

    expect(yourAnswerText(t01, 0, t)).toBe("你的答案：A");
    expect(yourAnswerText(t01, null, t)).toBe("");
  });
});