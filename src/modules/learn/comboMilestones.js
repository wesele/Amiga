import { COMBO_MILESTONES } from "@/modules/path/lessonCombo.js";

export { COMBO_MILESTONES };

export function shouldShowComboMilestone(bestCombo) {
  return (bestCombo ?? 0) > 0;
}

export function shouldShowComboMilestoneCard(progress) {
  return Boolean(progress && !progress.all_unlocked);
}

export function comboMilestoneRingOffset(progress, circumference = 113.1) {
  if (!progress) return circumference;
  const pct = progress.progress_pct / 100;
  return circumference * (1 - pct);
}

/**
 * Progress toward the next combo badge based on personal-best streak.
 */
export function comboMilestoneProgress(bestCombo) {
  const best = Math.max(0, bestCombo ?? 0);
  const next = COMBO_MILESTONES.find((n) => best < n) ?? null;

  if (!next) {
    const last = COMBO_MILESTONES[COMBO_MILESTONES.length - 1];
    return {
      best,
      next_milestone: last,
      progress_pct: 100,
      all_unlocked: true,
    };
  }

  const prev = COMBO_MILESTONES.filter((n) => n < next).pop() ?? 0;
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