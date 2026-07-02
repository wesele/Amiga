function normalizeText(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

export function formatQuestionPrompt(question, t) {
  if (!question || !t) return "";

  const q = question;

  if (q.type === "T05") return q.sentence?.replace(/_{2,}/, "______") || q.sentence || "";
  if (q.type === "T07") return q.sourceText || "";
  if (q.type === "T08") return q.question || t("path.listenChoose");
  if (q.type === "T12") return q.scenario || "";
  if (q.type === "T09") return q.hint || "";
  if (q.type === "T10") return q.sourceText || "";
  if (q.type === "T01") return t("path.chooseByImage");
  if (q.type === "T02") return t("path.listenChooseImage");
  if (q.type === "T03") return t("path.matchPairs");
  if (q.type === "T06") return t("path.buildSentence");
  return "";
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
    return normalizeText(answer) === normalizeText(question.answer);
  }

  if (type === "T10") {
    const accepted = (question.acceptedAnswers || []).map(normalizeText);
    return accepted.includes(normalizeText(answer));
  }

  return false;
}