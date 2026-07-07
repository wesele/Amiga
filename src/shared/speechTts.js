import { speakNativeTts, stopNativeTts } from "@/shared/ttsBridge.js";

const SPEECH_LANG_MAP = {
  es: "es-ES",
  en: "en-US",
  zh: "zh-CN",
};

export function getSpeechLang(lang) {
  return SPEECH_LANG_MAP[lang] || lang || "en-US";
}

export function pickSpeechVoice(lang) {
  if (typeof window === "undefined" || !window.speechSynthesis) return null;
  const voices = window.speechSynthesis.getVoices?.() || [];
  const langLower = lang.toLowerCase();
  const family = langLower.split("-")[0];
  return (
    voices.find((voice) => voice.lang.toLowerCase() === langLower) ||
    voices.find((voice) => voice.lang.toLowerCase().startsWith(`${family}-`)) ||
    voices.find((voice) => voice.lang.toLowerCase() === family) ||
    null
  );
}

export function speakText(text, lang, { onStart, onEnd } = {}) {
  if (!text || typeof window === "undefined") {
    onEnd?.();
    return false;
  }

  const native = speakNativeTts(text, getSpeechLang(lang), {
    onDone: onEnd,
    onError: onEnd,
  });
  if (native.started) {
    onStart?.();
    return true;
  }

  if (!("speechSynthesis" in window)) {
    onEnd?.();
    return false;
  }
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = getSpeechLang(lang);
  utterance.voice = pickSpeechVoice(utterance.lang);
  utterance.rate = 0.9;
  utterance.onstart = () => onStart?.();
  utterance.onend = () => onEnd?.();
  utterance.onerror = () => onEnd?.();
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(utterance);
  return true;
}

export function stopSpeech() {
  stopNativeTts();
  if (typeof window !== "undefined" && window.speechSynthesis) {
    window.speechSynthesis.cancel();
  }
}
