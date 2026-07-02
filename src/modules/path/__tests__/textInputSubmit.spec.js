import { describe, expect, it } from "vitest";
import {
  hasTextInputAnswer,
  isTextInputQuestionType,
  shouldSubmitOnEnter,
} from "../textInputSubmit.js";

describe("textInputSubmit", () => {
  it("recognizes T09 and T10 as text-input question types", () => {
    expect(isTextInputQuestionType("T09")).toBe(true);
    expect(isTextInputQuestionType("T10")).toBe(true);
    expect(isTextInputQuestionType("T05")).toBe(false);
  });

  it("requires non-empty trimmed text before Enter can check an answer", () => {
    expect(hasTextInputAnswer("")).toBe(false);
    expect(hasTextInputAnswer("   ")).toBe(false);
    expect(hasTextInputAnswer("hola")).toBe(true);
    expect(hasTextInputAnswer("  hola  ")).toBe(true);
  });

  it("allows Enter to check when text is present and result is not shown", () => {
    const question = { type: "T09" };
    expect(
      shouldSubmitOnEnter(question, { showResult: false, answer: "hola" }),
    ).toBe(true);
    expect(
      shouldSubmitOnEnter(question, { showResult: false, answer: "" }),
    ).toBe(false);
  });

  it("allows Enter to advance after feedback is shown", () => {
    const question = { type: "T10" };
    expect(
      shouldSubmitOnEnter(question, { showResult: true, answer: "wrong" }),
    ).toBe(true);
  });

  it("ignores Enter for non text-input question types", () => {
    expect(
      shouldSubmitOnEnter({ type: "T05" }, { showResult: false, answer: 0 }),
    ).toBe(false);
  });
});