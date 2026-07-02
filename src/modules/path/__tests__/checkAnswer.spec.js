import { describe, expect, it } from "vitest";
import { checkAnswer, formatCorrectAnswer } from "../checkAnswer.js";

describe("checkAnswer", () => {
  it("checks multiple-choice by answerIdx", () => {
    const q = { type: "T07", answerIdx: 2 };
    expect(checkAnswer(q, 2)).toBe(true);
    expect(checkAnswer(q, 1)).toBe(false);
  });

  it("checks T03 pairs", () => {
    const q = {
      type: "T03",
      pairs: [{ left: "hola", right: "你好" }, { left: "adiós", right: "再见" }],
    };
    expect(checkAnswer(q, [{ left: "hola", right: "你好" }, { left: "adiós", right: "再见" }])).toBe(true);
    expect(checkAnswer(q, [{ left: "hola", right: "再见" }])).toBe(false);
  });

  it("checks T06 sentence order", () => {
    const q = { type: "T06", targetSentence: "Yo soy estudiante." };
    expect(checkAnswer(q, ["Yo", "soy", "estudiante."])).toBe(true);
    expect(checkAnswer(q, ["soy", "Yo", "estudiante."])).toBe(false);
  });

  it("normalizes accents for T09", () => {
    const q = { type: "T09", answer: "café", commonMistakes: [] };
    expect(checkAnswer(q, "cafe")).toBe(true);
  });
});

describe("formatCorrectAnswer", () => {
  it("returns the selected option for multiple-choice", () => {
    const q = { type: "T07", answerIdx: 1, options: ["A", "B", "C"] };
    expect(formatCorrectAnswer(q)).toBe("B");
  });

  it("formats T03 pairs with arrows", () => {
    const q = {
      type: "T03",
      pairs: [{ left: "hola", right: "你好" }, { left: "adiós", right: "再见" }],
    };
    expect(formatCorrectAnswer(q)).toBe("hola → 你好 · adiós → 再见");
  });

  it("returns target sentence for T06", () => {
    const q = { type: "T06", targetSentence: "Yo soy estudiante." };
    expect(formatCorrectAnswer(q)).toBe("Yo soy estudiante.");
  });

  it("returns canonical answer for T09 and T10", () => {
    expect(formatCorrectAnswer({ type: "T09", answer: "café" })).toBe("café");
    expect(formatCorrectAnswer({ type: "T10", acceptedAnswers: ["Hello", "Hi"] })).toBe("Hello");
  });
});