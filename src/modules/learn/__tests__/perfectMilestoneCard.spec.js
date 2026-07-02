import { describe, expect, it } from "vitest";
import { buildPerfectMilestoneCard } from "../perfectMilestoneCard.js";

describe("perfectMilestoneCard", () => {
  it("returns null when no perfect streak record exists", () => {
    expect(buildPerfectMilestoneCard(null)).toBeNull();
    expect(buildPerfectMilestoneCard({ current: 0, best: 0 })).toBeNull();
  });

  it("builds milestone progress from personal-best perfect streak", () => {
    expect(buildPerfectMilestoneCard({ current: 2, best: 2 })).toEqual({
      best: 2,
      next_milestone: 3,
      progress_pct: 67,
      all_unlocked: false,
    });
  });

  it("marks all milestones complete at the top threshold", () => {
    expect(buildPerfectMilestoneCard({ current: 10, best: 10 })).toMatchObject({
      best: 10,
      all_unlocked: true,
      progress_pct: 100,
    });
  });
});