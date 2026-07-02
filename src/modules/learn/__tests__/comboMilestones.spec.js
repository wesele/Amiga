import { describe, expect, it } from "vitest";
import {
  comboMilestoneProgress,
  comboMilestoneRingOffset,
  shouldShowComboMilestone,
  shouldShowComboMilestoneCard,
} from "../comboMilestones.js";

describe("comboMilestones", () => {
  it("hides card when best combo is zero", () => {
    expect(shouldShowComboMilestone(0)).toBe(false);
    expect(shouldShowComboMilestone(null)).toBe(false);
  });

  it("shows card when best combo is above zero and milestones remain", () => {
    const progress = comboMilestoneProgress(4);
    expect(shouldShowComboMilestone(4)).toBe(true);
    expect(shouldShowComboMilestoneCard(progress)).toBe(true);
    expect(progress).toEqual({
      best: 4,
      next_milestone: 5,
      progress_pct: 50,
      all_unlocked: false,
    });
  });

  it("computes progress from previous milestone toward the next", () => {
    expect(comboMilestoneProgress(2)).toEqual({
      best: 2,
      next_milestone: 3,
      progress_pct: 67,
      all_unlocked: false,
    });
  });

  it("marks all milestones complete at the top threshold", () => {
    const progress = comboMilestoneProgress(10);
    expect(progress).toMatchObject({
      best: 10,
      next_milestone: 10,
      progress_pct: 100,
      all_unlocked: true,
    });
    expect(shouldShowComboMilestoneCard(progress)).toBe(false);
  });

  it("maps progress pct to ring stroke offset", () => {
    const progress = comboMilestoneProgress(4);
    expect(comboMilestoneRingOffset(progress, 100)).toBe(50);
    expect(comboMilestoneRingOffset(null, 100)).toBe(100);
  });
});