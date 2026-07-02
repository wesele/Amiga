import { isChoiceAnswer, shouldAutoSubmitOnChoice } from "./choiceAutoSubmit.js";
import {
  isMatchingAnswerComplete,
  shouldAutoSubmitOnMatching,
} from "./matchingAutoSubmit.js";
import {
  isWordOrderAnswerComplete,
  shouldAutoSubmitOnWordOrder,
} from "./wordOrderAutoSubmit.js";

/**
 * Whether an answer change should immediately trigger check — choice tap,
 * last matching pair, or last word chip — without an extra "Check" tap.
 */
export function shouldAutoCheckOnAnswerChange(
  question,
  answer,
  { showResult = false } = {},
) {
  if (showResult || !question) return false;

  if (isChoiceAnswer(answer) && shouldAutoSubmitOnChoice(question, { showResult })) {
    return true;
  }

  if (
    shouldAutoSubmitOnMatching(question, { showResult }) &&
    isMatchingAnswerComplete(question, answer)
  ) {
    return true;
  }

  if (
    shouldAutoSubmitOnWordOrder(question, { showResult }) &&
    isWordOrderAnswerComplete(question, answer)
  ) {
    return true;
  }

  return false;
}