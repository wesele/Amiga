import { describe, expect, it } from "vitest";
import {
  VOCAB_CARD_MODES,
  buildClozeContextParts,
  canRateCard,
  clozeAriaLabel,
  hasRecallContext,
  recallModeRoll,
  resolveVocabCardMode,
  shouldHideTargetOnFront,
} from "../vocabRecallMode.js";

const WORD_WITH_CONTEXT = {
  id: 7,
  word: "frontera",
  mastery: 1,
  example: "Cruzaron la frontera al amanecer.",
  definition_zh: "边境",
};

describe("vocabRecallMode", () => {
  it("detects recall context from session map or stored example", () => {
    expect(hasRecallContext(WORD_WITH_CONTEXT, new Map())).toBe(true);
    expect(
      hasRecallContext(
        { word: "hola" },
        new Map([["hola", "Hola, ¿cómo estás?"]]),
      ),
    ).toBe(true);
    expect(hasRecallContext({ word: "casa" }, new Map())).toBe(false);
  });

  it("builds cloze parts with a blank instead of the target word", () => {
    const parts = buildClozeContextParts(
      "Cruzaron la frontera al amanecer.",
      "frontera",
    );
    expect(parts).toEqual([
      { text: "Cruzaron la ", highlight: false },
      { text: "___", blank: true },
      { text: " al amanecer.", highlight: false },
    ]);
  });

  it("reads cloze aria labels with the target word replaced by blank", () => {
    expect(clozeAriaLabel("Cruzaron la frontera al amanecer.", "frontera", "空白")).toBe(
      "Cruzaron la 空白 al amanecer.",
    );
  });

  it("prioritizes cloze for mastery 1 words with context on eligible rolls", () => {
    const dateKey = "2026-07-03";
    const roll = recallModeRoll(WORD_WITH_CONTEXT, dateKey);
    const mode = resolveVocabCardMode(WORD_WITH_CONTEXT, {
      index: 2,
      sessionContextMap: new Map(),
      mastery: 1,
      readingSessionMode: true,
      dateKey,
    });
    if (roll < 50) {
      expect(mode).toBe(VOCAB_CARD_MODES.CLOZE);
    } else {
      expect(mode).toBe(VOCAB_CARD_MODES.CLASSIC);
    }
  });

  it("forces classic warm-up cards in reading micro-review", () => {
    expect(
      resolveVocabCardMode(WORD_WITH_CONTEXT, {
        index: 0,
        readingSessionMode: true,
      }),
    ).toBe(VOCAB_CARD_MODES.CLASSIC);
  });

  it("can pick reverse mode when there is no context but a definition exists", () => {
    const word = { id: 9, word: "casa", mastery: 1, definition_zh: "房子" };
    const dateKey = "2026-07-03";
    const roll = recallModeRoll(word, dateKey);
    const mode = resolveVocabCardMode(word, {
      index: 3,
      sessionContextMap: new Map(),
      mastery: 1,
      nativeLang: "zh",
      dateKey,
    });
    if (roll < 25) {
      expect(mode).toBe(VOCAB_CARD_MODES.REVERSE);
    } else {
      expect(mode).toBe(VOCAB_CARD_MODES.CLASSIC);
    }
  });

  it("hides the target word on recall fronts and gates rating until reveal", () => {
    expect(shouldHideTargetOnFront(VOCAB_CARD_MODES.CLOZE)).toBe(true);
    expect(shouldHideTargetOnFront(VOCAB_CARD_MODES.CLASSIC)).toBe(false);
    expect(
      canRateCard({
        mode: VOCAB_CARD_MODES.CLOZE,
        flipped: false,
        revealed: false,
      }),
    ).toBe(false);
    expect(
      canRateCard({
        mode: VOCAB_CARD_MODES.CLOZE,
        flipped: true,
        revealed: true,
      }),
    ).toBe(true);
    expect(
      canRateCard({
        mode: VOCAB_CARD_MODES.CLASSIC,
        flipped: true,
      }),
    ).toBe(true);
  });

  it("assigns cloze to at least 40% of mastery-1 contextual words across a sample", () => {
    const words = Array.from({ length: 20 }, (_, index) => ({
      id: index + 1,
      word: `word${index}`,
      mastery: 1,
      example: `Context for word${index}.`,
    }));
    const dateKey = "2026-07-03";
    const clozeCount = words.filter(
      (word) =>
        resolveVocabCardMode(word, {
          index: 2,
          sessionContextMap: new Map(),
          mastery: 1,
          dateKey,
        }) === VOCAB_CARD_MODES.CLOZE,
    ).length;
    expect(clozeCount / words.length).toBeGreaterThanOrEqual(0.4);
  });
});