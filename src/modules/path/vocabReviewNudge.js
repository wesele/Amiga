/**
 * Nudge learners to review due vocabulary after a passing lesson.
 * Unmastered words queued before this session should be reinforced
 * before starting new lessons.
 */

export function shouldShowVocabReviewNudge(
  result,
  {
    dueAtStart = 0,
    dailyGoalNudgeActive = false,
    mistakeReviewNudgeActive = false,
  } = {},
) {
  if (!result?.passed || dailyGoalNudgeActive || mistakeReviewNudgeActive) return false;
  return Number(dueAtStart) > 0;
}

export function vocabReviewNudgeCount(dueAtStart) {
  return Math.max(0, Number(dueAtStart) || 0);
}