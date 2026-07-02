/**
 * Nudge learners to reinforce their weakest question type after a passing lesson.
 * Surfaces when higher-priority nudges (daily goal, mistake/vocab review) are inactive.
 */

export function shouldShowFocusAreaNudge(
  result,
  {
    focusArea = null,
    dailyGoalNudgeActive = false,
    mistakeReviewNudgeActive = false,
    freshMistakeNudgeActive = false,
    vocabReviewNudgeActive = false,
  } = {},
) {
  if (
    !result?.passed ||
    dailyGoalNudgeActive ||
    mistakeReviewNudgeActive ||
    freshMistakeNudgeActive ||
    vocabReviewNudgeActive
  ) {
    return false;
  }
  return focusArea != null && focusArea.typeId != null;
}