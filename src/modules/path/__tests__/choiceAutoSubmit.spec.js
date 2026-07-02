import { describe, expect, it } from "vitest";
import {
  CHOICE_QUESTION_TYPES,
  isChoiceAnswer,
  isChoiceQuestionType,
  shouldAutoSubmitOnChoice,
} from "../choiceAutoSubmit.js";

describe("choiceAutoSubmit", () => {
  it("recognizes choice question types", () => {
    for (const type of CHOICE_QUESTION_TYPES) {
      expect(isChoiceQuestionType(type)).toBe(true);
    }
    expect(isChoiceQuestionType("T09")).toBe(false);
    expect(isChoiceQuestionType("T03")).toBe(false);
  });

  it("shouldAutoSubmitOnChoice only for unanswered choice questions", () => {
    const question = { type: "T05", options: ["a", "b"] };
    expect(shouldAutoSubmitOnChoice(question)).toBe(true);
    expect(shouldAutoSubmitOnChoice(question, { showResult: true })).toBe(false);
    expect(shouldAutoSubmitOnChoice({ type: "T09" })).toBe(false);
    expect(shouldAutoSubmitOnChoice(null)).toBe(false);
  });

  it("isChoiceAnswer accepts finite numeric indices only", () => {
    expect(isChoiceAnswer(0)).toBe(true);
    expect(isChoiceAnswer(2)).toBe(true);
    expect(isChoiceAnswer(null)).toBe(false);
    expect(isChoiceAnswer("1")).toBe(false);
    expect(isChoiceAnswer(Number.NaN)).toBe(false);
  });
});