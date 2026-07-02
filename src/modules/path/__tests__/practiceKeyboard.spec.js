import { describe, expect, it } from "vitest";
import { shouldAdvancePracticeOnEnter } from "../practiceKeyboard.js";

function enterEvent(target = null) {
  return { key: "Enter", target, preventDefault() {} };
}

describe("shouldAdvancePracticeOnEnter", () => {
  it("advances after feedback on choice questions", () => {
    const question = { type: "T05" };
    expect(
      shouldAdvancePracticeOnEnter(enterEvent(), {
        showResult: true,
        question,
        answer: 1,
      }),
    ).toBe(true);
  });

  it("ignores Enter before a choice answer is selected", () => {
    expect(
      shouldAdvancePracticeOnEnter(enterEvent(), {
        showResult: false,
        question: { type: "T05" },
        answer: null,
      }),
    ).toBe(false);
  });

  it("defers to the text input while the learner is still typing", () => {
    const input = { tagName: "INPUT" };
    expect(
      shouldAdvancePracticeOnEnter(enterEvent(input), {
        showResult: false,
        question: { type: "T09" },
        answer: "hola",
      }),
    ).toBe(false);
  });

  it("allows Enter to continue after text feedback even when focus left the input", () => {
    expect(
      shouldAdvancePracticeOnEnter(enterEvent(), {
        showResult: true,
        question: { type: "T09" },
        answer: "wrong",
      }),
    ).toBe(true);
  });

  it("ignores non-Enter keys", () => {
    expect(
      shouldAdvancePracticeOnEnter(
        { key: "Space", target: null },
        { showResult: true, question: { type: "T05" }, answer: 0 },
      ),
    ).toBe(false);
  });
});