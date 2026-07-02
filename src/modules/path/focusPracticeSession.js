/** Questions surfaced in a single weak-area practice round. */
export const FOCUS_PRACTICE_SESSION_LIMIT = 5;

export function sessionProgress(index, total) {
  const safeTotal = Math.max(0, total);
  return {
    current: Math.min(index + 1, safeTotal || 1),
    total: safeTotal,
  };
}

/**
 * Progress bar fill for a practice session.
 * Ticks forward when the current question has been checked so learners see
 * instant session momentum before advancing to the next item.
 */
export function sessionProgressPct(index, total, { answered = false } = {}) {
  if (!total) return 0;
  const step = answered ? index + 2 : index + 1;
  return Math.min(100, Math.round((step / total) * 100));
}

export function isSessionComplete(index, total) {
  return total > 0 && index >= total;
}

export function sessionAccuracy(correct, total) {
  const safeTotal = Math.max(0, Number(total) || 0);
  if (!safeTotal) return 0;
  return Math.round((Math.max(0, Number(correct) || 0) / safeTotal) * 100);
}