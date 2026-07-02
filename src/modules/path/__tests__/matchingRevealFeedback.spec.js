import { describe, expect, it } from "vitest";
import {
  builtSentenceRevealState,
  isUserPairCorrect,
  leftMatchRevealState,
  pairKey,
  rightMatchRevealState,
} from "../matchingRevealFeedback.js";

const matchingQuestion = {
  type: "T03",
  pairs: [
    { left: "hola", right: "hello" },
    { left: "adiós", right: "goodbye" },
  ],
};

describe("matchingRevealFeedback", () => {
  it("builds stable pair keys", () => {
    expect(pairKey("hola", "hello")).toBe("hola::hello");
  });

  it("detects correct and incorrect user pairs", () => {
    expect(
      isUserPairCorrect({ left: "hola", right: "hello" }, matchingQuestion),
    ).toBe(true);
    expect(
      isUserPairCorrect({ left: "hola", right: "goodbye" }, matchingQuestion),
    ).toBe(false);
  });

  it("marks matched left items as correct or wrong after check", () => {
    const matchedPairs = [
      { leftIdx: 0, rightIdx: 1, left: "hola", right: "goodbye" },
      { leftIdx: 1, rightIdx: 0, left: "adiós", right: "hello" },
    ];

    expect(
      leftMatchRevealState({
        showResult: true,
        isCorrect: false,
        leftIdx: 0,
        matchedPairs,
        question: matchingQuestion,
      }),
    ).toEqual({ wrong: true });

    expect(
      leftMatchRevealState({
        showResult: true,
        isCorrect: false,
        leftIdx: 1,
        matchedPairs,
        question: matchingQuestion,
      }),
    ).toEqual({ wrong: true });
  });

  it("dims unmatched left items when the overall answer is wrong", () => {
    expect(
      leftMatchRevealState({
        showResult: true,
        isCorrect: false,
        leftIdx: 0,
        matchedPairs: [],
        question: matchingQuestion,
      }),
    ).toEqual({ unmatched: true });
  });

  it("pulses the correct right partner for mis-matched pairs", () => {
    const matchedPairs = [
      { leftIdx: 0, rightIdx: 1, left: "hola", right: "goodbye" },
      { leftIdx: 1, rightIdx: 0, left: "adiós", right: "hello" },
    ];

    expect(
      rightMatchRevealState({
        showResult: true,
        isCorrect: false,
        rightIdx: 0,
        rightText: "hello",
        matchedPairs,
        question: matchingQuestion,
      }),
    ).toEqual({ wrong: true, "correct-hint": true });

    expect(
      rightMatchRevealState({
        showResult: true,
        isCorrect: false,
        rightIdx: 1,
        rightText: "goodbye",
        matchedPairs,
        question: matchingQuestion,
      }),
    ).toEqual({ wrong: true, "correct-hint": true });
  });

  it("returns built-sentence reveal classes for word-order questions", () => {
    expect(builtSentenceRevealState({ showResult: false, isCorrect: false })).toBe("");
    expect(builtSentenceRevealState({ showResult: true, isCorrect: true })).toBe(
      "is-correct",
    );
    expect(builtSentenceRevealState({ showResult: true, isCorrect: false })).toBe(
      "is-wrong",
    );
  });
});