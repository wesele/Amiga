/** Upper bound when peeking how many words remain due for review. */
export const REMAINING_PEEK_LIMIT = 50;

export function shouldOfferVocabContinuation(remainingCount) {
  return Number(remainingCount) > 0;
}

/**
 * Returns how many words are still due after the current session.
 * Capped at `peekLimit` so the UI can show "50+" when the backlog is large.
 */
export function remainingVocabReviewCount(peekedWords, peekLimit = REMAINING_PEEK_LIMIT) {
  if (!Array.isArray(peekedWords)) return 0;
  return Math.max(0, peekedWords.length);
}

/** i18n key for the continue button; uses `more` when the peek hit the cap. */
export function vocabContinueLabelKey(remainingCount, peekLimit = REMAINING_PEEK_LIMIT) {
  if (remainingCount >= peekLimit) return "vocab.reviewContinueMore";
  return "vocab.reviewContinue";
}