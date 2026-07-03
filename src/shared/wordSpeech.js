/** Brief pause so the layout settles before speech starts. */
export const WORD_SPEECH_AUTO_PLAY_MS = 320;

export const SPEECH_RATE_NORMAL = 1;
export const SPEECH_RATE_SLOW = 0.72;

export function speechLanguageCode(language) {
  if (language === "es") return "es-ES";
  if (language === "en") return "en-US";
  return "zh-CN";
}

export function isSpeechSynthesisAvailable(
  speechSynthesis = globalThis.speechSynthesis,
) {
  return Boolean(speechSynthesis);
}

/**
 * Speak text via the Web Speech API.
 * Resolves to false when synthesis is unavailable or text is empty.
 *
 * @param {{ text: string, language: string, rate?: number }} opts
 */
export function speakText(
  { text, language, rate = SPEECH_RATE_NORMAL },
  { speechSynthesis = globalThis.speechSynthesis } = {},
) {
  const trimmed = String(text || "").trim();
  if (!trimmed || !speechSynthesis) return Promise.resolve(false);

  speechSynthesis.cancel();
  const utter = new SpeechSynthesisUtterance(trimmed);
  utter.lang = speechLanguageCode(language);
  utter.rate = rate;

  return new Promise((resolve) => {
    utter.onend = () => resolve(true);
    utter.onerror = () => resolve(false);
    speechSynthesis.speak(utter);
  });
}

/** @param {string | { word?: string }} word */
export function speakWord(word, language, opts) {
  const text = typeof word === "object" && word !== null ? word?.word : word;
  return speakText({ text, language }, opts);
}

export function shouldAutoPlayWordSpeech({ showResult, enabled = true } = {}) {
  return enabled && !showResult;
}