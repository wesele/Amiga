import { PERFECT_LESSON_MILESTONES } from "@/modules/path/perfectLessonStreak.js";

export { PERFECT_LESSON_MILESTONES };

export function shouldShowPerfectMilestone(bestStreak) {
  return (bestStreak ?? 0) > 0;
}

export function shouldShowPerfectMilestoneCard(progress) {
  return Boolean(progress && !progress.all_unlocked);
}

export function perfectMilestoneRingOffset(progress, circumference = 113.1) {
  if (!progress) return circumference;
  const pct = progress.progress_pct / 100;
  return circumference * (1 - pct);
}

/**
 * Progress toward the next perfect-lesson badge based on personal-best streak.
 */
export function perfectMilestoneProgress(bestStreak) {
  const best = Math.max(0, bestStreak ?? 0);
  const next = PERFECT_LESSON_MILESTONES.find((n) => best < n) ?? null;

  if (!next) {
    const last = PERFECT_LESSON_MILESTONES[PERFECT_LESSON_MILESTONES.length - 1];
    return {
      best,
      next_milestone: last,
      progress_pct: 100,
      all_unlocked: true,
    };
  }

  const prev = PERFECT_LESSON_MILESTONES.filter((n) => n < next).pop() ?? 0;
  const range = next - prev;
  const progressPct =
    range > 0 ? Math.min(100, Math.max(0, Math.round(((best - prev) / range) * 100))) : 0;

  return {
    best,
    next_milestone: next,
    progress_pct: progressPct,
    all_unlocked: false,
  };
}