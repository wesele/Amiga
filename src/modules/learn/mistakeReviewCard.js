import { formatQuestionPrompt } from "@/modules/path/checkAnswer.js";

/** How many due mistakes to surface in a single review session. */
export { MISTAKE_REVIEW_SESSION_LIMIT } from "@/modules/path/mistakeReviewStore.js";

/** How many mistake prompts to show in the learn hub card preview. */
export const MISTAKE_PREVIEW_MAX = 2;

export function shouldShowMistakeReview(dueCount) {
  return Number(dueCount) > 0;
}

export function mistakeReviewCount(dueCount) {
  return Math.max(0, Number(dueCount) || 0);
}

export function mistakeReviewPreview(dueMistakes, t, maxPreview = MISTAKE_PREVIEW_MAX) {
  if (!Array.isArray(dueMistakes) || dueMistakes.length === 0 || !t) return "";
  return dueMistakes
    .slice(0, maxPreview)
    .map((entry) => formatQuestionPrompt(entry.question, t))
    .filter(Boolean)
    .join(", ");
}