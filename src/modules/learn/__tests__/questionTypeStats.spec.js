import { beforeEach, describe, expect, it } from "vitest";
import {
  STATS_STORAGE_KEY,
  buildFocusArea,
  findWeakestType,
  loadQuestionTypeStats,
  pairStatsKey,
  recordAnswer,
  recordQuestionTypeResult,
  shouldShowFocusArea,
  typeAccuracyPct,
} from "../questionTypeStats.js";

describe("questionTypeStats", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("builds a stable pair key", () => {
    expect(pairStatsKey("zh", "es")).toBe("zh-es");
  });

  it("accumulates correct and wrong counts per type", () => {
    let stats = recordQuestionTypeResult({}, "T09", true);
    stats = recordQuestionTypeResult(stats, "T09", false);
    stats = recordQuestionTypeResult(stats, "T09", false);
    expect(stats.T09).toEqual({ correct: 1, wrong: 2 });
    expect(typeAccuracyPct(stats.T09)).toBe(33);
  });

  it("ignores unknown question types", () => {
    const stats = recordQuestionTypeResult({ T01: { correct: 1, wrong: 0 } }, "T99", false);
    expect(stats.T99).toBeUndefined();
    expect(stats.T01).toEqual({ correct: 1, wrong: 0 });
  });

  it("finds the weakest type below the accuracy threshold", () => {
    const stats = {
      T01: { correct: 8, wrong: 2 },
      T09: { correct: 2, wrong: 4 },
      T06: { correct: 1, wrong: 4 },
    };
    expect(findWeakestType(stats)?.typeId).toBe("T06");
  });

  it("requires a minimum number of attempts before flagging weakness", () => {
    const stats = { T09: { correct: 0, wrong: 3 } };
    expect(findWeakestType(stats)).toBeNull();
  });

  it("returns null when every tracked type is strong enough", () => {
    const stats = {
      T01: { correct: 9, wrong: 1 },
      T09: { correct: 8, wrong: 2 },
    };
    expect(buildFocusArea(stats)).toBeNull();
    expect(shouldShowFocusArea(buildFocusArea(stats))).toBe(false);
  });

  it("persists stats per language pair in localStorage", () => {
    recordAnswer("zh-es", "T08", false);
    recordAnswer("zh-es", "T08", false);
    recordAnswer("zh-es", "T08", true);
    recordAnswer("zh-fr", "T01", true);

    expect(loadQuestionTypeStats("zh-es").T08).toEqual({ correct: 1, wrong: 2 });
    expect(loadQuestionTypeStats("zh-fr").T01).toEqual({ correct: 1, wrong: 0 });
    expect(JSON.parse(localStorage.getItem(STATS_STORAGE_KEY))).toMatchObject({
      "zh-es": { T08: { correct: 1, wrong: 2 } },
      "zh-fr": { T01: { correct: 1, wrong: 0 } },
    });
  });
});