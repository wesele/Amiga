import { describe, it, expect } from "vitest";
import {
  weeklyGoalDaysRemaining,
  shouldShowWeeklyGoalNudge,
} from "../weeklyGoalNudge.js";

describe("weeklyGoalNudge", () => {
  it("returns remaining active days when the weekly goal is not yet met", () => {
    expect(
      weeklyGoalDaysRemaining({
        passed: true,
        weekly_goal_active_days: 3,
        weekly_goal_target_days: 5,
      }),
    ).toBe(2);
  });

  it("returns zero when the lesson failed or the weekly goal is complete", () => {
    expect(
      weeklyGoalDaysRemaining({
        passed: false,
        weekly_goal_active_days: 3,
        weekly_goal_target_days: 5,
      }),
    ).toBe(0);
    expect(
      weeklyGoalDaysRemaining({
        passed: true,
        weekly_goal_active_days: 5,
        weekly_goal_target_days: 5,
      }),
    ).toBe(0);
  });

  it("shows nudge only for passing lessons that still need more active days", () => {
    expect(
      shouldShowWeeklyGoalNudge({
        passed: true,
        weekly_goal_just_met: false,
        weekly_goal_active_days: 3,
        weekly_goal_target_days: 5,
      }),
    ).toBe(true);
    expect(
      shouldShowWeeklyGoalNudge({
        passed: true,
        weekly_goal_just_met: true,
        weekly_goal_active_days: 5,
        weekly_goal_target_days: 5,
      }),
    ).toBe(false);
    expect(
      shouldShowWeeklyGoalNudge({
        passed: false,
        weekly_goal_active_days: 0,
        weekly_goal_target_days: 5,
      }),
    ).toBe(false);
  });

  it("defers to the daily goal nudge when both goals are still in progress", () => {
    expect(
      shouldShowWeeklyGoalNudge(
        {
          passed: true,
          weekly_goal_just_met: false,
          weekly_goal_active_days: 2,
          weekly_goal_target_days: 5,
        },
        { dailyGoalNudgeActive: true },
      ),
    ).toBe(false);
  });
});