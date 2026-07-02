/** Consecutive correct-answer counts that trigger in-lesson encouragement. */
export const COMBO_MILESTONES = [3, 5, 10];

/** Minimum combo before showing the live streak badge in the lesson header. */
export const COMBO_BADGE_MIN = 2;

/**
 * Returns the next combo count after an answer check.
 * Wrong answers reset the streak to zero.
 */
export function nextComboCount(current, isCorrect) {
  if (!isCorrect) return 0;
  return current + 1;
}

/**
 * When comboCount exactly hits a milestone, returns that milestone value;
 * otherwise null (no new celebration this answer).
 */
export function getComboMilestone(comboCount) {
  if (comboCount <= 0) return null;
  return COMBO_MILESTONES.includes(comboCount) ? comboCount : null;
}

/** i18n key for a combo toast, e.g. path.comboMilestone3 */
export function comboMilestoneKey(count) {
  return `path.comboMilestone${count}`;
}

/** Whether the header combo badge should be visible. */
export function showComboBadge(comboCount) {
  return comboCount >= COMBO_BADGE_MIN;
}