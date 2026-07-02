import {
  TRACKED_QUESTION_TYPES,
  loadQuestionTypeStats,
} from "@/modules/learn/questionTypeStats.js";

/** Minimum answered questions before showing accuracy (avoids noisy early estimates). */
export const MIN_ATTEMPTS_FOR_ACCURACY = 10;

export function aggregatePracticeStats(stats) {
  let correct = 0;
  let wrong = 0;

  for (const typeId of TRACKED_QUESTION_TYPES) {
    const record = stats?.[typeId];
    correct += record?.correct ?? 0;
    wrong += record?.wrong ?? 0;
  }

  return { correct, wrong, total: correct + wrong };
}

export function practiceAccuracyPct(stats) {
  const { correct, total } = aggregatePracticeStats(stats);
  if (!total) return null;
  return Math.round((correct / total) * 100);
}

export function buildPracticeAccuracy(
  pairKey,
  { minAttempts = MIN_ATTEMPTS_FOR_ACCURACY } = {},
) {
  if (!pairKey) return null;

  const stats = loadQuestionTypeStats(pairKey);
  const { correct, wrong, total } = aggregatePracticeStats(stats);
  if (total < minAttempts) return null;

  return {
    accuracyPct: Math.round((correct / total) * 100),
    totalAttempts: total,
    correct,
    wrong,
  };
}

export function shouldShowPracticeAccuracy(accuracy) {
  return accuracy != null && Number.isFinite(accuracy.accuracyPct);
}

export function accuracyTier(pct) {
  if (pct >= 90) return "excellent";
  if (pct >= 75) return "good";
  if (pct >= 60) return "fair";
  return "needs_work";
}

export function accuracyValueClass(pct) {
  return `tier-${accuracyTier(pct)}`;
}