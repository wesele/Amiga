import { describe, it, expect, beforeEach } from "vitest";
import {
  saveReadingSessionSummary,
  peekReadingSessionSummary,
  consumeReadingSessionSummary,
  peekReadingSessionWords,
  consumeReadingSessionWords,
  buildReadingReviewQueue,
} from "../readingSession.js";

describe("readingSession", () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it("stores and consumes unknown word count while keeping words for review", () => {
    saveReadingSessionSummary({
      unknownCount: 3,
      words: [{ word: "hola", context: "Hola mundo" }],
    });
    expect(peekReadingSessionSummary()).toEqual(
      expect.objectContaining({ unknownCount: 3 }),
    );
    const consumed = consumeReadingSessionSummary();
    expect(consumed?.unknownCount).toBe(3);
    expect(peekReadingSessionSummary()).toBeNull();
    expect(peekReadingSessionWords()).toEqual([
      { word: "hola", context: "Hola mundo" },
    ]);
  });

  it("ignores zero counts", () => {
    saveReadingSessionSummary({ unknownCount: 0 });
    expect(peekReadingSessionSummary()).toBeNull();
  });

  it("deduplicates words by keeping the latest context", () => {
    saveReadingSessionSummary({
      unknownCount: 1,
      words: [
        { word: "Hola", context: "Primera frase" },
        { word: "hola", context: "Segunda frase", articleId: 9 },
      ],
    });
    expect(peekReadingSessionWords()).toEqual([
      { word: "hola", context: "Segunda frase", articleId: 9 },
    ]);
  });

  it("consumes words and clears the stored session", () => {
    saveReadingSessionSummary({
      unknownCount: 2,
      words: [
        { word: "casa", context: "Mi casa" },
        { word: "perro", context: "Un perro" },
      ],
    });
    expect(consumeReadingSessionWords()).toEqual([
      { word: "casa", context: "Mi casa" },
      { word: "perro", context: "Un perro" },
    ]);
    expect(peekReadingSessionWords()).toEqual([]);
    expect(peekReadingSessionSummary()).toBeNull();
  });

  it("prioritizes session words in review queue order", () => {
    const dueWords = [
      { id: 1, word: "perro", mastery: 1 },
      { id: 2, word: "gato", mastery: 1 },
      { id: 3, word: "casa", mastery: null },
    ];
    const sessionWords = [
      { word: "casa", context: "Mi casa grande" },
      { word: "perro", context: "Un perro feliz" },
    ];
    const queue = buildReadingReviewQueue(sessionWords, dueWords, 3);
    expect(queue.map((entry) => entry.word)).toEqual(["casa", "perro", "gato"]);
  });

  it("fills remaining slots from due words when session words are fewer than limit", () => {
    const dueWords = [
      { id: 1, word: "uno", mastery: 1 },
      { id: 2, word: "dos", mastery: 1 },
      { id: 3, word: "tres", mastery: null },
    ];
    const queue = buildReadingReviewQueue(
      [{ word: "tres", context: "Tres gatos" }],
      dueWords,
      3,
    );
    expect(queue.map((entry) => entry.word)).toEqual(["tres", "uno", "dos"]);
  });
});