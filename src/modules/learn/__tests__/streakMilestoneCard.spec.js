import { describe, expect, it } from "vitest";
import { buildStreakMilestoneCard } from "../streakMilestoneCard.js";

describe("streakMilestoneCard", () => {
  it("returns null when streak is inactive", () => {
    expect(buildStreakMilestoneCard(null)).toBeNull();
    expect(buildStreakMilestoneCard({ current: 0, longest: 10 })).toBeNull();
  });

  it("builds milestone progress from active streak", () => {
    expect(buildStreakMilestoneCard({ current: 5, longest: 5 })).toEqual({
      current: 5,
      longest: 5,
      next_milestone: 7,
      progress_pct: 71,
      all_unlocked: false,
    });
  });

  it("marks all milestones complete at the top streak threshold", () => {
    expect(buildStreakMilestoneCard({ current: 30, longest: 365 })).toMatchObject({
      current: 30,
      longest: 365,
      all_unlocked: true,
      progress_pct: 100,
    });
  });
});