import { describe, expect, it } from "vitest";
import {
  dailyGoalRemainingLessons,
  dailyGoalRingDone,
  dailyGoalRingLabelKey,
  dailyGoalSubKey,
  dailyGoalSubParams,
  isActiveDaySecured,
  isPartialDayProgress,
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

  it("detects active day from practiced_today", () => {
    expect(isActiveDaySecured({ practiced_today: true })).toBe(true);
    expect(isActiveDaySecured({ practiced_today: false })).toBe(false);
    expect(isActiveDaySecured(null)).toBe(false);
  });

  it("detects partial day progress when active but lessons remain", () => {
    const readingOnly = {
      practiced_today: true,
      goal_met: false,
      lessons_today: 0,
      articles_read_today: 1,
      target_lessons: 2,
    };
    expect(isPartialDayProgress(readingOnly)).toBe(true);
    expect(dailyGoalRingLabelKey(readingOnly)).toBe("learn.dailyGoalActiveDay");

    const oneLesson = {
      practiced_today: true,
      goal_met: false,
      effective_lessons_today: 1,
      target_lessons: 2,
    };
    expect(isPartialDayProgress(oneLesson)).toBe(true);
    expect(dailyGoalRingLabelKey(oneLesson)).toBe("learn.dailyGoalActiveDay");
  });

  it("returns null ring label key when goal is met", () => {
    expect(dailyGoalRingLabelKey({ goal_met: true, practiced_today: true })).toBeNull();
  });

  it("returns progress key when not practiced today", () => {
    expect(
      dailyGoalRingLabelKey({
        goal_met: false,
        practiced_today: false,
        lessons_today: 0,
        target_lessons: 2,
      }),
    ).toBe("learn.dailyGoalProgress");
  });
});