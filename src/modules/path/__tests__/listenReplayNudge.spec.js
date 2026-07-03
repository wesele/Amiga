import { describe, expect, it } from "vitest";
import { shouldShowListenReplay } from "../listenReplayNudge.js";

describe("listenReplayNudge", () => {
  const listeningQuestion = { type: "T08", audioText: "Hola" };

  it("shows replay only after a wrong answer on listening questions", () => {
    expect(
      shouldShowListenReplay({
        showResult: true,
        lastCorrect: false,
        question: listeningQuestion,
      }),
    ).toBe(true);
    expect(
      shouldShowListenReplay({
        showResult: true,
        lastCorrect: true,
        question: listeningQuestion,
      }),
    ).toBe(false);
    expect(
      shouldShowListenReplay({
        showResult: false,
        lastCorrect: false,
        question: listeningQuestion,
      }),
    ).toBe(false);
    expect(
      shouldShowListenReplay({
        showResult: true,
        lastCorrect: false,
        question: { type: "T05", audioText: "" },
      }),
    ).toBe(false);
  });
});