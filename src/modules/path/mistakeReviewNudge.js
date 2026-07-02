/**
 * Nudge learners to clear due mistake reviews after a passing lesson.
 * Spaced-repetition items that were already due before this session should
 * be reinforced before starting new lessons.
 */

export function shouldShowMistakeReviewNudge(
  result,
  { dueAtStart = 0, dailyGoalNudgeActive = false } = {},
) {
  if (!result?.passed || dailyGoalNudgeActive) return false;
  return Number(dueAtStart) > 0;
}

export function mistakeReviewNudgeCount(dueAtStart) {
  return Math.max(0, Number(dueAtStart) || 0);
}