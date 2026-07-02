/** Questions surfaced in a single weak-area practice round. */
export const FOCUS_PRACTICE_SESSION_LIMIT = 5;

export function sessionProgress(index, total) {
  const safeTotal = Math.max(0, total);
  return {
    current: Math.min(index + 1, safeTotal || 1),
    total: safeTotal,
  };
}

export function sessionProgressPct(index, total) {
  if (!total) return 0;
  return Math.round(((index + 1) / total) * 100);
}

export function isSessionComplete(index, total) {
  return total > 0 && index >= total;
}

export function sessionAccuracy(correct, total) {
  const safeTotal = Math.max(0, Number(total) || 0);
  if (!safeTotal) return 0;
  return Math.round((Math.max(0, Number(correct) || 0) / safeTotal) * 100);
}