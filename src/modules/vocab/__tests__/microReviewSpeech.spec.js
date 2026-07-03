import { describe, expect, it } from "vitest";
import {
  isMicroReviewSpeechTarget,
  shouldAutoPlayMicroReviewSpeech,
} from "../microReviewSpeech.js";

describe("microReviewSpeech", () => {
  describe("isMicroReviewSpeechTarget", () => {
    it("returns false for empty input", () => {
      expect(isMicroReviewSpeechTarget("")).toBe(false);
      expect(isMicroReviewSpeechTarget(null)).toBe(false);
      expect(isMicroReviewSpeechTarget(undefined)).toBe(false);
    });

    it("returns true for a single word", () => {
      expect(isMicroReviewSpeechTarget("mercado")).toBe(true);
      expect(isMicroReviewSpeechTarget("adiós")).toBe(true);
    });

    it("trims surrounding whitespace", () => {
      expect(isMicroReviewSpeechTarget("  hola  ")).toBe(true);
    });

    it("returns false for multi-word phrases", () => {
      expect(isMicroReviewSpeechTarget("por favor")).toBe(false);
      expect(isMicroReviewSpeechTarget("buenos días")).toBe(false);
    });
  });

  describe("shouldAutoPlayMicroReviewSpeech", () => {
    it("auto-plays for an open single-word card", () => {
      expect(
        shouldAutoPlayMicroReviewSpeech({
          open: true,
          word: "mercado",
        }),
      ).toBe(true);
    });

    it("skips phrases", () => {
      expect(
        shouldAutoPlayMicroReviewSpeech({
          open: true,
          word: "por favor",
        }),
      ).toBe(false);
    });

    it("skips when sheet is closed", () => {
      expect(
        shouldAutoPlayMicroReviewSpeech({
          open: false,
          word: "mercado",
        }),
      ).toBe(false);
    });

    it("skips while acting or showing rating ack", () => {
      expect(
        shouldAutoPlayMicroReviewSpeech({
          open: true,
          word: "mercado",
          acting: true,
        }),
      ).toBe(false);
      expect(
        shouldAutoPlayMicroReviewSpeech({
          open: true,
          word: "mercado",
          ratingAck: "positive",
        }),
      ).toBe(false);
    });

    it("respects enableAutoPlay", () => {
      expect(
        shouldAutoPlayMicroReviewSpeech({
          open: true,
          word: "mercado",
          enableAutoPlay: false,
        }),
      ).toBe(false);
    });
  });
});