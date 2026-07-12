import { gradeTranslation } from "@/shared/api.js";

function normalizeText(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
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

export async function checkAnswerAsync(question, answer, targetLang) {
  if (!question) return false;
  const type = question.type;

  if (type === "T10") {
    // 1. Try local exact match first
    if (checkAnswer(question, answer)) {
      return true;
    }

    // 2. Fallback to AI grading
    try {
      const sourceText = question.sourceText;
      const acceptedAnswers = question.acceptedAnswers || [];
      const userAnswer = String(answer ?? "").trim();
      if (!userAnswer) return false;

      const isCorrect = await gradeTranslation(
        sourceText,
        acceptedAnswers,
        userAnswer,
        targetLang || question.language || "es"
      );
      return !!isCorrect;
    } catch (e) {
      console.error("AI translation grading failed, falling back to local match:", e);
      return checkAnswer(question, answer);
    }
  }

  // Other types use synchronous check
  return checkAnswer(question, answer);
}