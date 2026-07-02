/** Default pause so learners glimpse correct feedback before advancing. */
export const CORRECT_AUTO_ADVANCE_MS = 700;

/** Extra time when a combo milestone toast is showing. */
export const COMBO_MILESTONE_AUTO_ADVANCE_MS = 1200;

/** Extra time when the learner just beat their personal combo record. */
export const COMBO_PERSONAL_BEST_AUTO_ADVANCE_MS = 1400;

/**
 * Delay before auto-advancing after a correct choice answer.
 * Longer when celebratory toasts need a moment on screen.
 */
export function correctAutoAdvanceDelayMs({
  comboToast = "",
  comboPersonalBestToast = "",
} = {}) {
  if (comboPersonalBestToast) return COMBO_PERSONAL_BEST_AUTO_ADVANCE_MS;
  if (comboToast) return COMBO_MILESTONE_AUTO_ADVANCE_MS;
  return CORRECT_AUTO_ADVANCE_MS;
}