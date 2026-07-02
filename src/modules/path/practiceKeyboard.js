import { isTextInputQuestionType, shouldSubmitOnEnter } from "./textInputSubmit.js";

const TEXT_FIELD_TAGS = new Set(["INPUT", "TEXTAREA"]);

function isTextFieldTarget(target) {
  return Boolean(target?.tagName && TEXT_FIELD_TAGS.has(target.tagName));
}

/**
 * Whether a global Enter keydown should trigger the practice primary action.
 * Text fields handle Enter locally while the learner is still answering;
 * once feedback is shown, Enter works from anywhere (including after wrong choices).
 */
export function shouldAdvancePracticeOnEnter(
  event,
  { showResult = false, question = null, answer = null } = {},
) {
  if (!event || event.key !== "Enter") return false;
  if (
    !showResult &&
    isTextInputQuestionType(question?.type) &&
    isTextFieldTarget(event.target)
  ) {
    return false;
  }
  return shouldSubmitOnEnter(question, { showResult, answer });
}