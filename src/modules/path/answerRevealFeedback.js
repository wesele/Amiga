/**
 * Visual feedback helpers when an answer has been checked.
 * Used by QuestionRenderer to guide the learner's eye after check.
 */

/** Whether result styling should highlight the correct option and shake the wrong pick. */
export function isIncorrectReveal({ showResult = false, isCorrect = false } = {}) {
  return Boolean(showResult) && !isCorrect;
}

/** Whether a brief success pulse should celebrate a correct answer. */
export function isCorrectReveal({ showResult = false, isCorrect = false } = {}) {
  return Boolean(showResult) && isCorrect;
}

/** CSS class for free-text inputs after check (empty while still answering). */
export function textInputResultClass({ showResult = false, isCorrect = false } = {}) {
  if (!showResult) return "";
  return isCorrect ? "is-correct" : "is-wrong";
}