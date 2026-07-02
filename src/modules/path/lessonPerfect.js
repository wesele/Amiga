/**
 * Detects a flawless practice lesson: passed with every main-round answer correct.
 * Mistakes trigger the reinforcement round and disqualify a perfect run.
 */
export function isPerfectLesson({
  mistakeCount,
  correctCount,
  totalQuestions,
  passed,
}) {
  if (!passed) return false;
  if (!totalQuestions || totalQuestions <= 0) return false;
  return mistakeCount === 0 && correctCount === totalQuestions;
}

/** i18n key for the perfect-lesson celebration banner. */
export const PERFECT_LESSON_CELEBRATION_KEY = "path.perfectLesson";