/**
 * Weekly practice goals derived from the learner's daily lesson commitment.
 * Mirrors the intensity tiers used for daily lesson targets.
 */

/** Active-day targets for a rolling 7-day window. */
export function weeklyGoalFromDailyTarget(targetLessons) {
  if (targetLessons >= 3) return 6;
  if (targetLessons >= 2) return 5;
  return 3;
}

export function buildWeeklyGoalProgress(activity, targetLessons) {
  if (!activity || !Array.isArray(activity.days) || activity.days.length === 0) {
    return null;
  }
  const target = weeklyGoalFromDailyTarget(targetLessons);
  const activeDays = Math.max(0, activity.active_days ?? 0);
  const progressPct =
    target > 0 ? Math.min(100, Math.round((activeDays / target) * 100)) : 0;
  return {
    active_days: activeDays,
    target_days: target,
    progress_pct: progressPct,
    goal_met: activeDays >= target,
    days_remaining: Math.max(0, target - activeDays),
  };
}

export function weeklyGoalRingOffset(progressPct, circumference) {
  const pct = Math.min(100, Math.max(0, progressPct ?? 0)) / 100;
  return circumference * (1 - pct);
}

export function shouldShowWeeklyGoal(activity, targetLessons) {
  return buildWeeklyGoalProgress(activity, targetLessons) != null;
}