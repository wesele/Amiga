import { describe, expect, it } from "vitest";
import {
  buildWeeklyGoalProgress,
  shouldShowWeeklyGoal,
  weeklyGoalFromDailyTarget,
  weeklyGoalRingOffset,
} from "../weeklyGoal.js";

const SAMPLE_ACTIVITY = {
  active_days: 3,
  days: [
    { date: "2026-06-26", weekday: 4, active: false, is_today: false },
    { date: "2026-07-02", weekday: 3, active: true, is_today: true },
  ],
};

describe("weeklyGoal", () => {
  it("maps daily lesson targets to weekly active-day goals", () => {
    expect(weeklyGoalFromDailyTarget(1)).toBe(3);
    expect(weeklyGoalFromDailyTarget(2)).toBe(5);
    expect(weeklyGoalFromDailyTarget(3)).toBe(6);
  });

  it("builds progress from weekly activity and daily target", () => {
    expect(buildWeeklyGoalProgress(SAMPLE_ACTIVITY, 2)).toEqual({
      active_days: 3,
      target_days: 5,
      progress_pct: 60,
      goal_met: false,
      days_remaining: 2,
    });
  });

  it("marks goal met when active days reach the target", () => {
    const met = buildWeeklyGoalProgress({ ...SAMPLE_ACTIVITY, active_days: 5 }, 2);
    expect(met?.goal_met).toBe(true);
    expect(met?.days_remaining).toBe(0);
    expect(met?.progress_pct).toBe(100);
  });

  it("returns null for invalid activity payloads", () => {
    expect(buildWeeklyGoalProgress(null, 2)).toBeNull();
    expect(buildWeeklyGoalProgress({ days: [] }, 2)).toBeNull();
  });

  it("computes ring offset from progress percentage", () => {
    const circumference = 113.1;
    expect(weeklyGoalRingOffset(50, circumference)).toBeCloseTo(56.55, 1);
    expect(weeklyGoalRingOffset(100, circumference)).toBe(0);
    expect(weeklyGoalRingOffset(0, circumference)).toBe(circumference);
  });

  it("detects when weekly goal UI should render", () => {
    expect(shouldShowWeeklyGoal(SAMPLE_ACTIVITY, 2)).toBe(true);
    expect(shouldShowWeeklyGoal(null, 2)).toBe(false);
  });
});