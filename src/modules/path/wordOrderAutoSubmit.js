/** Word-order question type rendered by QuestionRenderer. */
export const WORD_ORDER_QUESTION_TYPE = "T06";

export function isWordOrderQuestionType(type) {
  return type === WORD_ORDER_QUESTION_TYPE;
}

/**
 * Whether every word chip has been placed and the answer is ready to check.
 * Words move from bank to sentence irreversibly until removed, so a full
 * sentence is a natural submit point — same rhythm as matching questions.
 */
export function isWordOrderAnswerComplete(question, answer) {
  if (!question || !isWordOrderQuestionType(question.type)) return false;
  const wordCount = (question.words || []).length;
  if (wordCount === 0) return false;
  return Array.isArray(answer) && answer.length === wordCount;
}

/**
 * Whether placing the last word should immediately check the answer.
 */
export function shouldAutoSubmitOnWordOrder(question, { showResult = false } = {}) {
  return Boolean(question) && isWordOrderQuestionType(question.type) && !showResult;
}