import { beforeEach, describe, expect, it } from "vitest";
import {
  MISTAKE_MASTERY_STATS_KEY,
  loadMistakeMasteryStats,
  recordMistakesMastered,
} from "../mistakeMasteryStats.js";

describe("mistakeMasteryStats", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("returns zero when no stats exist", () => {
    expect(loadMistakeMasteryStats("zh-es")).toBe(0);
    expect(loadMistakeMasteryStats("")).toBe(0);
  });

  it("accumulates mastered mistakes per language pair", () => {
    const first = recordMistakesMastered("zh-es", 2, 1000);
    expect(first).toEqual({ prev: 0, next: 2 });
    expect(loadMistakeMasteryStats("zh-es")).toBe(2);

    const second = recordMistakesMastered("zh-es", 3, 2000);
    expect(second).toEqual({ prev: 2, next: 5 });
    expect(loadMistakeMasteryStats("zh-es")).toBe(5);
  });

  it("keeps pair keys isolated", () => {
    recordMistakesMastered("zh-es", 4);
    recordMistakesMastered("en-fr", 7);
    expect(loadMistakeMasteryStats("zh-es")).toBe(4);
    expect(loadMistakeMasteryStats("en-fr")).toBe(7);
  });

  it("ignores non-positive increments", () => {
    recordMistakesMastered("zh-es", 3);
    expect(recordMistakesMastered("zh-es", 0)).toEqual({ prev: 3, next: 3 });
    expect(recordMistakesMastered("zh-es", -1)).toEqual({ prev: 3, next: 3 });
  });

  it("persists under a versioned storage key", () => {
    recordMistakesMastered("zh-es", 1);
    const raw = JSON.parse(localStorage.getItem(MISTAKE_MASTERY_STATS_KEY));
    expect(raw["zh-es"].mastered).toBe(1);
  });
});