import { describe, expect, it } from "vitest";
import { checkAnswer } from "../checkAnswer.js";

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

  it("ignores punctuation and accents for T06 sentence order", () => {
    const q = { type: "T06", targetSentence: "¿Cómo estás?" };
    expect(checkAnswer(q, ["Como", "estas"])).toBe(true);
  });

  it("normalizes accents for T09", () => {
    const q = { type: "T09", answer: "café", commonMistakes: [] };
    expect(checkAnswer(q, "cafe")).toBe(true);
  });
});
