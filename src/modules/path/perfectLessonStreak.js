/** Consecutive flawless practice-lesson counts that trigger celebration. */
export const PERFECT_LESSON_MILESTONES = [3, 5, 10];

export function perfectLessonMilestoneKey(days) {
  return `path.perfectLessonStreak${days}`;
}

export function shouldShowPerfectStreakCard(streak) {
  return typeof streak === "number" && streak > 0;
}