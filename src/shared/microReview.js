export const MICRO_REVIEW_THRESHOLD = 3;
export const MICRO_REVIEW_NUDGE_THRESHOLD = 2;
export const MICRO_REVIEW_LIMIT = 5;

/** Whether the micro-review bottom sheet should auto-open. */
export function shouldOfferMicroReview({
  sessionWordCount = 0,
  sheetDismissed = false,
  sheetCompleted = false,
} = {}) {
  if (sheetDismissed || sheetCompleted) return false;
  return sessionWordCount >= MICRO_REVIEW_THRESHOLD;
}

/** Toast copy nudging the learner toward the micro-review threshold. */
export function microReviewNudgeCopy(sessionWordCount, t, nudgeKey = "news.microReviewNudge") {
  if (sessionWordCount < MICRO_REVIEW_NUDGE_THRESHOLD) return null;
  if (sessionWordCount >= MICRO_REVIEW_THRESHOLD) return null;
  const remaining = MICRO_REVIEW_THRESHOLD - sessionWordCount;
  return t(nudgeKey, { n: sessionWordCount, remaining });
}