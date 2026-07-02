import { isChoiceAnswer, shouldAutoSubmitOnChoice } from "./choiceAutoSubmit.js";
import {
  isMatchingAnswerComplete,
  shouldAutoSubmitOnMatching,
} from "./matchingAutoSubmit.js";

/**
 * Whether an answer change should immediately trigger check — choice tap or
 * last matching pair — without an extra "Check" tap.
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

  return false;
}