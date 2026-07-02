import { describe, expect, it } from "vitest";
import {
  getCommonMistakeFeedback,
  matchesCommonMistake,
} from "../commonMistakeFeedback.js";

const t = (key, params = {}) => {
  const map = {
    "path.commonMistakeTip": `「${params.mistake}」is common — correct: ${params.correct}`,
    "path.commonMistakeWithHint": `「${params.mistake}」is common. Hint: ${params.hint}`,
  };
  return map[key] || key;
};

describe("matchesCommonMistake", () => {
  const question = {
    type: "T09",
    answer: "drinks",
    commonMistakes: ["drink", "drinck", "drings"],
  };

  it("detects a known common mistake", () => {
    expect(matchesCommonMistake(question, "drink")).toBe(true);
    expect(matchesCommonMistake(question, "DRINCK")).toBe(true);
  });

  it("ignores the correct answer and unrelated typos", () => {
    expect(matchesCommonMistake(question, "drinks")).toBe(false);
    expect(matchesCommonMistake(question, "drinkz")).toBe(false);
  });

  it("only applies to T09 spelling questions", () => {
    expect(matchesCommonMistake({ type: "T05", commonMistakes: ["x"] }, "x")).toBe(false);
  });
});

describe("getCommonMistakeFeedback", () => {
  it("returns hint-enriched feedback when the question has a hint", () => {
    const question = {
      type: "T09",
      answer: "drinks",
      hint: "third-person singular adds -s",
      commonMistakes: ["drink"],
    };
    expect(getCommonMistakeFeedback(question, "drink", t)).toBe(
      "「drink」is common. Hint: third-person singular adds -s",
    );
  });

  it("falls back to a short tip without a hint", () => {
    const question = {
      type: "T09",
      answer: "drinks",
      commonMistakes: ["drink"],
    };
    expect(getCommonMistakeFeedback(question, "drink", t)).toBe(
      "「drink」is common — correct: drinks",
    );
  });

  it("returns null when the answer is not a tagged common mistake", () => {
    const question = {
      type: "T09",
      answer: "drinks",
      commonMistakes: ["drink"],
    };
    expect(getCommonMistakeFeedback(question, "drinkz", t)).toBeNull();
  });
});