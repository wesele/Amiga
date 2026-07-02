import { formatUserAnswer } from "./checkAnswer.js";

export function shouldShowYourAnswer({
  showResult,
  lastCorrect,
  question,
  answer,
  commonMistakeFeedback,
  nearMissFeedback,
}) {
  if (!showResult || lastCorrect) return false;
  if (commonMistakeFeedback || nearMissFeedback) return false;
  return Boolean(formatUserAnswer(question, answer));
}

export function yourAnswerText(question, answer, t) {
  const text = formatUserAnswer(question, answer);
  return text && typeof t === "function" ? t("path.yourAnswer", { answer: text }) : "";
}