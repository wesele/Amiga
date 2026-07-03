import { describe, it, expect } from "vitest";
import {
  contextSpeechPlainText,
  contextSpeechTextFromParts,
  resolveContextSpeechParts,
  resolveContextSpeechText,
  shouldAutoPlayContextSpeechOnFlip,
  shouldOfferContextSentenceSpeech,
} from "../contextSentenceSpeech.js";
import { pickReviewContext } from "../vocabReviewContext.js";

describe("contextSentenceSpeech", () => {
  it("joins highlight parts into plain TTS text", () => {
    expect(
      contextSpeechPlainText([
        { text: "Cruzaron la ", highlight: false },
        { text: "frontera", highlight: true },
        { text: " al amanecer.", highlight: false },
      ]),
    ).toBe("Cruzaron la frontera al amanecer.");
  });

  it("returns empty string for missing parts", () => {
    expect(contextSpeechPlainText([])).toBe("");
    expect(contextSpeechPlainText(null)).toBe("");
  });

  it("resolves speech text from the same source as pickReviewContext", () => {
    const word = { word: "frontera", example: "Ejemplo del banco." };
    const map = new Map([["frontera", "Cruzaron la frontera al amanecer."]]);
    const resolved = resolveContextSpeechText(word, map);
    expect(resolved).toBe(pickReviewContext(word, map));
    expect(resolved).toBe("Cruzaron la frontera al amanecer.");
  });

  it("falls back to example when session context is absent", () => {
    expect(
      resolveContextSpeechText({ word: "asilo", example: "Pidió asilo político." }, new Map()),
    ).toBe("Pidió asilo político.");
  });

  it("prefers parts over fallback text", () => {
    expect(
      contextSpeechTextFromParts(
        [{ text: "La ", highlight: false }, { text: "frontera", highlight: true }],
        "ignored fallback",
      ),
    ).toBe("La frontera");
  });

  it("uses fallback when parts are empty", () => {
    expect(contextSpeechTextFromParts([], "  Hola mundo.  ")).toBe("Hola mundo.");
  });

  it("shouldOfferContextSentenceSpeech requires non-empty trimmed text", () => {
    expect(shouldOfferContextSentenceSpeech("Cruzaron la frontera.")).toBe(true);
    expect(shouldOfferContextSentenceSpeech("   ")).toBe(false);
    expect(shouldOfferContextSentenceSpeech("")).toBe(false);
  });

  it("shouldAutoPlayContextSpeechOnFlip is false in V1", () => {
    expect(
      shouldAutoPlayContextSpeechOnFlip({
        flipped: true,
        contextText: "Cruzaron la frontera.",
        acting: false,
      }),
    ).toBe(false);
    expect(
      shouldAutoPlayContextSpeechOnFlip({
        flipped: false,
        contextText: "Cruzaron la frontera.",
      }),
    ).toBe(false);
  });

  it("resolveContextSpeechParts matches pickReviewContext text", () => {
    const word = { word: "inmigración", example: "La inmigración cambió la frontera." };
    const { text, parts } = resolveContextSpeechParts(word, new Map());
    expect(text).toBe(pickReviewContext(word, new Map()));
    expect(contextSpeechPlainText(parts)).toBe(text);
  });
});