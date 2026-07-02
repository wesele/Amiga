import { describe, expect, it } from "vitest";
import {
  MAX_WEAK_AREAS,
  buildPracticeWeakAreas,
  findWeakTypes,
  shouldShowPracticeWeakAreas,
} from "../practiceWeakAreas.js";

describe("findWeakTypes", () => {
  it("returns up to three types below the accuracy threshold", () => {
    const stats = {
      T01: { correct: 8, wrong: 2 },
      T05: { correct: 3, wrong: 7 },
      T09: { correct: 2, wrong: 8 },
      T11: { correct: 1, wrong: 9 },
      T03: { correct: 9, wrong: 1 },
    };
    const weak = findWeakTypes(stats);
    expect(weak).toHaveLength(3);
    expect(weak[0].typeId).toBe("T11");
    expect(weak[0].accuracyPct).toBe(10);
    expect(weak[1].typeId).toBe("T09");
    expect(weak[2].typeId).toBe("T05");
  });

  it("ignores types without enough attempts or above the accuracy cutoff", () => {
    const stats = {
      T01: { correct: 4, wrong: 1 },
      T05: { correct: 8, wrong: 2 },
      T09: { correct: 2, wrong: 1 },
    };
    expect(findWeakTypes(stats)).toEqual([]);
  });

  it("respects a custom result limit", () => {
    const stats = {
      T05: { correct: 2, wrong: 8 },
      T09: { correct: 2, wrong: 8 },
      T11: { correct: 2, wrong: 8 },
    };
    expect(findWeakTypes(stats, { limit: 2 })).toHaveLength(2);
  });
});

describe("buildPracticeWeakAreas", () => {
  it("reads tracked stats from local storage for the language pair", () => {
    localStorage.setItem(
      "question_type_stats_v1",
      JSON.stringify({
        "zh-es": {
          T09: { correct: 2, wrong: 8 },
        },
      }),
    );
    const areas = buildPracticeWeakAreas("zh-es");
    expect(areas).toHaveLength(1);
    expect(areas[0].typeId).toBe("T09");
    expect(areas[0].accuracyPct).toBe(20);
  });

  it("returns an empty list when pair key is missing", () => {
    expect(buildPracticeWeakAreas("")).toEqual([]);
  });
});

describe("shouldShowPracticeWeakAreas", () => {
  it("shows the section only when at least one weak area exists", () => {
    expect(shouldShowPracticeWeakAreas([])).toBe(false);
    expect(shouldShowPracticeWeakAreas([{ typeId: "T09" }])).toBe(true);
  });

  it("exports a default cap of three areas", () => {
    expect(MAX_WEAK_AREAS).toBe(3);
  });
});