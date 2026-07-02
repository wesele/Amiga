import { readLocalJson, updateLocalJson } from "@/shared/localJsonStore.js";

export const STATS_STORAGE_KEY = "question_type_stats_v1";
export const MIN_ATTEMPTS_FOR_FOCUS = 5;
export const MAX_ACCURACY_FOR_FOCUS = 75;

/** Question types tracked for adaptive focus recommendations. */
export const TRACKED_QUESTION_TYPES = [
  "T01",
  "T02",
  "T03",
  "T05",
  "T06",
  "T07",
  "T08",
  "T09",
  "T10",
  "T11",
  "T12",
];

export function pairStatsKey(nativeLang, targetLang) {
  return `${nativeLang}-${targetLang}`;
}

export function emptyTypeRecord() {
  return { correct: 0, wrong: 0 };
}

export function recordQuestionTypeResult(stats, typeId, isCorrect) {
  if (!typeId || !TRACKED_QUESTION_TYPES.includes(typeId)) return stats ?? {};

  const base = stats ?? {};
  const record = { ...emptyTypeRecord(), ...base[typeId] };
  if (isCorrect) {
    record.correct += 1;
  } else {
    record.wrong += 1;
  }
  return { ...base, [typeId]: record };
}

export function typeAccuracyPct(record) {
  const correct = record?.correct ?? 0;
  const wrong = record?.wrong ?? 0;
  const total = correct + wrong;
  if (!total) return 100;
  return Math.round((correct / total) * 100);
}

export function typeAttempts(record) {
  return (record?.correct ?? 0) + (record?.wrong ?? 0);
}

/**
 * Returns the question type with the lowest accuracy that qualifies as a weak spot.
 */
export function findWeakestType(
  stats,
  {
    minAttempts = MIN_ATTEMPTS_FOR_FOCUS,
    maxAccuracyPct = MAX_ACCURACY_FOR_FOCUS,
  } = {},
) {
  if (!stats || typeof stats !== "object") return null;

  let weakest = null;

  for (const typeId of TRACKED_QUESTION_TYPES) {
    const record = stats[typeId];
    const attempts = typeAttempts(record);
    if (attempts < minAttempts) continue;

    const accuracyPct = typeAccuracyPct(record);
    if (accuracyPct > maxAccuracyPct) continue;

    if (
      !weakest ||
      accuracyPct < weakest.accuracyPct ||
      (accuracyPct === weakest.accuracyPct && attempts > weakest.attempts)
    ) {
      weakest = {
        typeId,
        accuracyPct,
        attempts,
        wrong: record?.wrong ?? 0,
      };
    }
  }

  return weakest;
}

export function buildFocusArea(stats, options) {
  const weakest = findWeakestType(stats, options);
  if (!weakest) return null;
  return weakest;
}

export function shouldShowFocusArea(focusArea) {
  return focusArea != null;
}

export function focusAreaTypeKey(typeId) {
  return `learn.focusType${typeId}`;
}

export function focusAreaTipKey(typeId) {
  return `learn.focusTip${typeId}`;
}

export function loadQuestionTypeStats(pairKey) {
  const all = readLocalJson(STATS_STORAGE_KEY, {});
  return all[pairKey] ?? {};
}

export function saveQuestionTypeStats(pairKey, stats) {
  updateLocalJson(
    STATS_STORAGE_KEY,
    (all) => ({ ...all, [pairKey]: stats }),
    {},
  );
}

export function recordAnswer(pairKey, typeId, isCorrect) {
  const stats = loadQuestionTypeStats(pairKey);
  const next = recordQuestionTypeResult(stats, typeId, isCorrect);
  saveQuestionTypeStats(pairKey, next);
  return next;
}