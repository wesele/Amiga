import { describe, expect, it } from "vitest";
import {
  HINT_IDLE_MS,
  shouldAutoRevealHint,
  shouldScheduleAutoHint,
} from "../questionHintTimer.js";

describe("questionHintTimer", () => {
  it("uses a 15-second idle threshold", () => {
    expect(HINT_IDLE_MS).toBe(15_000);
  });

  it("schedules auto-hint only while the learner is stuck on a hintable question", () => {
    expect(
      shouldScheduleAutoHint({
        hintAvailable: true,
        hintShown: false,
        showResult: false,
        finished: false,
        inReinforcement: false,
      }),
    ).toBe(true);

    expect(
      shouldScheduleAutoHint({
        hintAvailable: false,
        hintShown: false,
        showResult: false,
        finished: false,
        inReinforcement: false,
      }),
    ).toBe(false);

    expect(
      shouldScheduleAutoHint({
        hintAvailable: true,
        hintShown: true,
        showResult: false,
        finished: false,
        inReinforcement: false,
      }),
    ).toBe(false);

    expect(
      shouldScheduleAutoHint({
        hintAvailable: true,
        hintShown: false,
        showResult: true,
        finished: false,
        inReinforcement: false,
      }),
    ).toBe(false);

    expect(
      shouldScheduleAutoHint({
        hintAvailable: true,
        hintShown: false,
        showResult: false,
        finished: true,
        inReinforcement: false,
      }),
    ).toBe(false);

    expect(
      shouldScheduleAutoHint({
        hintAvailable: true,
        hintShown: false,
        showResult: false,
        finished: false,
        inReinforcement: true,
      }),
    ).toBe(false);
  });

  it("reveals auto-hint once idle threshold is reached", () => {
    expect(shouldAutoRevealHint(14_999)).toBe(false);
    expect(shouldAutoRevealHint(15_000)).toBe(true);
    expect(shouldAutoRevealHint(20_000, 10_000)).toBe(true);
  });
});