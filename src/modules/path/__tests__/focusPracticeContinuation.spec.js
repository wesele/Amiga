import { describe, expect, it } from "vitest";
import {
  FOCUS_CONTINUE_HINT_KEY,
  FOCUS_CONTINUE_LABEL_KEY,
  shouldOfferFocusContinuation,
} from "../focusPracticeContinuation.js";

describe("focusPracticeContinuation", () => {
  it("offers continuation only when the round had questions and was not perfect", () => {
    expect(shouldOfferFocusContinuation(0, 80)).toBe(false);
    expect(shouldOfferFocusContinuation(5, 100)).toBe(false);
    expect(shouldOfferFocusContinuation(5, 80)).toBe(true);
    expect(shouldOfferFocusContinuation(3, 0)).toBe(true);
  });

  it("offers continuation when accuracy is missing but questions were practiced", () => {
    expect(shouldOfferFocusContinuation(5, null)).toBe(true);
    expect(shouldOfferFocusContinuation(5, undefined)).toBe(true);
  });

  it("uses stable i18n keys for the continue prompt", () => {
    expect(FOCUS_CONTINUE_LABEL_KEY).toBe("path.focusPracticeContinue");
    expect(FOCUS_CONTINUE_HINT_KEY).toBe("path.focusPracticeContinueHint");
  });
});