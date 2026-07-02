function normalizeText(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

/**
 * Whether the learner's spelling matches an author-tagged common mistake (T09 only).
 */
export function matchesCommonMistake(question, answer) {
  if (!question || question.type !== "T09") return false;
  const normalized = normalizeText(answer);
  if (!normalized) return false;
  return (question.commonMistakes || []).some(
    (mistake) => normalizeText(mistake) === normalized,
  );
}

/**
 * Pedagogical nudge when the learner typed a known common spelling mistake.
 */
export function getCommonMistakeFeedback(question, answer, t) {
  if (!matchesCommonMistake(question, answer) || typeof t !== "function") return null;

  const mistake = String(answer ?? "").trim();
  const correct = String(question.answer ?? "").trim();
  const hint = String(question.hint ?? "").trim();

  if (hint) {
    return t("path.commonMistakeWithHint", { mistake, correct, hint });
  }
  return t("path.commonMistakeTip", { mistake, correct });
}