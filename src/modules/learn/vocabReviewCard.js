/** How many unmastered words to surface on the learn hub review card. */
export const VOCAB_REVIEW_LIMIT = 5;

/** How many word names to show in the card preview before "…". */
export const VOCAB_PREVIEW_MAX = 3;

export function shouldShowVocabReview(words) {
  return Array.isArray(words) && words.length > 0;
}

export function vocabReviewCount(words) {
  return Array.isArray(words) ? words.length : 0;
}

export function vocabReviewPreview(words, maxPreview = VOCAB_PREVIEW_MAX) {
  if (!Array.isArray(words) || words.length === 0) return "";
  return words
    .slice(0, maxPreview)
    .map((w) => w?.word)
    .filter(Boolean)
    .join(", ");
}

export function vocabReviewHasMore(words, maxPreview = VOCAB_PREVIEW_MAX) {
  return Array.isArray(words) && words.length > maxPreview;
}