import {
  MICRO_REVIEW_LIMIT,
  MICRO_REVIEW_NUDGE_THRESHOLD,
  MICRO_REVIEW_THRESHOLD,
  microReviewNudgeCopy,
  shouldOfferMicroReview,
} from "@/shared/microReview.js";
import { buildSessionReviewQueue } from "@/modules/vocab/microReviewQueue.js";

export {
  MICRO_REVIEW_LIMIT,
  MICRO_REVIEW_NUDGE_THRESHOLD,
  MICRO_REVIEW_THRESHOLD,
  microReviewNudgeCopy,
  shouldOfferMicroReview,
};

/** Build the micro-review queue from session marks and due words. */
export function buildMicroReviewQueue(sessionWords, dueWords) {
  return buildSessionReviewQueue(sessionWords, dueWords, MICRO_REVIEW_LIMIT);
}