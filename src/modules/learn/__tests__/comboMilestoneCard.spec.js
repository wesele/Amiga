import { beforeEach, describe, expect, it } from "vitest";
import { COMBO_STATS_KEY } from "@/modules/path/lessonComboStats.js";
import { buildComboMilestoneCard } from "../comboMilestoneCard.js";

describe("comboMilestoneCard", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("returns null when no combo record exists", () => {
    expect(buildComboMilestoneCard("zh-es")).toBeNull();
  });

  it("builds milestone progress from personal-best combo", () => {
    localStorage.setItem(
      COMBO_STATS_KEY,
      JSON.stringify({ "zh-es": { best: 4, updated_at: 1 } }),
    );

    expect(buildComboMilestoneCard("zh-es")).toEqual({
      best: 4,
      next_milestone: 5,
      progress_pct: 50,
      all_unlocked: false,
    });
  });

  it("marks all milestones complete at the top combo threshold", () => {
    localStorage.setItem(
      COMBO_STATS_KEY,
      JSON.stringify({ "zh-es": { best: 10, updated_at: 1 } }),
    );

    expect(buildComboMilestoneCard("zh-es")).toMatchObject({
      best: 10,
      all_unlocked: true,
      progress_pct: 100,
    });
  });
});