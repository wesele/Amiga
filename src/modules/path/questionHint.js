function getChoiceWrongLabels(question) {
  const idx = Number(question.answerIdx);
  if (Number.isNaN(idx)) return [];

  if (question.type === "T02") {
    return (question.imageOptions || [])
      .map((opt, i) => ({ label: opt?.desc || "", i }))
      .filter(({ i, label }) => i !== idx && label)
      .slice(0, 2)
      .map(({ label }) => label);
  }

  if (["T01", "T05", "T07", "T08", "T12"].includes(question.type)) {
    return (question.options || [])
      .map((opt, i) => ({ label: opt, i }))
      .filter(({ i, label }) => i !== idx && label)
      .slice(0, 2)
      .map(({ label }) => label);
  }

  return [];
}

function spellingPrefix(answer) {
  const text = String(answer ?? "").trim();
  if (!text) return "";
  const length = text.length;
  const prefixLen = length <= 2 ? 1 : Math.min(3, Math.ceil(length / 3));
  return text.slice(0, prefixLen);
}

/**
 * Returns a learner-facing hint for the current question, or null if none applies.
 * Author-written `question.hint` takes priority; otherwise a type-specific nudge is generated.
 */
export function getQuestionHint(question, t) {
  if (!question || typeof t !== "function") return null;

  const authored = String(question.hint ?? "").trim();
  if (authored) return authored;

  const type = question.type;

  if (["T01", "T02", "T05", "T07", "T08", "T12"].includes(type)) {
    const wrong = getChoiceWrongLabels(question);
    if (!wrong.length) return null;
    return t("path.hintEliminate", { options: wrong.join("、") });
  }

  if (type === "T03") {
    const pair = (question.pairs || []).find((p) => p?.left && p?.right);
    if (!pair) return null;
    return t("path.hintMatchPair", { left: pair.left, right: pair.right });
  }

  if (type === "T06") {
    const words = String(question.targetSentence ?? "")
      .trim()
      .split(/\s+/)
      .filter(Boolean);
    if (!words.length) return null;
    return t("path.hintWordOrder", { count: words.length, first: words[0] });
  }

  if (type === "T09") {
    const prefix = spellingPrefix(question.answer);
    if (!prefix) return null;
    return t("path.hintSpelling", { prefix });
  }

  if (type === "T10") {
    const prefix = spellingPrefix(question.acceptedAnswers?.[0]);
    if (!prefix) return null;
    return t("path.hintSpelling", { prefix });
  }

  return null;
}

export function hasQuestionHint(question) {
  if (!question) return false;
  if (String(question.hint ?? "").trim()) return true;

  const type = question.type;
  if (["T01", "T02", "T05", "T07", "T08", "T12"].includes(type)) {
    return getChoiceWrongLabels(question).length > 0;
  }
  if (type === "T03") {
    return (question.pairs || []).some((p) => p?.left && p?.right);
  }
  if (type === "T06") {
    return String(question.targetSentence ?? "").trim().length > 0;
  }
  if (type === "T09") {
    return spellingPrefix(question.answer).length > 0;
  }
  if (type === "T10") {
    return spellingPrefix(question.acceptedAnswers?.[0]).length > 0;
  }
  return false;
}