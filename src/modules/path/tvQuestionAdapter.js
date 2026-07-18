function answerTokens(answer) {
  const normalized = String(answer || "").trim();
  if (!normalized) return [];
  if (/\s/.test(normalized)) return normalized.split(/\s+/);
  return Array.from(normalized);
}

export function adaptQuestionsForTv(questions = []) {
  return questions.map((question) => {
    if (question.type !== "T09" && question.type !== "T10") return question;

    const targetSentence = question.type === "T10"
      ? question.acceptedAnswers?.[0] || question.answer || ""
      : question.answer || "";

    return {
      ...question,
      type: "T06",
      tvOriginalType: question.type,
      targetSentence,
      words: answerTokens(targetSentence),
    };
  });
}
