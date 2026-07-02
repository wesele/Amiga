/** Word-count milestones aligned with PRODUCT_DESIGN §5.6 vocabulary achievements. */
export const VOCAB_MILESTONES = [100, 500, 1000];

export function vocabMilestoneProgress(known) {
  const completed = Math.max(0, Number(known) || 0);
  const next = VOCAB_MILESTONES.find((m) => completed < m) ?? null;
  let progress_pct = 100;
  if (next != null) {
    const prev =
      VOCAB_MILESTONES.filter((m) => m < next).at(-1) ?? 0;
    const span = Math.max(1, next - prev);
    progress_pct = Math.round(((completed - prev) / span) * 100);
  }
  return {
    known: completed,
    next_milestone: next,
    progress_pct: Math.min(100, Math.max(0, progress_pct)),
  };
}

/**
 * Returns the milestone count when the learner just crossed a threshold,
 * or null when no new milestone applies.
 */
export function vocabMilestoneReached(prevKnown, newKnown) {
  const prev = Math.max(0, Number(prevKnown) || 0);
  const next = Math.max(0, Number(newKnown) || 0);
  if (next <= prev) return null;
  return (
    VOCAB_MILESTONES.find((m) => prev < m && next >= m) ?? null
  );
}

export function shouldShowVocabMilestone(progress) {
  return Boolean(progress?.next_milestone);
}

export function vocabMilestoneRingOffset(progress, circumference = 113.1) {
  if (!progress) return circumference;
  const pct = progress.progress_pct / 100;
  return circumference * (1 - pct);
}

/** i18n key for the milestone celebration banner after vocab review. */
export const VOCAB_MILESTONE_CELEBRATION_KEY = "vocab.vocabMilestoneReached";