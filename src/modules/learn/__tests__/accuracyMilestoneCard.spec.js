import { beforeEach, describe, expect, it } from "vitest";
import { STATS_STORAGE_KEY } from "../questionTypeStats.js";
import { ACCURACY_PEAK_KEY } from "@/modules/profile/accuracyPeakStats.js";
import { buildAccuracyMilestoneCard } from "../accuracyMilestoneCard.js";

describe("accuracyMilestoneCard", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("returns null when practice attempts are below the minimum", () => {
    localStorage.setItem(
      STATS_STORAGE_KEY,
      JSON.stringify({
        "zh-es": { T01: { correct: 4, wrong: 2 } },
      }),
    );
    localStorage.setItem(
      ACCURACY_PEAK_KEY,
      JSON.stringify({ "zh-es": { best: 65 } }),
    );

    expect(buildAccuracyMilestoneCard("zh-es")).toBeNull();
  });

  it("builds milestone progress from peak accuracy when enough attempts exist", () => {
    localStorage.setItem(
      STATS_STORAGE_KEY,
      JSON.stringify({
        "zh-es": { T01: { correct: 6, wrong: 4 } },
      }),
    );
    localStorage.setItem(
      ACCURACY_PEAK_KEY,
      JSON.stringify({ "zh-es": { best: 75 } }),
    );

    expect(buildAccuracyMilestoneCard("zh-es")).toEqual({
      best: 75,
      next_milestone: 80,
      progress_pct: 50,
      all_unlocked: false,
    });
  });

  it("marks all milestones complete at 95% peak accuracy", () => {
    localStorage.setItem(
      STATS_STORAGE_KEY,
      JSON.stringify({
        "zh-es": { T01: { correct: 9, wrong: 1 } },
      }),
    );
    localStorage.setItem(
      ACCURACY_PEAK_KEY,
      JSON.stringify({ "zh-es": { best: 95 } }),
    );

    expect(buildAccuracyMilestoneCard("zh-es")).toMatchObject({
      best: 95,
      all_unlocked: true,
      progress_pct: 100,
    });
  });
});