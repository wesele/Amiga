/** Stable key for a left–right pair in matching questions (T03). */
export function pairKey(left, right) {
  return `${left}::${right}`;
}

/** Whether the learner's matched pair matches an expected pair. */
export function isUserPairCorrect(pair, question) {
  if (!pair || !question) return false;
  const expected = new Set(
    (question.pairs || []).map((p) => pairKey(p.left, p.right)),
  );
  return expected.has(pairKey(pair.left, pair.right));
}

function matchForLeft(leftIdx, matchedPairs = []) {
  return matchedPairs.find((p) => p.leftIdx === leftIdx) ?? null;
}

function matchForRight(rightIdx, matchedPairs = []) {
  return matchedPairs.find((p) => p.rightIdx === rightIdx) ?? null;
}

/**
 * CSS state for a left-column item after check.
 * Returns plain class-name flags for the template.
 */
export function leftMatchRevealState({
  showResult = false,
  isCorrect = false,
  leftIdx = 0,
  matchedPairs = [],
  question = null,
} = {}) {
  if (!showResult) return {};

  const match = matchForLeft(leftIdx, matchedPairs);
  if (!match) {
    return isCorrect ? {} : { unmatched: true };
  }
  return isUserPairCorrect(match, question)
    ? { correct: true }
    : { wrong: true };
}

function isCorrectPartnerForWrongMatch(rightText, matchedPairs, question) {
  if (!rightText) return false;
  return matchedPairs.some((pair) => {
    if (isUserPairCorrect(pair, question)) return false;
    return question?.pairs?.[pair.leftIdx]?.right === rightText;
  });
}

/**
 * CSS state for a right-column item after check.
 * Wrong overall answers pulse the correct partner for mis-matched pairs.
 */
export function rightMatchRevealState({
  showResult = false,
  isCorrect = false,
  rightIdx = 0,
  rightText = "",
  matchedPairs = [],
  question = null,
} = {}) {
  if (!showResult) return {};

  const shouldHint =
    !isCorrect &&
    isCorrectPartnerForWrongMatch(rightText, matchedPairs, question);

  const match = matchForRight(rightIdx, matchedPairs);
  if (match) {
    const state = isUserPairCorrect(match, question)
      ? { correct: true }
      : { wrong: true };
    if (shouldHint) state["correct-hint"] = true;
    return state;
  }

  return shouldHint ? { "correct-hint": true } : {};
}

/** CSS state for the built sentence area in word-order questions (T06). */
export function builtSentenceRevealState({ showResult = false, isCorrect = false } = {}) {
  if (!showResult) return "";
  return isCorrect ? "is-correct" : "is-wrong";
}