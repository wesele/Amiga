/** Pair-matching question type rendered by QuestionRenderer. */
export const MATCHING_QUESTION_TYPE = "T03";

export function isMatchingQuestionType(type) {
  return type === MATCHING_QUESTION_TYPE;
}

/**
 * Whether every pair has been matched and the answer is ready to check.
 * Matches are irreversible in the UI, so a full board is a natural submit point.
 */
export function isMatchingAnswerComplete(question, answer) {
  if (!question || !isMatchingQuestionType(question.type)) return false;
  const pairCount = (question.pairs || []).length;
  if (pairCount === 0) return false;
  return Array.isArray(answer) && answer.length === pairCount;
}

/**
 * Whether completing the last match should immediately check the answer.
 */
export function shouldAutoSubmitOnMatching(question, { showResult = false } = {}) {
  return Boolean(question) && isMatchingQuestionType(question.type) && !showResult;
}