/** Idle time on a question before auto-revealing a contextual hint. */
export const HINT_IDLE_MS = 15_000;

/**
 * Whether an auto-hint countdown should run for the current question.
 * Skips reinforcement rounds where the learner already saw the question.
 */
export function shouldScheduleAutoHint({
  hintAvailable,
  hintShown,
  showResult,
  finished,
  inReinforcement,
}) {
  return (
    hintAvailable &&
    !hintShown &&
    !showResult &&
    !finished &&
    !inReinforcement
  );
}

/** Returns true when the idle threshold has been reached. */
export function shouldAutoRevealHint(elapsedMs, idleMs = HINT_IDLE_MS) {
  return elapsedMs >= idleMs;
}