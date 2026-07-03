/** Whether to offer the post-reading comprehension quiz before the summary. */
export function shouldOfferComprehensionQuiz({
  summaryMode = "complete",
  isValidReading = false,
  quizAvailable = false,
} = {}) {
  if (summaryMode !== "complete") return false;
  if (!isValidReading) return false;
  if (!quizAvailable) return false;
  return true;
}

/** Score user answers against quiz questions. */
export function scoreComprehension(questions = [], answers = {}) {
  const details = questions.map((question) => {
    const picked = answers[question.id] ?? null;
    const correct = picked === question.correct_option_id;
    return { question, picked, correct };
  });
  const score = details.filter((item) => item.correct).length;
  return {
    score,
    total: questions.length,
    details,
    skipped: false,
  };
}

/** Pick the celebration i18n key for the completion summary banner. */
export function comprehensionCelebration(score, total, skipped = false) {
  if (skipped || total <= 0) return null;
  if (score === total) {
    return { key: "news.comprehensionPerfect", params: {} };
  }
  return { key: "news.comprehensionPartial", params: { n: score, total } };
}

/** Whether wrong answers should surface the revisit-article next step. */
export function shouldRevisitAfterComprehension(result) {
  if (!result || result.skipped) return false;
  return result.score < result.total;
}