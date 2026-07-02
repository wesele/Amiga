import { getCommonMistakeFeedback } from "./commonMistakeFeedback.js";
import { getNearMissFeedback } from "./nearMissAnswer.js";
import { getWrongAnswerExplanation } from "./wrongAnswerExplanation.js";

/**
 * Capture wrong-answer feedback at answer-check time for the lesson summary recap.
 */
export function buildMistakeFeedbackSnapshot(question, answer, ctx) {
  if (!question || !ctx || typeof ctx.t !== "function") {
    return {
      wrongExplanation: "",
      wrongExplanationSource: "",
      commonMistakeFeedback: "",
      nearMissFeedback: "",
      hintText: "",
    };
  }

  const { t, hintAlreadyShown = false, hintText = "" } = ctx;
  const commonMistakeFeedback =
    getCommonMistakeFeedback(question, answer, t) || "";
  const nearMissFeedback = commonMistakeFeedback
    ? ""
    : getNearMissFeedback(question, answer, t) || "";
  const wrongExplanationResult = getWrongAnswerExplanation(question, answer, {
    t,
    hintAlreadyShown,
    commonMistakeFeedback,
    nearMissFeedback,
  });

  return {
    wrongExplanation: wrongExplanationResult?.text || "",
    wrongExplanationSource: wrongExplanationResult?.source || "",
    commonMistakeFeedback,
    nearMissFeedback,
    hintText: String(hintText ?? "").trim(),
  };
}

/** Ordered display lines for the lesson-summary mistake recap (priority matches live feedback). */
export function mistakeSummaryLines(item, t) {
  if (!item || typeof t !== "function") return [];

  const feedback = item.feedback || {};
  if (feedback.commonMistakeFeedback) {
    return [{ type: "common-mistake", text: feedback.commonMistakeFeedback }];
  }
  if (feedback.nearMissFeedback) {
    return [{ type: "near-miss", text: feedback.nearMissFeedback }];
  }
  if (feedback.wrongExplanation) {
    return [{ type: "wrong-explanation", text: feedback.wrongExplanation }];
  }
  if (feedback.hintText) {
    return [{ type: "hint", text: feedback.hintText }];
  }
  return [{ type: "fallback", text: t("path.reviewMistakesHint") }];
}

export function mistakeItemKey(item, index) {
  return item?.question?.id ?? index;
}

/** Mark a main-round mistake as reinforced after the learner answers it correctly in-round. */
export function markMistakeReinforced(mistakes, questionId) {
  if (!questionId || !Array.isArray(mistakes)) return mistakes;
  return mistakes.map((item) =>
    item?.question?.id === questionId ? { ...item, reinforced: true } : item,
  );
}