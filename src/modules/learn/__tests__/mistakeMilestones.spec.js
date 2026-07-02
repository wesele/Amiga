import { describe, expect, it } from "vitest";
import {
  MISTAKE_MILESTONE_CELEBRATION_KEY,
  MISTAKE_MILESTONES,
  mistakeMilestoneProgress,
  mistakeMilestoneReached,
  mistakeMilestoneRingOffset,
  shouldShowMistakeMilestone,
} from "../mistakeMilestones.js";

describe("mistakeMilestones", () => {
  it("defines spaced-repetition mastery thresholds", () => {
    expect(MISTAKE_MILESTONES).toEqual([10, 25, 50, 100]);
  });

  it("computes progress toward the next milestone", () => {
    expect(mistakeMilestoneProgress(0)).toEqual({
      mastered: 0,
      next_milestone: 10,
      progress_pct: 0,
    });
    expect(mistakeMilestoneProgress(5)).toEqual({
      mastered: 5,
      next_milestone: 10,
      progress_pct: 50,
    });
    expect(mistakeMilestoneProgress(100)).toEqual({
      mastered: 100,
      next_milestone: null,
      progress_pct: 100,
    });
  });

  it("detects when a milestone was just crossed", () => {
    expect(mistakeMilestoneReached(8, 9)).toBeNull();
    expect(mistakeMilestoneReached(8, 10)).toBe(10);
    expect(mistakeMilestoneReached(24, 26)).toBe(25);
    expect(mistakeMilestoneReached(10, 10)).toBeNull();
  });

  it("shows the milestone card while goals remain", () => {
    expect(shouldShowMistakeMilestone(mistakeMilestoneProgress(3))).toBe(true);
    expect(shouldShowMistakeMilestone(mistakeMilestoneProgress(100))).toBe(false);
  });

  it("maps progress to ring stroke offset", () => {
    const circumference = 100;
    expect(mistakeMilestoneRingOffset(mistakeMilestoneProgress(0), circumference)).toBe(100);
    expect(mistakeMilestoneRingOffset(mistakeMilestoneProgress(5), circumference)).toBe(50);
    expect(mistakeMilestoneRingOffset(null, circumference)).toBe(100);
  });

  it("uses a single celebration i18n key", () => {
    expect(MISTAKE_MILESTONE_CELEBRATION_KEY).toBe("path.mistakeMilestoneReached");
  });
});