import { describe, expect, it } from "vitest";
import { practiceQuestionKey } from "../practiceQuestionKey.js";

describe("practiceQuestionKey", () => {
  it("returns empty string when question is missing", () => {
    expect(practiceQuestionKey()).toBe("");
    expect(practiceQuestionKey({ question: null })).toBe("");
  });

  it("uses main-round position and question id", () => {
    expect(
      practiceQuestionKey({
        question: { id: "q42", type: "T05" },
        index: 3,
      }),
    ).toBe("m3-q42");
  });

  it("uses reinforcement position when in reinforcement phase", () => {
    expect(
      practiceQuestionKey({
        question: { id: "q7", type: "T01" },
        index: 5,
        reinforcementIndex: 1,
        inReinforcement: true,
      }),
    ).toBe("r1-q7");
  });

  it("falls back to question type when id is absent", () => {
    expect(
      practiceQuestionKey({
        question: { type: "T06" },
        index: 0,
      }),
    ).toBe("m0-T06");
  });
});