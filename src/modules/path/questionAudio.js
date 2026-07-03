import {
  SPEECH_RATE_NORMAL,
  speakText,
  speechLanguageCode,
} from "@/shared/wordSpeech.js";

export { SPEECH_RATE_NORMAL, SPEECH_RATE_SLOW } from "@/shared/wordSpeech.js";

export { speechLanguageCode };

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

/**
 * Speak question audio via the Web Speech API.
 * Resolves to false when synthesis is unavailable or text is empty.
 */
export function isListenFirstQuestion(question) {
  return ["T02", "T08"].includes(question?.type);
}

export function speakQuestionAudio(
  question,
  { rate = SPEECH_RATE_NORMAL, speechSynthesis = globalThis.speechSynthesis } = {},
) {
  return speakText(
    { text: question?.audioText, language: question?.language, rate },
    { speechSynthesis },
  );
}