import { describe, expect, it } from "vitest";
import {
  isMatchingAnswerComplete,
  isMatchingQuestionType,
  shouldAutoSubmitOnMatching,
} from "../matchingAutoSubmit.js";

describe("matchingAutoSubmit", () => {
  const question = {
    type: "T03",
    pairs: [
      { left: "hola", right: "hello" },
      { left: "adiós", right: "goodbye" },
    ],
  };

  it("recognizes the matching question type", () => {
    expect(isMatchingQuestionType("T03")).toBe(true);
    expect(isMatchingQuestionType("T05")).toBe(false);
  });

  it("shouldAutoSubmitOnMatching only for unanswered matching questions", () => {
    expect(shouldAutoSubmitOnMatching(question)).toBe(true);
    expect(shouldAutoSubmitOnMatching(question, { showResult: true })).toBe(false);
    expect(shouldAutoSubmitOnMatching({ type: "T05" })).toBe(false);
    expect(shouldAutoSubmitOnMatching(null)).toBe(false);
  });

  it("isMatchingAnswerComplete when every pair is matched", () => {
    expect(isMatchingAnswerComplete(question, [])).toBe(false);
    expect(
      isMatchingAnswerComplete(question, [{ left: "hola", right: "hello" }]),
    ).toBe(false);
    expect(
      isMatchingAnswerComplete(question, [
        { left: "hola", right: "hello" },
        { left: "adiós", right: "goodbye" },
      ]),
    ).toBe(true);
    expect(isMatchingAnswerComplete(question, null)).toBe(false);
    expect(isMatchingAnswerComplete({ type: "T03", pairs: [] }, [])).toBe(false);
    expect(isMatchingAnswerComplete({ type: "T05" }, [1, 2])).toBe(false);
  });
});