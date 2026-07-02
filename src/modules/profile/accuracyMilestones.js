/** Practice-accuracy percentage thresholds for achievement badges. */
export const ACCURACY_MILESTONES = [70, 80, 90, 95];

export function shouldShowAccuracyMilestone(bestAccuracyPct) {
  return (bestAccuracyPct ?? 0) > 0;
}

export function shouldShowAccuracyMilestoneCard(progress) {
  return Boolean(progress && !progress.all_unlocked);
}

export function accuracyMilestoneRingOffset(progress, circumference = 113.1) {
  if (!progress) return circumference;
  const pct = progress.progress_pct / 100;
  return circumference * (1 - pct);
}

/**
 * Progress toward the next accuracy badge based on peak accuracy.
 */
export function accuracyMilestoneProgress(bestAccuracyPct) {
  const best = Math.max(0, bestAccuracyPct ?? 0);
  const next = ACCURACY_MILESTONES.find((n) => best < n) ?? null;

  if (!next) {
    const last = ACCURACY_MILESTONES[ACCURACY_MILESTONES.length - 1];
    return {
      best,
      next_milestone: last,
      progress_pct: 100,
      all_unlocked: true,
    };
  }

  const prev = ACCURACY_MILESTONES.filter((n) => n < next).pop() ?? 0;
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