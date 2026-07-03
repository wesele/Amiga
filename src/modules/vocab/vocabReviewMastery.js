/** Three-stage mastery model aligned with user_vocab.mastery (null/0, 1, 2). */
export const VOCAB_MASTERY_STAGES = 3;

export const VOCAB_REVIEW_MASTERY_STAGE_KEY = "vocab.reviewMasteryStage";
export const VOCAB_REVIEW_SCHEDULE_PRIORITY_KEY = "vocab.reviewSchedulePriority";
export const VOCAB_REVIEW_SCHEDULE_MASTERED_KEY = "vocab.reviewScheduleMastered";
export const VOCAB_REVIEW_SCHEDULE_REINFORCED_KEY = "vocab.reviewScheduleReinforced";

/** Internal level: 0 unseen, 1 seen, 2 mastered. */
export function normalizeVocabMastery(mastery) {
  if (mastery == null || mastery === 0) return 0;
  const n = Number(mastery);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.min(Math.floor(n), 2);
}

/** 1-based stage for display (mastery null/0 → stage 1 of 3). */
export function vocabStageNumber(mastery) {
  return normalizeVocabMastery(mastery) + 1;
}

export function vocabStageProgress(mastery) {
  const stage = vocabStageNumber(mastery);
  return {
    stage,
    total: VOCAB_MASTERY_STAGES,
    progress_pct: Math.round((stage / VOCAB_MASTERY_STAGES) * 100),
  };
}

/** Dot states for a compact mastery progress row. */
export function vocabDotStates(mastery) {
  const filled = vocabStageNumber(mastery);
  return Array.from({ length: VOCAB_MASTERY_STAGES }, (_, i) => i < filled);
}

/**
 * Mastery level shown in the progress row. After rating, preview the outcome:
 * still learning keeps the current stage; got it previews mastered (stage 3).
 */
export function vocabDisplayLevel(mastery, { ratedMastery } = {}) {
  const normalized = normalizeVocabMastery(mastery);
  if (ratedMastery == null) return normalized;
  if (ratedMastery === 1) return normalized;
  return 2;
}

/** 0-based index of the dot that just filled after "got it", or -1. */
export function vocabJustFilledDotIndex(mastery, { ratedMastery } = {}) {
  if (ratedMastery !== 2) return -1;
  if (normalizeVocabMastery(mastery) >= 2) return -1;
  return VOCAB_MASTERY_STAGES - 1;
}

export function vocabDisplayDotStates(mastery, options = {}) {
  const level = vocabDisplayLevel(mastery, options);
  const filled = level + 1;
  return Array.from({ length: VOCAB_MASTERY_STAGES }, (_, i) => i < filled);
}

export function vocabStageLabel(mastery, t) {
  if (typeof t !== "function") return "";
  const { stage, total } = vocabStageProgress(mastery);
  return t(VOCAB_REVIEW_MASTERY_STAGE_KEY, { stage, total });
}

export function vocabDisplayStageLabel(mastery, t, options = {}) {
  if (typeof t !== "function") return "";
  const level = vocabDisplayLevel(mastery, options);
  return t(VOCAB_REVIEW_MASTERY_STAGE_KEY, {
    stage: level + 1,
    total: VOCAB_MASTERY_STAGES,
  });
}

export function vocabRatingFeedbackKey(mastery, ratedMastery) {
  if (ratedMastery === 1) return VOCAB_REVIEW_SCHEDULE_PRIORITY_KEY;
  if (normalizeVocabMastery(mastery) >= 2) return VOCAB_REVIEW_SCHEDULE_REINFORCED_KEY;
  return VOCAB_REVIEW_SCHEDULE_MASTERED_KEY;
}

export function vocabRatingFeedback(mastery, ratedMastery, t) {
  if (typeof t !== "function") return "";
  return t(vocabRatingFeedbackKey(mastery, ratedMastery));
}