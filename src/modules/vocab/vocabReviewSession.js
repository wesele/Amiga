/** Words surfaced in a single quick-review flashcard session. */
export const REVIEW_SESSION_LIMIT = 5;

/**
 * Pick the best definition for the learner's native language.
 * Falls back across available fields when the preferred one is missing.
 */
export function vocabDefinition(word, nativeLang) {
  if (!word) return "";
  if (word.translation) return word.translation;
  if (nativeLang === "zh") {
    return word.definition_zh || word.definition_es || "";
  }
  if (nativeLang === "es") {
    return word.definition_es || word.definition_zh || "";
  }
  return word.definition_es || word.definition_zh || "";
}

export function sessionProgress(index, total) {
  const safeTotal = Math.max(0, total);
  return {
    current: Math.min(index + 1, safeTotal || 1),
    total: safeTotal,
  };
}

/**
 * Progress bar fill for a flashcard review session.
 * Ticks forward when the current card has been rated so learners see
 * instant session momentum before advancing to the next word.
 */
export function sessionProgressPct(index, total, { answered = false } = {}) {
  if (!total) return 0;
  const step = answered ? index + 2 : index + 1;
  return Math.min(100, Math.round((step / total) * 100));
}

export function isSessionComplete(index, total) {
  return total > 0 && index >= total;
}

/** mastery === 1 means seen but not yet locked in — highest SRS priority. */
export function countReinforcementWords(words) {
  if (!Array.isArray(words)) return 0;
  return words.filter((w) => w?.mastery === 1).length;
}

export function countNewWords(words) {
  if (!Array.isArray(words)) return 0;
  return words.filter((w) => w?.mastery == null).length;
}