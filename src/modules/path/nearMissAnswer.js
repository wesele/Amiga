import { checkAnswer } from "./checkAnswer.js";
import { matchesCommonMistake } from "./commonMistakeFeedback.js";

/** One edit away counts as "almost" for spelling and short translations. */
export const NEAR_MISS_MAX_DISTANCE = 1;

function normalizeText(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

/** Classic Levenshtein edit distance for typo detection. */
export function levenshteinDistance(a, b) {
  const left = String(a ?? "");
  const right = String(b ?? "");
  if (left === right) return 0;
  if (!left.length) return right.length;
  if (!right.length) return left.length;

  const prev = new Array(right.length + 1);
  const curr = new Array(right.length + 1);

  for (let j = 0; j <= right.length; j += 1) prev[j] = j;

  for (let i = 1; i <= left.length; i += 1) {
    curr[0] = i;
    for (let j = 1; j <= right.length; j += 1) {
      const cost = left[i - 1] === right[j - 1] ? 0 : 1;
      curr[j] = Math.min(
        prev[j] + 1,
        curr[j - 1] + 1,
        prev[j - 1] + cost,
      );
    }
    for (let j = 0; j <= right.length; j += 1) prev[j] = curr[j];
  }

  return prev[right.length];
}

export function acceptedAnswersForQuestion(question) {
  if (!question) return [];
  if (question.type === "T09") {
    const answer = String(question.answer ?? "").trim();
    return answer ? [answer] : [];
  }
  if (question.type === "T10") {
    return (question.acceptedAnswers || [])
      .map((value) => String(value ?? "").trim())
      .filter(Boolean);
  }
  return [];
}

/**
 * Whether the learner's free-text answer is one character off from accepted forms.
 * Skips correct answers and author-tagged common mistakes (handled separately).
 */
export function isNearMissAnswer(question, answer) {
  if (!question || !["T09", "T10"].includes(question.type)) return false;
  if (checkAnswer(question, answer)) return false;
  if (matchesCommonMistake(question, answer)) return false;

  const normalized = normalizeText(answer);
  if (!normalized) return false;

  const accepted = acceptedAnswersForQuestion(question)
    .map(normalizeText)
    .filter(Boolean);
  if (!accepted.length) return false;

  const minDistance = Math.min(
    ...accepted.map((target) => levenshteinDistance(normalized, target)),
  );

  return minDistance > 0 && minDistance <= NEAR_MISS_MAX_DISTANCE;
}

/**
 * Encouraging feedback when the learner was one edit away from the right answer.
 */
export function getNearMissFeedback(question, answer, t) {
  if (!isNearMissAnswer(question, answer) || typeof t !== "function") return null;

  const typed = String(answer ?? "").trim();
  const correct = acceptedAnswersForQuestion(question)[0] || "";
  return t("path.nearMissTip", { answer: typed, correct });
}