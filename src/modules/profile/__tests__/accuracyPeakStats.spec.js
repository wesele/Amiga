import { beforeEach, describe, expect, it } from "vitest";
import { STATS_STORAGE_KEY } from "@/modules/learn/questionTypeStats.js";
import {
  ACCURACY_PEAK_KEY,
  loadBestAccuracy,
  recordAccuracyPeak,
} from "../accuracyPeakStats.js";

function seedStats(pairKey, correct, wrong) {
  localStorage.setItem(
    STATS_STORAGE_KEY,
    JSON.stringify({
      [pairKey]: {
        T01: { correct, wrong },
      },
    }),
  );
}

describe("accuracyPeakStats", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("returns zero when no peak is stored", () => {
    expect(loadBestAccuracy("zh-es")).toBe(0);
    expect(loadBestAccuracy("")).toBe(0);
  });

  it("does not record a peak until minimum attempts are met", () => {
    seedStats("zh-es", 4, 1);
    const result = recordAccuracyPeak("zh-es");
    expect(result).toEqual({ prevBest: 0, best: 0, isNewPeak: false });
    expect(localStorage.getItem(ACCURACY_PEAK_KEY)).toBeNull();
  });

  it("records a new peak when rolling accuracy improves", () => {
    seedStats("zh-es", 12, 3);
    const first = recordAccuracyPeak("zh-es");
    expect(first).toEqual({ prevBest: 0, best: 80, isNewPeak: true });

    seedStats("zh-es", 14, 1);
    const second = recordAccuracyPeak("zh-es");
    expect(second).toEqual({ prevBest: 80, best: 93, isNewPeak: true });
    expect(loadBestAccuracy("zh-es")).toBe(93);
  });

  it("keeps the previous peak when accuracy drops", () => {
    seedStats("zh-es", 18, 2);
    recordAccuracyPeak("zh-es");

    seedStats("zh-es", 12, 8);
    const result = recordAccuracyPeak("zh-es");
    expect(result).toEqual({ prevBest: 90, best: 90, isNewPeak: false });
    expect(loadBestAccuracy("zh-es")).toBe(90);
  });
});