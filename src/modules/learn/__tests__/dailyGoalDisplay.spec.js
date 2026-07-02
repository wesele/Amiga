import { describe, expect, it } from "vitest";
import {
  dailyGoalRemainingLessons,
  dailyGoalRingDone,
  dailyGoalSubKey,
  dailyGoalSubParams,
} from "../dailyGoalDisplay.js";

describe("dailyGoalDisplay", () => {
  it("uses effective lessons for ring progress", () => {
    expect(
      dailyGoalRingDone({
        lessons_today: 0,
        review_sessions_today: 1,
        effective_lessons_today: 1,
        target_lessons: 2,
      }),
    ).toBe(1);
  });

  it("computes remaining from effective progress", () => {
    expect(
      dailyGoalRemainingLessons({
        effective_lessons_today: 1,
        target_lessons: 2,
      }),
    ).toBe(1);
  });

  it("picks review-only subtitle when only review contributed", () => {
    expect(
      dailyGoalSubKey({
        goal_met: false,
        lessons_today: 0,
        review_sessions_today: 1,
      }),
    ).toBe("learn.dailyGoalReviewOnly");
  });

  it("picks mixed subtitle params when lessons and review both count", () => {
    const goal = {
      goal_met: false,
      lessons_today: 1,
      review_sessions_today: 1,
      effective_lessons_today: 2,
      target_lessons: 3,
    };
    expect(dailyGoalSubKey(goal)).toBe("learn.dailyGoalWithReview");
    expect(dailyGoalSubParams(goal)).toEqual({
      done: 2,
      total: 3,
      review: 1,
    });
  });
});