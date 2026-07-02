import { describe, expect, it } from "vitest";
import { shouldAutoCheckOnAnswerChange } from "../practiceAnswerAutoCheck.js";

describe("practiceAnswerAutoCheck", () => {
  const matchingQuestion = {
    type: "T03",
    pairs: [
      { left: "a", right: "1" },
      { left: "b", right: "2" },
    ],
  };

  it("auto-checks choice answers on tap", () => {
    const question = { type: "T05", options: ["a", "b"] };
    expect(shouldAutoCheckOnAnswerChange(question, 0)).toBe(true);
    expect(shouldAutoCheckOnAnswerChange(question, 0, { showResult: true })).toBe(false);
  });

  it("auto-checks matching answers when the board is full", () => {
    expect(
      shouldAutoCheckOnAnswerChange(matchingQuestion, [{ left: "a", right: "1" }]),
    ).toBe(false);
    expect(
      shouldAutoCheckOnAnswerChange(matchingQuestion, [
        { left: "a", right: "1" },
        { left: "b", right: "2" },
      ]),
    ).toBe(true);
    expect(
      shouldAutoCheckOnAnswerChange(matchingQuestion, [
        { left: "a", right: "1" },
        { left: "b", right: "2" },
      ], { showResult: true }),
    ).toBe(false);
  });

  it("auto-checks word-order answers when the sentence is full", () => {
    const question = {
      type: "T06",
      words: ["Yo", "soy", "estudiante."],
      targetSentence: "Yo soy estudiante.",
    };
    expect(shouldAutoCheckOnAnswerChange(question, ["Yo", "soy"])).toBe(false);
    expect(
      shouldAutoCheckOnAnswerChange(question, ["Yo", "soy", "estudiante."]),
    ).toBe(true);
    expect(
      shouldAutoCheckOnAnswerChange(question, ["Yo", "soy", "estudiante."], {
        showResult: true,
      }),
    ).toBe(false);
  });

  it("ignores unrelated answer changes", () => {
    expect(shouldAutoCheckOnAnswerChange({ type: "T09" }, "hola")).toBe(false);
    expect(shouldAutoCheckOnAnswerChange(null, 0)).toBe(false);
  });
});