/** Lesson-count milestones aligned with the achievements track. */
export const LESSON_MILESTONES = [10, 25, 50, 100, 250, 500];

export function shouldShowLessonMilestone(progress) {
  return Boolean(progress?.next_milestone);
}

export function lessonMilestoneRingOffset(progress, circumference = 113.1) {
  if (!progress) return circumference;
  const pct = progress.progress_pct / 100;
  return circumference * (1 - pct);
}

/** i18n key for the milestone celebration banner on lesson completion. */
export const LESSON_MILESTONE_CELEBRATION_KEY = "path.lessonMilestoneReached";