/**
 * Nudge learners to finish today's lesson goal after a passing lesson.
 * Uses fields already returned by complete_section_cmd.
 */

export function dailyGoalLessonsRemaining(result) {
  if (!result?.passed) return 0;
  const done = Number(result.daily_goal_lessons_today) || 0;
  const target = Number(result.daily_goal_target) || 0;
  if (target <= 0 || done >= target) return 0;
  return target - done;
}

export function shouldShowDailyGoalNudge(result) {
  if (!result?.passed || result.daily_goal_just_met) return false;
  return dailyGoalLessonsRemaining(result) > 0;
}