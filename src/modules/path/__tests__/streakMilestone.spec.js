import { describe, expect, it } from "vitest";
import {
  STREAK_MILESTONES,
  getStreakMilestone,
  streakMilestoneKey,
} from "../streakMilestone.js";

describe("getStreakMilestone", () => {
  it("returns null when streak was not extended", () => {
    expect(getStreakMilestone(7, false)).toBeNull();
    expect(getStreakMilestone(30, false)).toBeNull();
  });

  it("returns null for non-milestone streak counts", () => {
    expect(getStreakMilestone(1, true)).toBeNull();
    expect(getStreakMilestone(8, true)).toBeNull();
    expect(getStreakMilestone(29, true)).toBeNull();
  });

  it("returns the day count for each configured milestone", () => {
    for (const days of STREAK_MILESTONES) {
      expect(getStreakMilestone(days, true)).toBe(days);
    }
  });

  it("returns null for zero or negative streak", () => {
    expect(getStreakMilestone(0, true)).toBeNull();
    expect(getStreakMilestone(-1, true)).toBeNull();
  });
});

describe("streakMilestoneKey", () => {
  it("builds namespaced i18n keys from milestone day counts", () => {
    expect(streakMilestoneKey(7)).toBe("path.streakMilestone7");
    expect(streakMilestoneKey(365)).toBe("path.streakMilestone365");
  });
});