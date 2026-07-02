/** How many due mistakes to surface in a single review session. */
export { MISTAKE_REVIEW_SESSION_LIMIT } from "@/modules/path/mistakeReviewStore.js";

export function shouldShowMistakeReview(dueCount) {
  return Number(dueCount) > 0;
}

export function mistakeReviewCount(dueCount) {
  return Math.max(0, Number(dueCount) || 0);
}