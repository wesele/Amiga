function normalizeText(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

export function formatCorrectAnswer(question) {
  if (!question) return "";

  const type = question.type;

  if (["T01", "T02", "T05", "T07", "T08", "T12"].includes(type)) {
    const idx = Number(question.answerIdx);
    if (type === "T02") {
      return question.imageOptions?.[idx]?.desc || "";
    }
    return question.options?.[idx] || "";
  }

  if (type === "T03") {
    return (question.pairs || [])
      .map((p) => `${p.left} → ${p.right}`)
      .join(" · ");
  }

  if (type === "T06") {
    return question.targetSentence || "";
  }

  if (type === "T09") {
    return question.answer || "";
  }

  if (type === "T10") {
    const answers = question.acceptedAnswers || [];
    return answers[0] || "";
  }

  return "";
}

export function checkAnswer(question, answer) {
  if (!question) return false;
  const type = question.type;

  if (["T01", "T02", "T05", "T07", "T08", "T12"].includes(type)) {
    return Number(answer) === Number(question.answerIdx);
  }

  if (type === "T03") {
    const expected = (question.pairs || []).map((p) => `${p.left}::${p.right}`).sort();
    const given = (answer || []).map((p) => `${p.left}::${p.right}`).sort();
    return JSON.stringify(expected) === JSON.stringify(given);
  }

  if (type === "T06") {
    const target = normalizeText(question.targetSentence);
    const built = normalizeText((answer || []).join(" "));
    return target === built;
  }

  if (type === "T09") {
    const accepted = [question.answer, ...(question.commonMistakes || [])].map(normalizeText);
    return accepted.includes(normalizeText(answer));
  }

  if (type === "T10") {
    const accepted = (question.acceptedAnswers || []).map(normalizeText);
    return accepted.includes(normalizeText(answer));
  }

  return false;
}