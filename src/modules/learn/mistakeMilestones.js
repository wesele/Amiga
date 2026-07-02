/** Cumulative mistake-mastery milestones aligned with spaced-repetition review. */
export const MISTAKE_MILESTONES = [10, 25, 50, 100];

export function mistakeMilestoneProgress(mastered) {
  const completed = Math.max(0, Number(mastered) || 0);
  const next = MISTAKE_MILESTONES.find((m) => completed < m) ?? null;
  let progress_pct = 100;
  if (next != null) {
    const prev = MISTAKE_MILESTONES.filter((m) => m < next).at(-1) ?? 0;
    const span = Math.max(1, next - prev);
    progress_pct = Math.round(((completed - prev) / span) * 100);
  }
  return {
    mastered: completed,
    next_milestone: next,
    progress_pct: Math.min(100, Math.max(0, progress_pct)),
  };
}

/**
 * Returns the milestone count when the learner just crossed a threshold,
 * or null when no new milestone applies.
 */
export function mistakeMilestoneReached(prevMastered, newMastered) {
  const prev = Math.max(0, Number(prevMastered) || 0);
  const next = Math.max(0, Number(newMastered) || 0);
  if (next <= prev) return null;
  return MISTAKE_MILESTONES.find((m) => prev < m && next >= m) ?? null;
}

export function shouldShowMistakeMilestone(progress) {
  return Boolean(progress?.next_milestone);
}

export function mistakeMilestoneRingOffset(progress, circumference = 113.1) {
  if (!progress) return circumference;
  const pct = progress.progress_pct / 100;
  return circumference * (1 - pct);
}

/** i18n key for the milestone celebration banner after mistake review. */
export const MISTAKE_MILESTONE_CELEBRATION_KEY = "path.mistakeMilestoneReached";