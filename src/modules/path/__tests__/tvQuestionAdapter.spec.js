import { describe, expect, it } from "vitest";
import { adaptQuestionsForTv } from "../tvQuestionAdapter.js";

describe("TV path question adapter", () => {
  it("converts dictation and free translation into remote-friendly word ordering", () => {
    const adapted = adaptQuestionsForTv([
      { type: "T09", answer: "buenos dias", audioText: "buenos dias" },
      { type: "T10", sourceText: "你好", acceptedAnswers: ["hello"] },
      { type: "T01", options: ["uno", "dos"] },
    ]);

    expect(adapted[0]).toMatchObject({
      type: "T06",
      tvOriginalType: "T09",
      targetSentence: "buenos dias",
      words: ["buenos", "dias"],
    });
    expect(adapted[1]).toMatchObject({
      type: "T06",
      tvOriginalType: "T10",
      targetSentence: "hello",
      words: ["h", "e", "l", "l", "o"],
    });
    expect(adapted[2]).toEqual({ type: "T01", options: ["uno", "dos"] });
  });
});
