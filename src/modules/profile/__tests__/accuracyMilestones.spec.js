import { describe, it, expect } from "vitest";
import {
  ACCURACY_MILESTONES,
  accuracyMilestoneProgress,
  shouldShowAccuracyMilestone,
} from "../accuracyMilestones.js";

describe("accuracyMilestones", () => {
  it("defines four accuracy thresholds", () => {
    expect(ACCURACY_MILESTONES).toEqual([70, 80, 90, 95]);
  });

  it("hides milestone UI when no peak accuracy exists", () => {
    expect(shouldShowAccuracyMilestone(0)).toBe(false);
    expect(shouldShowAccuracyMilestone(null)).toBe(false);
    expect(shouldShowAccuracyMilestone(72)).toBe(true);
  });

  it("computes progress toward the next badge", () => {
    expect(accuracyMilestoneProgress(65)).toEqual({
      best: 65,
      next_milestone: 70,
      progress_pct: 93,
      all_unlocked: false,
    });
    expect(accuracyMilestoneProgress(75)).toEqual({
      best: 75,
      next_milestone: 80,
      progress_pct: 50,
      all_unlocked: false,
    });
  });

  it("marks all milestones complete at 95% or above", () => {
    expect(accuracyMilestoneProgress(95)).toMatchObject({
      best: 95,
      next_milestone: 95,
      progress_pct: 100,
      all_unlocked: true,
    });
    expect(accuracyMilestoneProgress(100)).toMatchObject({
      all_unlocked: true,
      progress_pct: 100,
    });
  });
});