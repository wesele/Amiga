import { beforeEach, describe, expect, it } from "vitest";
import {
  clearPendingAiPractice,
  formatPendingPracticePreview,
  PENDING_EXPIRY_MS,
  PENDING_PRACTICE_KEY,
  PENDING_SOURCES,
  peekPendingAiPractice,
  planHasAiPracticeStep,
  savePendingAiPractice,
  shouldShowPendingPracticeHero,
} from "../pendingAiPractice.js";

const NOW = 1_700_000_000_000;

describe("pendingAiPractice", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("detects AI practice steps in post-session plans", () => {
    expect(planHasAiPracticeStep(null)).toBe(false);
    expect(
      planHasAiPracticeStep({
        primary: { id: "vocabReview" },
        secondary: [{ id: "aiPractice" }],
      }),
    ).toBe(true);
    expect(
      planHasAiPracticeStep({
        primary: { contactAction: "aiPractice" },
        secondary: [],
      }),
    ).toBe(true);
  });

  it("saves and reads pending practice", () => {
    savePendingAiPractice(
      { source: PENDING_SOURCES.READING, words: ["viaje", "hotel", "playa"] },
      { now: NOW },
    );
    const pending = peekPendingAiPractice({ now: NOW });
    expect(pending).toMatchObject({
      source: PENDING_SOURCES.READING,
      words: ["viaje", "hotel", "playa"],
      at: NOW,
    });
  });

  it("merges additional words for the same source and refreshes timestamp", () => {
    savePendingAiPractice(
      { source: PENDING_SOURCES.VOCAB, words: ["alpha", "beta", "gamma"] },
      { now: NOW },
    );
    savePendingAiPractice(
      { source: PENDING_SOURCES.VOCAB, words: ["gamma", "delta"] },
      { now: NOW + 1000 },
    );
    const pending = peekPendingAiPractice({ now: NOW + 1000 });
    expect(pending.words).toEqual(["alpha", "beta", "gamma", "delta"]);
    expect(pending.at).toBe(NOW + 1000);
  });

  it("replaces pending practice when source changes", () => {
    savePendingAiPractice(
      { source: PENDING_SOURCES.READING, words: ["a", "b", "c"] },
      { now: NOW },
    );
    savePendingAiPractice(
      { source: PENDING_SOURCES.VOCAB, words: ["x", "y", "z"] },
      { now: NOW + 1 },
    );
    const pending = peekPendingAiPractice({ now: NOW + 1 });
    expect(pending).toMatchObject({
      source: PENDING_SOURCES.VOCAB,
      words: ["x", "y", "z"],
    });
  });

  it("ignores saves with fewer than three words", () => {
    savePendingAiPractice(
      { source: PENDING_SOURCES.READING, words: ["a", "b"] },
      { now: NOW },
    );
    expect(peekPendingAiPractice({ now: NOW })).toBeNull();
    expect(localStorage.getItem(PENDING_PRACTICE_KEY)).toBeNull();
  });

  it("clears expired pending practice on read", () => {
    savePendingAiPractice(
      { source: PENDING_SOURCES.READING, words: ["a", "b", "c"] },
      { now: NOW },
    );
    expect(peekPendingAiPractice({ now: NOW + PENDING_EXPIRY_MS + 1 })).toBeNull();
    expect(localStorage.getItem(PENDING_PRACTICE_KEY)).toBeNull();
  });

  it("clears pending practice explicitly", () => {
    savePendingAiPractice(
      { source: PENDING_SOURCES.READING, words: ["a", "b", "c"] },
      { now: NOW },
    );
    clearPendingAiPractice();
    expect(peekPendingAiPractice({ now: NOW })).toBeNull();
  });

  it("formats preview words", () => {
    expect(formatPendingPracticePreview(["a", "b", "c", "d"])).toBe("a, b, c…");
  });

  it("shows hero only when at least three words are pending", () => {
    expect(shouldShowPendingPracticeHero({ words: ["a", "b"] })).toBe(false);
    expect(shouldShowPendingPracticeHero({ words: ["a", "b", "c"] })).toBe(true);
    expect(shouldShowPendingPracticeHero(null)).toBe(false);
  });
});