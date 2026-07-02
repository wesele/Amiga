import { describe, expect, it } from "vitest";
import {
  acceptedAnswersForQuestion,
  getNearMissFeedback,
  isNearMissAnswer,
  levenshteinDistance,
  NEAR_MISS_MAX_DISTANCE,
} from "../nearMissAnswer.js";

const t = (key, params = {}) => {
  const map = {
    "path.nearMissTip": `Almost! "${params.answer}" → "${params.correct}"`,
  };
  return map[key] || key;
};

describe("levenshteinDistance", () => {
  it("returns zero for identical strings", () => {
    expect(levenshteinDistance("hola", "hola")).toBe(0);
  });

  it("counts single-character edits", () => {
    expect(levenshteinDistance("estudante", "estudiante")).toBe(1);
    expect(levenshteinDistance("hola", "hol")).toBe(1);
    expect(levenshteinDistance("hola", "holaa")).toBe(1);
  });
});

describe("acceptedAnswersForQuestion", () => {
  it("reads T09 and T10 accepted answers", () => {
    expect(
      acceptedAnswersForQuestion({ type: "T09", answer: "café" }),
    ).toEqual(["café"]);
    expect(
      acceptedAnswersForQuestion({
        type: "T10",
        acceptedAnswers: ["I am fine", "I'm fine"],
      }),
    ).toEqual(["I am fine", "I'm fine"]);
  });
});

describe("isNearMissAnswer", () => {
  it("detects a one-character typo on T09", () => {
    const question = {
      type: "T09",
      answer: "estudiante",
      commonMistakes: [],
    };
    expect(isNearMissAnswer(question, "estudante")).toBe(true);
    expect(isNearMissAnswer(question, "estudia")).toBe(false);
    expect(isNearMissAnswer(question, "estudiante")).toBe(false);
  });

  it("treats accent-normalized correct answers as correct, not near-miss", () => {
    const question = { type: "T09", answer: "café", commonMistakes: [] };
    expect(isNearMissAnswer(question, "cafe")).toBe(false);
  });

  it("defers to author-tagged common mistakes", () => {
    const question = {
      type: "T09",
      answer: "drinks",
      commonMistakes: ["drink"],
    };
    expect(isNearMissAnswer(question, "drink")).toBe(false);
  });

  it("checks all accepted answers for T10", () => {
    const question = {
      type: "T10",
      acceptedAnswers: ["I am fine", "I'm fine"],
    };
    expect(isNearMissAnswer(question, "I am fne")).toBe(true);
    expect(isNearMissAnswer(question, "I am great")).toBe(false);
  });

  it("ignores non free-text question types", () => {
    expect(isNearMissAnswer({ type: "T05", answerIdx: 0 }, "hola")).toBe(false);
  });

  it("uses a max distance of one edit", () => {
    expect(NEAR_MISS_MAX_DISTANCE).toBe(1);
  });
});

describe("getNearMissFeedback", () => {
  it("returns encouraging copy for a near miss", () => {
    const question = { type: "T09", answer: "estudiante", commonMistakes: [] };
    expect(getNearMissFeedback(question, "estudante", t)).toBe(
      'Almost! "estudante" → "estudiante"',
    );
  });

  it("returns null when the answer is not a near miss", () => {
    const question = { type: "T09", answer: "estudiante", commonMistakes: [] };
    expect(getNearMissFeedback(question, "estudia", t)).toBeNull();
  });
});