import { beforeEach, describe, expect, it } from "vitest";
import { STATS_STORAGE_KEY } from "@/modules/learn/questionTypeStats.js";
import {
  MIN_ATTEMPTS_FOR_ACCURACY,
  accuracyTier,
  accuracyValueClass,
  aggregatePracticeStats,
  buildPracticeAccuracy,
  practiceAccuracyPct,
  shouldShowPracticeAccuracy,
} from "../practiceAccuracy.js";

describe("practiceAccuracy", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("aggregates correct and wrong counts across tracked types", () => {
    const stats = {
      T01: { correct: 8, wrong: 2 },
      T09: { correct: 3, wrong: 1 },
      T99: { correct: 100, wrong: 0 },
    };
    expect(aggregatePracticeStats(stats)).toEqual({
      correct: 11,
      wrong: 3,
      total: 14,
    });
    expect(practiceAccuracyPct(stats)).toBe(79);
  });

  it("returns null when there are no attempts", () => {
    expect(practiceAccuracyPct({})).toBeNull();
    expect(buildPracticeAccuracy("zh-es")).toBeNull();
  });

  it("requires a minimum number of attempts before displaying", () => {
    localStorage.setItem(
      STATS_STORAGE_KEY,
      JSON.stringify({
        "zh-es": {
          T01: { correct: 4, wrong: 1 },
          T09: { correct: 2, wrong: 2 },
        },
      }),
    );
    expect(buildPracticeAccuracy("zh-es")).toBeNull();
    expect(
      buildPracticeAccuracy("zh-es", { minAttempts: MIN_ATTEMPTS_FOR_ACCURACY }),
    ).toBeNull();
  });

  it("builds accuracy for a language pair once enough attempts exist", () => {
    localStorage.setItem(
      STATS_STORAGE_KEY,
      JSON.stringify({
        "zh-es": {
          T01: { correct: 7, wrong: 3 },
          T06: { correct: 5, wrong: 0 },
        },
      }),
    );
    const accuracy = buildPracticeAccuracy("zh-es");
    expect(accuracy).toEqual({
      accuracyPct: 80,
      totalAttempts: 15,
      correct: 12,
      wrong: 3,
    });
    expect(shouldShowPracticeAccuracy(accuracy)).toBe(true);
  });

  it("maps accuracy percentages to visual tiers", () => {
    expect(accuracyTier(95)).toBe("excellent");
    expect(accuracyTier(80)).toBe("good");
    expect(accuracyTier(65)).toBe("fair");
    expect(accuracyTier(40)).toBe("needs_work");
    expect(accuracyValueClass(95)).toBe("tier-excellent");
    expect(accuracyValueClass(40)).toBe("tier-needs_work");
  });
});