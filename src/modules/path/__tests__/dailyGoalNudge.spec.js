import { describe, it, expect } from "vitest";
import {
  dailyGoalLessonsRemaining,
  shouldShowDailyGoalNudge,
} from "../dailyGoalNudge.js";

describe("dailyGoalNudge", () => {
  it("returns remaining lessons when goal is not yet met", () => {
    expect(
      dailyGoalLessonsRemaining({
        passed: true,
        daily_goal_lessons_today: 1,
        daily_goal_target: 3,
      }),
    ).toBe(2);
  });

  it("returns zero when the lesson failed or goal is complete", () => {
    expect(
      dailyGoalLessonsRemaining({
        passed: false,
        daily_goal_lessons_today: 1,
        daily_goal_target: 3,
      }),
    ).toBe(0);
    expect(
      dailyGoalLessonsRemaining({
        passed: true,
        daily_goal_lessons_today: 2,
        daily_goal_target: 2,
      }),
    ).toBe(0);
  });

  it("shows nudge only for passing lessons that still need more work", () => {
    expect(
      shouldShowDailyGoalNudge({
        passed: true,
        daily_goal_just_met: false,
        daily_goal_lessons_today: 1,
        daily_goal_target: 2,
      }),
    ).toBe(true);
    expect(
      shouldShowDailyGoalNudge({
        passed: true,
        daily_goal_just_met: true,
        daily_goal_lessons_today: 2,
        daily_goal_target: 2,
      }),
    ).toBe(false);
    expect(
      shouldShowDailyGoalNudge({
        passed: false,
        daily_goal_lessons_today: 0,
        daily_goal_target: 2,
      }),
    ).toBe(false);
  });
});