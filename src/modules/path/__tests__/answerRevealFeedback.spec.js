import { describe, expect, it } from "vitest";
import {
  isIncorrectReveal,
  textInputResultClass,
} from "../answerRevealFeedback.js";

describe("answerRevealFeedback", () => {
  it("detects when the learner should see incorrect-reveal styling", () => {
    expect(isIncorrectReveal({ showResult: false, isCorrect: false })).toBe(false);
    expect(isIncorrectReveal({ showResult: true, isCorrect: true })).toBe(false);
    expect(isIncorrectReveal({ showResult: true, isCorrect: false })).toBe(true);
  });

  it("returns empty class while answering and result classes after check", () => {
    expect(textInputResultClass({ showResult: false, isCorrect: false })).toBe("");
    expect(textInputResultClass({ showResult: true, isCorrect: true })).toBe("is-correct");
    expect(textInputResultClass({ showResult: true, isCorrect: false })).toBe("is-wrong");
  });
});