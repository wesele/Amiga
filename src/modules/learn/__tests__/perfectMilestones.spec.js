import { describe, expect, it } from "vitest";
import {
  perfectMilestoneProgress,
  perfectMilestoneRingOffset,
  shouldShowPerfectMilestone,
  shouldShowPerfectMilestoneCard,
} from "../perfectMilestones.js";

describe("perfectMilestones", () => {
  it("hides card when best perfect streak is zero", () => {
    expect(shouldShowPerfectMilestone(0)).toBe(false);
    expect(shouldShowPerfectMilestone(null)).toBe(false);
  });

  it("shows card when best streak is above zero and milestones remain", () => {
    const progress = perfectMilestoneProgress(2);
    expect(shouldShowPerfectMilestone(2)).toBe(true);
    expect(shouldShowPerfectMilestoneCard(progress)).toBe(true);
    expect(progress).toEqual({
      best: 2,
      next_milestone: 3,
      progress_pct: 67,
      all_unlocked: false,
    });
  });

  it("computes progress from previous milestone toward the next", () => {
    expect(perfectMilestoneProgress(4)).toEqual({
      best: 4,
      next_milestone: 5,
      progress_pct: 50,
      all_unlocked: false,
    });
  });

  it("marks all milestones complete at the top threshold", () => {
    const progress = perfectMilestoneProgress(10);
    expect(progress).toMatchObject({
      best: 10,
      next_milestone: 10,
      progress_pct: 100,
      all_unlocked: true,
    });
    expect(shouldShowPerfectMilestoneCard(progress)).toBe(false);
  });

  it("maps progress pct to ring stroke offset", () => {
    const progress = perfectMilestoneProgress(2);
    expect(perfectMilestoneRingOffset(progress, 100)).toBeCloseTo(33, 0);
    expect(perfectMilestoneRingOffset(null, 100)).toBe(100);
  });
});