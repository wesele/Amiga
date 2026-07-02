import { MASTERED_LEVEL, REVIEW_INTERVAL_DAYS } from "./mistakeReviewStore.js";

/** i18n key for the stage label under the review badge. */
export const SRS_STAGE_LABEL_KEY = "path.mistakeReviewSrsStage";

/** i18n key shown after a correct answer schedules the next review. */
export const SRS_MASTERED_KEY = "path.mistakeReviewSrsMastered";
export const SRS_NEXT_DAY_KEY = "path.mistakeReviewSrsNextDay";
export const SRS_NEXT_DAYS_KEY = "path.mistakeReviewSrsNextDays";

export function normalizeSrsLevel(level) {
  const n = Number(level);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.min(Math.floor(n), MASTERED_LEVEL - 1);
}

/** 1-based stage for display (level 0 → stage 1 of 4). */
export function srsStageNumber(level) {
  return normalizeSrsLevel(level) + 1;
}

export function srsStageProgress(level) {
  const stage = srsStageNumber(level);
  return {
    stage,
    total: MASTERED_LEVEL,
    progress_pct: Math.round((stage / MASTERED_LEVEL) * 100),
  };
}

/** Dot states for a compact mastery progress row. */
export function srsDotStates(level) {
  const filled = srsStageNumber(level);
  return Array.from({ length: MASTERED_LEVEL }, (_, i) => i < filled);
}

/**
 * SRS level shown in the mastery row. After a correct check, preview the
 * next stage so learners see progress tick forward before advancing.
 */
export function srsDisplayLevel(level, { answeredCorrect = false } = {}) {
  const normalized = normalizeSrsLevel(level);
  if (!answeredCorrect) return normalized;
  return Math.min(normalized + 1, MASTERED_LEVEL - 1);
}

/**
 * 0-based index of the dot that just filled after a correct answer, or -1.
 */
export function srsJustFilledDotIndex(level, { answeredCorrect = false } = {}) {
  if (!answeredCorrect) return -1;
  const normalized = normalizeSrsLevel(level);
  if (normalized >= MASTERED_LEVEL - 1) return -1;
  return srsStageNumber(level);
}

/** Dot states reflecting an in-flight correct answer (preview next stage). */
export function srsDisplayDotStates(level, { answeredCorrect = false } = {}) {
  return srsDotStates(srsDisplayLevel(level, { answeredCorrect }));
}

export function srsDisplayStageLabel(level, t, { answeredCorrect = false } = {}) {
  return srsStageLabel(srsDisplayLevel(level, { answeredCorrect }), t);
}

/**
 * Days until the next review after a correct answer at `level`,
 * or null when the mistake is mastered.
 */
export function srsIntervalDaysAfterCorrect(level) {
  const nextLevel = normalizeSrsLevel(level) + 1;
  if (nextLevel >= MASTERED_LEVEL) return null;
  return REVIEW_INTERVAL_DAYS[Math.min(nextLevel, REVIEW_INTERVAL_DAYS.length - 1)] ?? 0;
}

export function srsCorrectFeedbackKey(level) {
  const days = srsIntervalDaysAfterCorrect(level);
  if (days == null) return SRS_MASTERED_KEY;
  if (days <= 1) return SRS_NEXT_DAY_KEY;
  return SRS_NEXT_DAYS_KEY;
}

export function srsCorrectFeedback(level, t) {
  if (typeof t !== "function") return "";
  const key = srsCorrectFeedbackKey(level);
  const days = srsIntervalDaysAfterCorrect(level);
  if (days == null) return t(key);
  if (days <= 1) return t(key);
  return t(key, { n: days });
}

export function srsStageLabel(level, t) {
  if (typeof t !== "function") return "";
  const { stage, total } = srsStageProgress(level);
  return t(SRS_STAGE_LABEL_KEY, { stage, total });
}