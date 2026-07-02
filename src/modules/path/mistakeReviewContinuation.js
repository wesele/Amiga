/** Upper bound when peeking how many mistakes remain due for review. */
export const REMAINING_PEEK_LIMIT = 50;

export function shouldOfferMistakeContinuation(remainingCount) {
  return Number(remainingCount) > 0;
}

/**
 * Returns how many mistakes are still due after the current session.
 * Capped at `peekLimit` so the UI can show "50+" when the backlog is large.
 */
export function remainingMistakeReviewCount(peekedMistakes, peekLimit = REMAINING_PEEK_LIMIT) {
  if (!Array.isArray(peekedMistakes)) return 0;
  return Math.max(0, peekedMistakes.length);
}

/** i18n key for the continue button; uses `more` when the peek hit the cap. */
export function mistakeContinueLabelKey(remainingCount, peekLimit = REMAINING_PEEK_LIMIT) {
  if (remainingCount >= peekLimit) return "path.mistakeReviewContinueMore";
  return "path.mistakeReviewContinueRound";
}