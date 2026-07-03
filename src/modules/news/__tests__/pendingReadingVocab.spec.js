import { beforeEach, describe, expect, it } from "vitest";
import {
  PENDING_EXPIRY_MS,
  PENDING_READING_VOCAB_KEY,
  clearPendingReadingVocab,
  peekPendingReadingVocab,
  savePendingReadingVocab,
  seedReadingSessionFromPending,
  shouldShowPendingVocabBanner,
} from "../pendingReadingVocab.js";
import { peekReadingSessionWords } from "../readingSession.js";

const NOW = 1_700_000_000_000;

describe("pendingReadingVocab", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it("saves and reads pending vocab entries", () => {
    savePendingReadingVocab(
      {
        entries: [
          { word: "viaje", context: "El viaje fue largo", articleId: 12 },
          { word: "hotel", context: "Un hotel bonito" },
        ],
        articleTitle: "Tech news",
        articleId: 12,
      },
      { now: NOW },
    );
    const pending = peekPendingReadingVocab({ now: NOW });
    expect(pending).toMatchObject({
      words: ["viaje", "hotel"],
      articleTitle: "Tech news",
      articleId: 12,
      at: NOW,
    });
    expect(pending.entries).toHaveLength(2);
  });

  it("merges and deduplicates entries while refreshing timestamp", () => {
    savePendingReadingVocab(
      {
        entries: [
          { word: "viaje", context: "Old context" },
          { word: "hotel", context: "Hotel ctx" },
        ],
      },
      { now: NOW },
    );
    savePendingReadingVocab(
      {
        entries: [
          { word: "viaje", context: "New context" },
          { word: "playa", context: "La playa" },
        ],
      },
      { now: NOW + 1000 },
    );
    const pending = peekPendingReadingVocab({ now: NOW + 1000 });
    expect(pending.entries).toEqual([
      { word: "viaje", context: "New context" },
      { word: "hotel", context: "Hotel ctx" },
      { word: "playa", context: "La playa" },
    ]);
    expect(pending.at).toBe(NOW + 1000);
  });

  it("clears expired pending vocab on read", () => {
    savePendingReadingVocab(
      { entries: [{ word: "a", context: "A" }] },
      { now: NOW },
    );
    expect(peekPendingReadingVocab({ now: NOW + PENDING_EXPIRY_MS + 1 })).toBeNull();
    expect(localStorage.getItem(PENDING_READING_VOCAB_KEY)).toBeNull();
  });

  it("shows banner when entries exist", () => {
    expect(shouldShowPendingVocabBanner(null)).toBe(false);
    expect(shouldShowPendingVocabBanner({ entries: [] })).toBe(false);
    expect(shouldShowPendingVocabBanner({ entries: [{ word: "a", context: "A" }] })).toBe(
      true,
    );
  });

  it("seeds sessionStorage for vocab review navigation", () => {
    savePendingReadingVocab(
      {
        entries: [
          { word: "casa", context: "Mi casa" },
          { word: "perro", context: "Un perro" },
        ],
      },
      { now: NOW },
    );
    seedReadingSessionFromPending(peekPendingReadingVocab({ now: NOW }));
    expect(peekReadingSessionWords()).toEqual([
      { word: "casa", context: "Mi casa" },
      { word: "perro", context: "Un perro" },
    ]);
  });

  it("clears pending vocab explicitly", () => {
    savePendingReadingVocab(
      { entries: [{ word: "a", context: "A" }] },
      { now: NOW },
    );
    clearPendingReadingVocab();
    expect(peekPendingReadingVocab({ now: NOW })).toBeNull();
  });
});