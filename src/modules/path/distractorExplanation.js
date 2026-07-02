import { formatCorrectAnswer, formatUserAnswer } from "./checkAnswer.js";

const CHOICE_TYPES = ["T01", "T02", "T05", "T07", "T08", "T12"];

/**
 * One-line comparison when the learner picked a wrong multiple-choice option.
 */
export function getDistractorExplanation(question, selectedAnswer, t) {
  if (!question || typeof t !== "function") return null;
  if (!CHOICE_TYPES.includes(question.type)) return null;

  const selectedIdx = Number(selectedAnswer);
  const correctIdx = Number(question.answerIdx);
  if (!Number.isFinite(selectedIdx) || selectedIdx === correctIdx) return null;

  const wrong = formatUserAnswer(question, selectedIdx);
  const correct = formatCorrectAnswer(question);
  if (!wrong || !correct) return null;

  if (question.type === "T05") {
    return t("path.wrongChoiceGrammar", {
      wrong,
      correct,
      grammarPoint: t("path.wrongChoiceGrammarDefault"),
    });
  }

  if (["T07", "T08"].includes(question.type)) {
    return t("path.wrongChoiceSemantics", { wrong, correct });
  }

  if (question.type === "T12") {
    const scenario = String(question.scenario ?? "").trim();
    return t("path.wrongChoiceScenario", { wrong, correct, scenario });
  }

  return t("path.wrongChoiceCompare", { wrong, correct });
}