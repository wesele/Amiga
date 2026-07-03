import { buildReadingReviewQueue } from "./readingSession.js";

export const MICRO_REVIEW_THRESHOLD = 3;
export const MICRO_REVIEW_NUDGE_THRESHOLD = 2;
export const MICRO_REVIEW_LIMIT = 5;

/** Whether the in-reader micro-review sheet should auto-open. */
export function shouldOfferMicroReview({
  sessionWordCount = 0,
  sheetDismissed = false,
  sheetCompleted = false,
} = {}) {
  if (sheetDismissed || sheetCompleted) return false;
  return sessionWordCount >= MICRO_REVIEW_THRESHOLD;
}

/** Build the micro-review queue from session marks and due words. */
export function buildMicroReviewQueue(sessionWords, dueWords) {
  return buildReadingReviewQueue(sessionWords, dueWords, MICRO_REVIEW_LIMIT);
}

/** Toast copy nudging the learner toward the micro-review threshold. */
export function microReviewNudgeCopy(sessionWordCount, t) {
  if (sessionWordCount < MICRO_REVIEW_NUDGE_THRESHOLD) return null;
  if (sessionWordCount >= MICRO_REVIEW_THRESHOLD) return null;
  const remaining = MICRO_REVIEW_THRESHOLD - sessionWordCount;
  return t("news.microReviewNudge", { n: sessionWordCount, remaining });
}