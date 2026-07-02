import { describe, expect, it } from "vitest";
import {
  checkAnswer,
  formatCorrectAnswer,
  formatQuestionPrompt,
  formatUserAnswer,
} from "../checkAnswer.js";

const t = (key) => {
  const map = {
    "path.listenChoose": "Listen and choose",
    "path.chooseByImage": "Choose by image",
    "path.listenChooseImage": "Listen and pick image",
    "path.matchPairs": "Match pairs",
    "path.buildSentence": "Build sentence",
  };
  return map[key] || key;
};

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

  it("rejects author-tagged common mistakes for T09", () => {
    const q = {
      type: "T09",
      answer: "drinks",
      commonMistakes: ["drink", "drinck", "drings"],
    };
    expect(checkAnswer(q, "drinks")).toBe(true);
    expect(checkAnswer(q, "drink")).toBe(false);
    expect(checkAnswer(q, "drinck")).toBe(false);
  });
});

describe("formatQuestionPrompt", () => {
  it("returns learner-facing prompt for choice and input types", () => {
    expect(formatQuestionPrompt({ type: "T01" }, t)).toBe("Choose by image");
    expect(formatQuestionPrompt({ type: "T07", sourceText: "Hola" }, t)).toBe("Hola");
    expect(formatQuestionPrompt({ type: "T05", sentence: "Yo ___ estudiante." }, t)).toBe(
      "Yo ______ estudiante.",
    );
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

describe("formatUserAnswer", () => {
  it("returns the selected option for multiple-choice mistakes", () => {
    const q = { type: "T07", options: ["A", "B", "C"] };
    expect(formatUserAnswer(q, 1)).toBe("B");
    expect(formatUserAnswer(q, null)).toBe("");
  });

  it("formats T03 and T06 learner submissions", () => {
    const t03 = {
      type: "T03",
      pairs: [{ left: "hola", right: "你好" }],
    };
    expect(
      formatUserAnswer(t03, [{ left: "hola", right: "再见" }]),
    ).toBe("hola → 再见");

    const t06 = { type: "T06", targetSentence: "Yo soy estudiante." };
    expect(formatUserAnswer(t06, ["Yo", "estudiante.", "soy"])).toBe("Yo estudiante. soy");
  });

  it("returns trimmed text for spelling and translation inputs", () => {
    expect(formatUserAnswer({ type: "T09", answer: "hola" }, "  ola ")).toBe("ola");
    expect(formatUserAnswer({ type: "T10", acceptedAnswers: ["Hello"] }, "Hi")).toBe("Hi");
  });
});