export const COMPREHENSION_VERIFY_STEP_ID = "comprehensionRetake";

/** Whether the post-AI-practice wrap-up should recommend a comprehension retake. */
export function shouldOfferComprehensionRetakeVerify({
  source,
  articleId,
  comprehensionRetakePending = true,
} = {}) {
  return (
    source === "comprehension"
    && articleId != null
    && Number(articleId) > 0
    && comprehensionRetakePending
  );
}

/** Build the primary wrap-up step that routes into comprehension retake mode. */
export function buildComprehensionRetakeVerifyStep({ articleId, articleTitle, wrongCount }) {
  return {
    id: COMPREHENSION_VERIFY_STEP_ID,
    route: {
      name: "reader",
      params: { id: String(articleId) },
      query: { comprehensionRetake: "1" },
    },
    icon: "🧠",
    titleKey: "chat.nextStep.comprehensionRetake",
    titleParams: { title: articleTitle },
    subtitleKey: "chat.nextStep.comprehensionRetakeHint",
    subtitleParams: { n: wrongCount },
    continueKey: "chat.nextStep.comprehensionRetakeContinue",
  };
}