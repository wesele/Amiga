import { getDistractorExplanation } from "./distractorExplanation.js";
import { getPostAnswerHint } from "./questionHint.js";

/**
 * Wrong-answer micro-explanation shown after an incorrect response.
 * Returns { text, source } or null. source supports debugging/analytics.
 */
export function getWrongAnswerExplanation(question, answer, ctx) {
  if (!question || !ctx || typeof ctx.t !== "function") return null;

  const { t, hintAlreadyShown, commonMistakeFeedback, nearMissFeedback } = ctx;

  if (commonMistakeFeedback || nearMissFeedback) return null;

  if (question.type === "T12") {
    const note = String(question.pragmaticsNote ?? "").trim();
    if (note) {
      return { text: t("path.wrongExplanationPragmatics", { note }), source: "pragmatics" };
    }
  }

  if (!hintAlreadyShown) {
    const authored = String(question.hint ?? "").trim();
    if (authored) {
      return {
        text: t("path.wrongExplanationAuthoredHint", { hint: authored }),
        source: "authored-hint",
      };
    }
  }

  const distractor = getDistractorExplanation(question, answer, t);
  if (distractor) {
    return { text: distractor, source: "distractor-compare" };
  }

  if (!hintAlreadyShown) {
    const generated = getPostAnswerHint(question, t);
    if (generated) {
      return {
        text: t("path.wrongExplanationGenerated", { hint: generated }),
        source: "generated-hint",
      };
    }
  }

  return null;
}

/** Convenience wrapper returning only the display text. */
export function wrongAnswerExplanationText(question, answer, ctx) {
  return getWrongAnswerExplanation(question, answer, ctx)?.text || "";
}