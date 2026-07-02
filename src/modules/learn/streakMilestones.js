import { STREAK_MILESTONES } from "@/modules/path/streakMilestone.js";

export { STREAK_MILESTONES };

export function shouldShowStreakMilestone(currentStreak) {
  return (currentStreak ?? 0) > 0;
}

export function shouldShowStreakMilestoneCard(progress) {
  return Boolean(progress && !progress.all_unlocked);
}

export function streakMilestoneRingOffset(progress, circumference = 113.1) {
  if (!progress) return circumference;
  const pct = progress.progress_pct / 100;
  return circumference * (1 - pct);
}

/**
 * Progress toward the next streak-day badge based on the active streak.
 * `longest` determines whether all achievement milestones are unlocked.
 */
export function streakMilestoneProgress(currentStreak, longestStreak) {
  const current = Math.max(0, currentStreak ?? 0);
  const longest = Math.max(0, longestStreak ?? 0);
  const last = STREAK_MILESTONES[STREAK_MILESTONES.length - 1];

  if (longest >= last) {
    return {
      current,
      longest,
      next_milestone: last,
      progress_pct: 100,
      all_unlocked: true,
    };
  }

  const next = STREAK_MILESTONES.find((n) => current < n) ?? null;
  if (!next) {
    return {
      current,
      longest,
      next_milestone: last,
      progress_pct: 100,
      all_unlocked: longest >= last,
    };
  }

  const prev = STREAK_MILESTONES.filter((n) => n < next).pop() ?? 0;
  const range = next - prev;
  const progressPct =
    range > 0 ? Math.min(100, Math.max(0, Math.round(((current - prev) / range) * 100))) : 0;

  return {
    current,
    longest,
    next_milestone: next,
    progress_pct: progressPct,
    all_unlocked: false,
  };
}