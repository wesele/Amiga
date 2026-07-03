import {
  dailyGoalRemainingLessons,
  dailyGoalSubKey,
  dailyGoalSubParams,
} from "./dailyGoalDisplay.js";

export const ACTIVITY_KINDS = {
  LESSONS: "lessons",
  ARTICLES: "articles",
  WORDS: "words",
  REVIEW: "review",
};

/** 从 dailyGoal 构建今日轨迹条目（仅 count > 0 的项） */
export function buildTodayActivityItems(dailyGoal) {
  if (!dailyGoal) return [];

  const items = [];
  const lessons = dailyGoal.lessons_today ?? 0;
  const articles = dailyGoal.articles_read_today ?? 0;
  const words = dailyGoal.words_reviewed_today ?? 0;
  const reviewSessions = dailyGoal.review_sessions_today ?? 0;

  if (lessons > 0) {
    items.push({
      kind: ACTIVITY_KINDS.LESSONS,
      icon: "🛤️",
      labelKey: "learn.todayLessons",
      params: { n: lessons },
    });
  }
  if (articles > 0) {
    items.push({
      kind: ACTIVITY_KINDS.ARTICLES,
      icon: "📰",
      labelKey: "learn.todayArticles",
      params: { n: articles },
    });
  }
  if (words > 0) {
    items.push({
      kind: ACTIVITY_KINDS.WORDS,
      icon: "📚",
      labelKey: "learn.todayWords",
      params: { n: words },
    });
  }
  if (reviewSessions > 0 && words === 0) {
    items.push({
      kind: ACTIVITY_KINDS.REVIEW,
      icon: "🔁",
      labelKey: "learn.todayReviewCredit",
      params: {},
    });
  }

  return items;
}

/** 是否有任何今日活动 */
export function hasTodayActivity(dailyGoal) {
  return buildTodayActivityItems(dailyGoal).length > 0;
}

/** 增强版副文案 key：阅读保连胜但课时未达成时的提示 */
export function dailyGoalSubKeyWithActivity(dailyGoal) {
  if (!dailyGoal) return "learn.dailyGoalStart";
  if (dailyGoal.goal_met) return "learn.dailyGoalMet";

  const lessons = dailyGoal.lessons_today ?? 0;
  const articles = dailyGoal.articles_read_today ?? 0;
  const review = dailyGoal.review_sessions_today ?? 0;

  if (lessons === 0 && articles > 0) return "learn.dailyGoalReadingProgress";
  if (lessons === 0 && review > 0) return "learn.dailyGoalReviewOnly";

  return dailyGoalSubKey(dailyGoal);
}

export function dailyGoalSubParamsWithActivity(dailyGoal) {
  if (!dailyGoal) return {};
  const key = dailyGoalSubKeyWithActivity(dailyGoal);
  if (key === "learn.dailyGoalReadingProgress") {
    return { remaining: dailyGoalRemainingLessons(dailyGoal) };
  }
  return dailyGoalSubParams(dailyGoal);
}