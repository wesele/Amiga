export function dailyGoalRingDone(dailyGoal) {
  if (!dailyGoal) return 0;
  return dailyGoal.effective_lessons_today ?? dailyGoal.lessons_today ?? 0;
}

export function dailyGoalRemainingLessons(dailyGoal) {
  if (!dailyGoal) return 0;
  const target = dailyGoal.target_lessons ?? 0;
  const done = dailyGoalRingDone(dailyGoal);
  return Math.max(0, target - done);
}

export function dailyGoalSubKey(dailyGoal) {
  if (!dailyGoal) return "learn.dailyGoalStart";
  if (dailyGoal.goal_met) return "learn.dailyGoalMet";

  const lessons = dailyGoal.lessons_today ?? 0;
  const review = dailyGoal.review_sessions_today ?? 0;
  if (lessons === 0 && review > 0) return "learn.dailyGoalReviewOnly";
  if (lessons > 0 && review > 0) return "learn.dailyGoalWithReview";
  if (lessons > 0) return "learn.dailyGoalLessons";
  return "learn.dailyGoalStart";
}

export function dailyGoalSubParams(dailyGoal) {
  if (!dailyGoal) return {};
  const key = dailyGoalSubKey(dailyGoal);
  if (key === "learn.dailyGoalLessons") {
    return { n: dailyGoal.target_lessons };
  }
  if (key === "learn.dailyGoalWithReview") {
    return {
      done: dailyGoalRingDone(dailyGoal),
      total: dailyGoal.target_lessons,
      review: dailyGoal.review_sessions_today ?? 0,
    };
  }
  return {};
}