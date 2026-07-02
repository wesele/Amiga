/** i18n key for the continue-drill button on the focus practice summary. */
export const FOCUS_CONTINUE_LABEL_KEY = "path.focusPracticeContinue";

/** i18n key for the nudge above the continue button. */
export const FOCUS_CONTINUE_HINT_KEY = "path.focusPracticeContinueHint";

/**
 * Offer another drill round while the learner missed at least one question.
 * A perfect round signals readiness to leave; imperfect rounds invite repetition.
 */
export function shouldOfferFocusContinuation(questionCount, accuracyPct) {
  const count = Number(questionCount) || 0;
  if (!count) return false;
  const pct = Number(accuracyPct);
  if (!Number.isFinite(pct)) return true;
  return pct < 100;
}