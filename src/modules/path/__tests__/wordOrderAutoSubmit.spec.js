import { describe, expect, it } from "vitest";
import {
  isWordOrderAnswerComplete,
  isWordOrderQuestionType,
  shouldAutoSubmitOnWordOrder,
} from "../wordOrderAutoSubmit.js";

describe("wordOrderAutoSubmit", () => {
  const question = {
    type: "T06",
    words: ["Yo", "soy", "estudiante."],
    targetSentence: "Yo soy estudiante.",
  };

  it("recognizes the word-order question type", () => {
    expect(isWordOrderQuestionType("T06")).toBe(true);
    expect(isWordOrderQuestionType("T03")).toBe(false);
  });

  it("shouldAutoSubmitOnWordOrder only for unanswered word-order questions", () => {
    expect(shouldAutoSubmitOnWordOrder(question)).toBe(true);
    expect(shouldAutoSubmitOnWordOrder(question, { showResult: true })).toBe(false);
    expect(shouldAutoSubmitOnWordOrder({ type: "T05" })).toBe(false);
    expect(shouldAutoSubmitOnWordOrder(null)).toBe(false);
  });

  it("isWordOrderAnswerComplete when every word is placed", () => {
    expect(isWordOrderAnswerComplete(question, [])).toBe(false);
    expect(isWordOrderAnswerComplete(question, ["Yo", "soy"])).toBe(false);
    expect(isWordOrderAnswerComplete(question, ["Yo", "soy", "estudiante."])).toBe(true);
    expect(isWordOrderAnswerComplete(question, null)).toBe(false);
    expect(isWordOrderAnswerComplete({ type: "T06", words: [] }, [])).toBe(false);
    expect(isWordOrderAnswerComplete({ type: "T05" }, ["a", "b"])).toBe(false);
  });
});