import { recordReviewPractice } from "./api.js";

/** i18n key reused from lesson completion streak celebrations. */
export const REVIEW_STREAK_I18N_KEY = "path.streakExtended";

export function reviewStreakCelebration(reviewResult, t) {
  const streak = reviewResult?.streak ?? reviewResult;
  if (!streak?.extended || !t) return "";
  return t(REVIEW_STREAK_I18N_KEY, { n: streak.current });
}

export function reviewDailyGoalCelebration(reviewResult, t) {
  if (!reviewResult?.daily_goal_just_met || !t) return "";
  const goal = reviewResult.daily_goal;
  return t("path.dailyGoalMetCelebration", {
    done: goal.effective_lessons_today ?? goal.lessons_today,
    total: goal.target_lessons,
  });
}

export function reviewDailyGoalNudge(reviewResult, t) {
  const goal = reviewResult?.daily_goal;
  if (!goal || reviewResult?.daily_goal_just_met || goal.goal_met || !t) return "";
  const done = goal.effective_lessons_today ?? goal.lessons_today ?? 0;
  const remaining = Math.max(0, (goal.target_lessons ?? 0) - done);
  if (remaining <= 0) return "";
  if ((goal.review_sessions_today ?? 0) > 0) {
    return t("path.dailyGoalReviewRemaining", { remaining });
  }
  return "";
}

export function reviewDailyGoalContributed(reviewResult, t) {
  const goal = reviewResult?.daily_goal;
  if (!goal || reviewResult?.daily_goal_just_met || goal.goal_met || !t) return "";
  if ((goal.review_sessions_today ?? 0) <= 0) return "";
  return t("path.dailyGoalReviewContributed");
}

export async function applyReviewStreak(
  userId,
  itemsReviewed,
  { sessionComplete = true, targetLanguage } = {},
  deps = {},
) {
  const count = Math.max(1, Number(itemsReviewed) || 0);
  if (!userId || !targetLanguage) return null;

  const record = deps.recordReviewPractice ?? recordReviewPractice;
  try {
    return await record(userId, count, sessionComplete, targetLanguage);
  } catch {
    return null;
  }
}