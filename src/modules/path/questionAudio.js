/** Question types that may include reference audio for the learner. */
export const AUDIO_QUESTION_TYPES = ["T02", "T08", "T09", "T11"];

/** Brief pause so the question layout settles before speech starts. */
export const QUESTION_AUDIO_AUTO_PLAY_MS = 320;

export function hasQuestionAudio(question) {
  return (
    AUDIO_QUESTION_TYPES.includes(question?.type) &&
    Boolean(String(question?.audioText || "").trim())
  );
}

/**
 * Whether audio should play automatically when a question appears.
 * Skips result screens so wrong-answer feedback is not interrupted.
 */
export function shouldAutoPlayQuestionAudio(question, { showResult = false } = {}) {
  return hasQuestionAudio(question) && !showResult;
}

export function speechLanguageCode(language) {
  if (language === "es") return "es-ES";
  if (language === "en") return "en-US";
  return "zh-CN";
}

/**
 * Speak question audio via the Web Speech API.
 * Resolves to false when synthesis is unavailable or text is empty.
 */
export function speakQuestionAudio(
  question,
  { speechSynthesis = globalThis.speechSynthesis } = {},
) {
  const text = String(question?.audioText || "").trim();
  if (!text || !speechSynthesis) return Promise.resolve(false);

  speechSynthesis.cancel();
  const utter = new SpeechSynthesisUtterance(text);
  utter.lang = speechLanguageCode(question?.language);

  return new Promise((resolve) => {
    utter.onend = () => resolve(true);
    utter.onerror = () => resolve(false);
    speechSynthesis.speak(utter);
  });
}