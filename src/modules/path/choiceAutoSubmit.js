/** Single-select choice question types rendered by QuestionRenderer. */
export const CHOICE_QUESTION_TYPES = ["T01", "T02", "T05", "T07", "T08", "T12"];

export function isChoiceQuestionType(type) {
  return CHOICE_QUESTION_TYPES.includes(type);
}

/**
 * Whether tapping an option should immediately check the answer.
 * Choice questions are single-tap decisions; skipping the extra "Check" tap
 * keeps practice flow snappy without changing multi-step question types.
 */
export function shouldAutoSubmitOnChoice(question, { showResult = false } = {}) {
  return Boolean(question) && isChoiceQuestionType(question.type) && !showResult;
}

/** Valid choice answer emitted by QuestionRenderer (option index). */
export function isChoiceAnswer(answer) {
  return typeof answer === "number" && Number.isFinite(answer);
}