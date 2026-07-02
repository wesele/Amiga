/** Horizontal drag past this threshold commits a rating. */
export const VOCAB_SWIPE_COMMIT_PX = 72;

/** Max visual drag before clamping. */
export const VOCAB_SWIPE_CLAMP_PX = 110;

/** Max card tilt during drag (degrees). */
export const VOCAB_SWIPE_MAX_TILT_DEG = 7;

/**
 * Whether swipe-to-rate is available for the current card state.
 */
export function canSwipeToRate({ flipped = false, acting = false, ratingAck = null } = {}) {
  return flipped && !acting && ratingAck == null;
}

/**
 * Resolve committed rating from horizontal drag delta.
 * Positive = right = got it; negative = left = still learning.
 */
export function vocabSwipeRating(deltaX, threshold = VOCAB_SWIPE_COMMIT_PX) {
  if (deltaX >= threshold) return "got_it";
  if (deltaX <= -threshold) return "still_learning";
  return null;
}

/**
 * Visual transform for the flashcard while dragging.
 */
export function vocabSwipeDragStyle(
  deltaX,
  { clampPx = VOCAB_SWIPE_CLAMP_PX, maxTilt = VOCAB_SWIPE_MAX_TILT_DEG } = {},
) {
  const clamped = Math.max(-clampPx, Math.min(clampPx, deltaX));
  const tilt = (clamped / clampPx) * maxTilt;
  return {
    transform: `translateX(${clamped}px) rotate(${tilt}deg)`,
  };
}

/**
 * Opacity 0–1 for swipe hint overlays (left = still learning, right = got it).
 */
export function vocabSwipeHintOpacity(deltaX, threshold = VOCAB_SWIPE_COMMIT_PX) {
  const raw = Math.min(1, Math.abs(deltaX) / threshold);
  if (deltaX > 8) return { stillLearning: 0, gotIt: raw };
  if (deltaX < -8) return { stillLearning: raw, gotIt: 0 };
  return { stillLearning: 0, gotIt: 0 };
}

/**
 * True when vertical scroll intent should cancel a horizontal swipe.
 */
export function shouldAbortVocabSwipe({ deltaX = 0, deltaY = 0, lockPx = 14 } = {}) {
  return Math.abs(deltaY) > Math.abs(deltaX) && Math.abs(deltaY) > lockPx;
}

/**
 * True when a small tap should toggle flip instead of treating as swipe drag.
 */
export function isVocabSwipeTap(deltaX, deltaY, tapSlop = 10) {
  return Math.abs(deltaX) <= tapSlop && Math.abs(deltaY) <= tapSlop;
}