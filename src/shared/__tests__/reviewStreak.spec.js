import { describe, expect, it } from "vitest";
import {
  reviewDailyGoalCelebration,
  reviewDailyGoalNudge,
  reviewStreakCelebration,
} from "../reviewStreak.js";

const t = (key, params) => `${key}:${JSON.stringify(params ?? {})}`;

describe("reviewStreak", () => {
  it("reads streak from review practice result wrapper", () => {
    const text = reviewStreakCelebration(
      { streak: { extended: true, current: 5 } },
      t,
    );
    expect(text).toContain("path.streakExtended");
    expect(text).toContain("5");
  });

  it("shows daily goal celebration when review just met the goal", () => {
    const text = reviewDailyGoalCelebration(
      {
        daily_goal_just_met: true,
        daily_goal: {
          effective_lessons_today: 1,
          target_lessons: 1,
        },
      },
      t,
    );
    expect(text).toContain("path.dailyGoalMetCelebration");
  });

  it("shows review-specific remaining nudge when review credit is partial", () => {
    const text = reviewDailyGoalNudge(
      {
        daily_goal_just_met: false,
        daily_goal: {
          goal_met: false,
          review_sessions_today: 1,
          effective_lessons_today: 1,
          target_lessons: 2,
        },
      },
      t,
    );
    expect(text).toContain("path.dailyGoalReviewRemaining");
  });
});