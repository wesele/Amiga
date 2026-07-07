export const optionLabels = ["A", "B", "C", "D"];

function rawCorrectIndex(raw) {
  let correctIndex = raw?.correct_index ?? raw?.correct;
  if (typeof correctIndex === "string") {
    const trimmed = correctIndex.trim();
    const letterIndex = optionLabels.indexOf(trimmed.toUpperCase());
    if (letterIndex >= 0) return letterIndex;
    correctIndex = Number(trimmed);
  }
  return Number(correctIndex);
}

function rawCorrectIsLetter(raw) {
  const correctIndex = raw?.correct_index ?? raw?.correct;
  return typeof correctIndex === "string" && optionLabels.includes(correctIndex.trim().toUpperCase());
}

function normalizeQuestion(raw, useOneBasedIndex) {
  const options = Array.isArray(raw?.options) ? raw.options.map((option) => String(option)) : [];
  let correctIndex = rawCorrectIndex(raw);
  if (useOneBasedIndex && !rawCorrectIsLetter(raw) && Number.isInteger(correctIndex)) {
    correctIndex -= 1;
  }
  const questionType = raw?.question_type || raw?.type || "reading";
  const audioText = raw?.audio_text || raw?.audioText || "";
  return {
    ...raw,
    question: String(raw?.question || ""),
    options,
    correct_index: Number.isInteger(correctIndex) ? correctIndex : -1,
    question_type: questionType,
    audio_text: audioText ? String(audioText) : "",
  };
}

function isValidQuestion(question) {
  const baseValid =
    question.question_type === "listening"
      ? Boolean(question.audio_text)
      : Boolean(question.question);
  return (
    baseValid &&
    question.options.length === 4 &&
    question.correct_index >= 0 &&
    question.correct_index < question.options.length
  );
}

export function normalizeQuestions(rawQuestions) {
  const list = Array.isArray(rawQuestions) ? rawQuestions : [];
  const useOneBasedIndex = list.some((question) => rawCorrectIndex(question) === question?.options?.length);
  return list
    .map((question) => normalizeQuestion(question, useOneBasedIndex))
    .filter(isValidQuestion);
}

export function readingOptionClass(question, selectedAnswer, optionIndex) {
  if (selectedAnswer === undefined) return "";
  if (optionIndex === question.correct_index) return "correct";
  if (selectedAnswer === optionIndex) return "wrong";
  return "dimmed";
}
