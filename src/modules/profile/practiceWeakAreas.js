import {
  TRACKED_QUESTION_TYPES,
  typeAccuracyPct,
  typeAttempts,
  loadQuestionTypeStats,
  MIN_ATTEMPTS_FOR_FOCUS,
  MAX_ACCURACY_FOR_FOCUS,
} from "@/modules/learn/questionTypeStats.js";

/** Maximum weak spots surfaced on the profile page. */
export const MAX_WEAK_AREAS = 3;

/**
 * Returns question types sorted by lowest accuracy (ties broken by more attempts).
 */
export function findWeakTypes(
  stats,
  {
    minAttempts = MIN_ATTEMPTS_FOR_FOCUS,
    maxAccuracyPct = MAX_ACCURACY_FOR_FOCUS,
    limit = MAX_WEAK_AREAS,
  } = {},
) {
  const candidates = [];

  for (const typeId of TRACKED_QUESTION_TYPES) {
    const record = stats?.[typeId];
    const attempts = typeAttempts(record);
    if (attempts < minAttempts) continue;

    const accuracyPct = typeAccuracyPct(record);
    if (accuracyPct > maxAccuracyPct) continue;

    candidates.push({
      typeId,
      accuracyPct,
      attempts,
      wrong: record?.wrong ?? 0,
    });
  }

  candidates.sort((a, b) => {
    if (a.accuracyPct !== b.accuracyPct) return a.accuracyPct - b.accuracyPct;
    return b.attempts - a.attempts;
  });

  return candidates.slice(0, limit);
}

export function buildPracticeWeakAreas(
  pairKey,
  {
    minAttempts = MIN_ATTEMPTS_FOR_FOCUS,
    maxAccuracyPct = MAX_ACCURACY_FOR_FOCUS,
    limit = MAX_WEAK_AREAS,
  } = {},
) {
  if (!pairKey) return [];
  const stats = loadQuestionTypeStats(pairKey);
  return findWeakTypes(stats, { minAttempts, maxAccuracyPct, limit });
}

export function shouldShowPracticeWeakAreas(areas) {
  return Array.isArray(areas) && areas.length > 0;
}