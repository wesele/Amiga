import { beforeEach, describe, expect, it } from "vitest";
import {
  COMBO_STATS_KEY,
  loadBestCombo,
  recordComboAttempt,
} from "../lessonComboStats.js";

describe("lessonComboStats", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("returns zero when no record exists", () => {
    expect(loadBestCombo("zh-es")).toBe(0);
    expect(loadBestCombo("")).toBe(0);
  });

  it("stores a new personal best when combo exceeds the previous record", () => {
    const first = recordComboAttempt("zh-es", 3);
    expect(first).toEqual({ prevBest: 0, best: 3, isNewBest: true });
    expect(loadBestCombo("zh-es")).toBe(3);

    const second = recordComboAttempt("zh-es", 5);
    expect(second).toEqual({ prevBest: 3, best: 5, isNewBest: true });
    expect(loadBestCombo("zh-es")).toBe(5);
  });

  it("does not downgrade or tie the stored best combo", () => {
    recordComboAttempt("zh-es", 7);
    const lower = recordComboAttempt("zh-es", 4);
    expect(lower).toEqual({ prevBest: 7, best: 7, isNewBest: false });

    const tie = recordComboAttempt("zh-es", 7);
    expect(tie).toEqual({ prevBest: 7, best: 7, isNewBest: false });
    expect(loadBestCombo("zh-es")).toBe(7);
  });

  it("ignores non-positive combo counts", () => {
    recordComboAttempt("zh-es", 6);
    const invalid = recordComboAttempt("zh-es", 0);
    expect(invalid).toEqual({ prevBest: 6, best: 6, isNewBest: false });
    expect(JSON.parse(localStorage.getItem(COMBO_STATS_KEY))["zh-es"].best).toBe(6);
  });

  it("tracks bests independently per language pair", () => {
    recordComboAttempt("zh-es", 4);
    recordComboAttempt("zh-fr", 9);
    expect(loadBestCombo("zh-es")).toBe(4);
    expect(loadBestCombo("zh-fr")).toBe(9);
  });
});