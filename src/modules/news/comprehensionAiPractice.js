export const COMPREHENSION_PRACTICE_PAYLOAD_KEY = "amiga:comprehensionPracticePayload";

/** @typedef {import("./readingComprehension.js").ComprehensionResult} ComprehensionResult */

/**
 * @typedef {object} ComprehensionPracticeItem
 * @property {"main_idea" | "detail" | string} kind
 * @property {string} promptNative
 * @property {string} evidenceSentence
 * @property {string} explanationNative
 */

/**
 * @typedef {object} ComprehensionPracticeContext
 * @property {number} articleId
 * @property {string} articleTitle
 * @property {number} wrongCount
 * @property {string} targetLang
 * @property {ComprehensionPracticeItem[]} items
 */

/** Extract wrong comprehension details (not skipped, answered incorrectly). */
export function collectWrongComprehensionDetails(result) {
  if (!result?.details?.length || result.skipped) return [];
  return result.details.filter((detail) => !detail.correct);
}

/** Whether to offer AI practice for comprehension mistakes. */
export function shouldOfferComprehensionAiPractice({ comprehensionResult } = {}) {
  return collectWrongComprehensionDetails(comprehensionResult).length > 0;
}

/** Build a numbered brief from wrong-answer items for the chat starter message. */
export function formatComprehensionItemsBrief(items = []) {
  return items
    .map((item, index) => {
      const lines = [`${index + 1}. ${item.promptNative}`];
      if (item.evidenceSentence) lines.push(item.evidenceSentence);
      if (item.explanationNative) lines.push(`(${item.explanationNative})`);
      return lines.join("\n");
    })
    .join("\n\n");
}

/**
 * Build practice context from a comprehension result.
 * @param {object} params
 * @param {string} [params.articleTitle]
 * @param {number} [params.articleId]
 * @param {ComprehensionResult} [params.comprehensionResult]
 * @param {string} [params.targetLang]
 * @returns {ComprehensionPracticeContext | null}
 */
export function buildComprehensionPracticeContext({
  articleTitle = "",
  articleId = 0,
  comprehensionResult,
  targetLang = "es",
} = {}) {
  const wrongDetails = collectWrongComprehensionDetails(comprehensionResult);
  if (!wrongDetails.length) return null;

  const items = wrongDetails.map((detail) => ({
    kind: detail.question?.kind ?? "detail",
    promptNative: detail.question?.prompt_native ?? "",
    evidenceSentence: detail.question?.evidence_sentence ?? "",
    explanationNative: detail.question?.explanation_native ?? "",
  }));

  return {
    articleId,
    articleTitle,
    wrongCount: items.length,
    targetLang,
    items,
  };
}

/**
 * Generate chat starter metadata for comprehension practice.
 * @param {ComprehensionPracticeContext & { targetLabel?: string }} context
 */
export function buildComprehensionPracticeStarter(context) {
  if (!context?.items?.length) return null;
  return {
    id: "comprehension-practice",
    labelKey: "chat.starterComprehensionPractice",
    labelParams: { title: context.articleTitle, n: context.wrongCount },
    messageKey: "chat.starterComprehensionPracticeMsg",
    messageParams: {
      title: context.articleTitle,
      n: context.wrongCount,
      target: context.targetLabel ?? context.targetLang,
      itemsBrief: formatComprehensionItemsBrief(context.items),
    },
  };
}

/** @param {ComprehensionPracticeContext} payload */
export function saveComprehensionPracticePayload(payload) {
  if (typeof sessionStorage === "undefined" || !payload?.items?.length) return;
  sessionStorage.setItem(COMPREHENSION_PRACTICE_PAYLOAD_KEY, JSON.stringify(payload));
}

/** @returns {ComprehensionPracticeContext | null} */
export function loadComprehensionPracticePayload() {
  if (typeof sessionStorage === "undefined") return null;
  const raw = sessionStorage.getItem(COMPREHENSION_PRACTICE_PAYLOAD_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return parsed?.items?.length ? parsed : null;
  } catch {
    return null;
  }
}

export function clearComprehensionPracticePayload() {
  if (typeof sessionStorage === "undefined") return;
  sessionStorage.removeItem(COMPREHENSION_PRACTICE_PAYLOAD_KEY);
}