/**
 * Nudge learners to stay on track for the weekly active-day goal after a passing lesson.
 * Uses fields already returned by complete_section_cmd.
 */

export function weeklyGoalDaysRemaining(result) {
  if (!result?.passed) return 0;
  const done = Number(result.weekly_goal_active_days) || 0;
  const target = Number(result.weekly_goal_target_days) || 0;
  if (target <= 0 || done >= target) return 0;
  return target - done;
}

export function shouldShowWeeklyGoalNudge(result, { dailyGoalNudgeActive = false } = {}) {
  if (!result?.passed || result.weekly_goal_just_met || dailyGoalNudgeActive) return false;
  return weeklyGoalDaysRemaining(result) > 0;
}