/** Streak day counts that trigger a milestone celebration on lesson completion. */
export const STREAK_MILESTONES = [7, 14, 30, 60, 100, 365];

/**
 * Returns the milestone day count when the learner just extended their streak
 * to a milestone, or null when no milestone applies.
 */
export function getStreakMilestone(streakCurrent, streakExtended) {
  if (!streakExtended || streakCurrent <= 0) return null;
  return STREAK_MILESTONES.includes(streakCurrent) ? streakCurrent : null;
}

/** i18n key for a milestone banner, e.g. path.streakMilestone7 */
export function streakMilestoneKey(days) {
  return `path.streakMilestone${days}`;
}