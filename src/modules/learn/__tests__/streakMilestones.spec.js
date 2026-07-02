import { describe, expect, it } from "vitest";
import {
  shouldShowStreakMilestone,
  shouldShowStreakMilestoneCard,
  streakMilestoneProgress,
  streakMilestoneRingOffset,
} from "../streakMilestones.js";

describe("streakMilestones", () => {
  it("hides card when current streak is zero", () => {
    expect(shouldShowStreakMilestone(0)).toBe(false);
    expect(shouldShowStreakMilestone(null)).toBe(false);
  });

  it("shows card when streak is active and milestones remain", () => {
    const progress = streakMilestoneProgress(5, 5);
    expect(shouldShowStreakMilestone(5)).toBe(true);
    expect(shouldShowStreakMilestoneCard(progress)).toBe(true);
    expect(progress).toEqual({
      current: 5,
      longest: 5,
      next_milestone: 7,
      progress_pct: 71,
      all_unlocked: false,
    });
  });

  it("computes progress from previous milestone toward the next", () => {
    expect(streakMilestoneProgress(8, 8)).toEqual({
      current: 8,
      longest: 8,
      next_milestone: 14,
      progress_pct: 14,
      all_unlocked: false,
    });
  });

  it("marks all milestones complete when longest reaches the top threshold", () => {
    const progress = streakMilestoneProgress(200, 365);
    expect(progress).toMatchObject({
      current: 200,
      longest: 365,
      next_milestone: 365,
      progress_pct: 100,
      all_unlocked: true,
    });
    expect(shouldShowStreakMilestoneCard(progress)).toBe(false);
  });

  it("maps progress pct to ring stroke offset", () => {
    const progress = streakMilestoneProgress(5, 5);
    expect(streakMilestoneRingOffset(progress, 100)).toBeCloseTo(29, 5);
    expect(streakMilestoneRingOffset(null, 100)).toBe(100);
  });
});