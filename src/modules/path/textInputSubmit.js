/** Free-text answer question types rendered by QuestionRenderer. */
export const TEXT_INPUT_QUESTION_TYPES = ["T09", "T10"];

export function isTextInputQuestionType(type) {
  return TEXT_INPUT_QUESTION_TYPES.includes(type);
}

export function hasTextInputAnswer(answer) {
  return String(answer ?? "").trim().length > 0;
}

/**
 * Whether pressing Enter should trigger the primary action (check or advance).
 * Learners expect the keyboard "Go" key to submit spelling and translation answers,
 * and to continue after feedback on any question type.
 */
export function shouldSubmitOnEnter(question, { showResult = false, answer = null } = {}) {
  if (showResult) return true;
  if (!question || !isTextInputQuestionType(question.type)) return false;
  return hasTextInputAnswer(answer);
}