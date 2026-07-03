import { describe, expect, it } from "vitest";
import {
  ACTIVITY_KINDS,
  buildTodayActivityItems,
  dailyGoalSubKeyWithActivity,
  dailyGoalSubParamsWithActivity,
  hasTodayActivity,
} from "../todayActivityDisplay.js";

describe("todayActivityDisplay", () => {
  it("builds activity items for lessons, articles, and words", () => {
    const items = buildTodayActivityItems({
      lessons_today: 1,
      articles_read_today: 2,
      words_reviewed_today: 8,
      review_sessions_today: 0,
    });
    expect(items).toHaveLength(3);
    expect(items[0].kind).toBe(ACTIVITY_KINDS.LESSONS);
    expect(items[1].kind).toBe(ACTIVITY_KINDS.ARTICLES);
    expect(items[2].kind).toBe(ACTIVITY_KINDS.WORDS);
  });

  it("shows review credit chip when review session counted but no words chip", () => {
    const items = buildTodayActivityItems({
      lessons_today: 0,
      articles_read_today: 0,
      words_reviewed_today: 0,
      review_sessions_today: 1,
    });
    expect(items).toHaveLength(1);
    expect(items[0].kind).toBe(ACTIVITY_KINDS.REVIEW);
  });

  it("omits review chip when words review already shown", () => {
    const items = buildTodayActivityItems({
      lessons_today: 0,
      words_reviewed_today: 5,
      review_sessions_today: 1,
    });
    expect(items.some((item) => item.kind === ACTIVITY_KINDS.REVIEW)).toBe(false);
  });

  it("detects empty activity", () => {
    expect(hasTodayActivity(null)).toBe(false);
    expect(hasTodayActivity({ lessons_today: 0, articles_read_today: 0 })).toBe(false);
    expect(hasTodayActivity({ articles_read_today: 1 })).toBe(true);
  });

  it("uses reading progress subtitle when only articles contributed", () => {
    const goal = {
      goal_met: false,
      lessons_today: 0,
      articles_read_today: 1,
      target_lessons: 2,
      effective_lessons_today: 0,
    };
    expect(dailyGoalSubKeyWithActivity(goal)).toBe("learn.dailyGoalReadingProgress");
    expect(dailyGoalSubParamsWithActivity(goal)).toEqual({ remaining: 2 });
  });

  it("keeps review-only subtitle when only review session contributed", () => {
    expect(
      dailyGoalSubKeyWithActivity({
        goal_met: false,
        lessons_today: 0,
        review_sessions_today: 1,
      }),
    ).toBe("learn.dailyGoalReviewOnly");
  });

  it("keeps goal met subtitle when target reached", () => {
    expect(
      dailyGoalSubKeyWithActivity({
        goal_met: true,
        lessons_today: 2,
        articles_read_today: 1,
      }),
    ).toBe("learn.dailyGoalMet");
  });
});