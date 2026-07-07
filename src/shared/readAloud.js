import { ref, computed, onMounted, onBeforeUnmount } from "vue";
import { isNativeTtsAvailable, speakNativeTts, stopNativeTts } from "@/shared/ttsBridge.js";

const SPEECH_LANG_MAP = {
  es: "es-ES",
  en: "en-US",
  zh: "zh-CN",
};

function getSpeechLang(lang) {
  return SPEECH_LANG_MAP[lang] || lang || "en-US";
}

function pickSpeechVoice(lang) {
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

export function useReadAloud({ getText, getTargetLang, t }) {
  const reading = ref(false);
  const readStatus = ref("");
  let speechUtterance = null;
  let readStatusTimer = null;
  let pendingNativeRead = null;
  let nativeToken = null;
  const nativeTtsAvailable = ref(false);

  const canRead = computed(() => {
    const text = getText();
    if (!text || !String(text).trim()) return false;
    return nativeTtsAvailable.value || (typeof window !== "undefined" && "speechSynthesis" in window);
  });

  function showReadStatus(msg) {
    if (!msg) return;
    readStatus.value = msg;
    if (readStatusTimer) clearTimeout(readStatusTimer);
    readStatusTimer = setTimeout(() => {
      readStatus.value = "";
    }, 2800);
  }

  function onTtsDone() {
    pendingNativeRead = null;
    nativeToken = null;
    reading.value = false;
    speechUtterance = null;
  }

  function onTtsError(code) {
    const pending = pendingNativeRead;
    pendingNativeRead = null;
    nativeToken = null;
    reading.value = false;
    speechUtterance = null;
    if (!pending) return;
    if (speakWithWeb(pending.text, pending.speechLang)) return;
    if (code === "missing-language" || String(code).includes("missing")) {
      showReadStatus(t("news.readAloudMissingLanguage"));
    } else {
      showReadStatus(t("news.readAloudFail"));
    }
  }

  function speakWithWeb(text, speechLang) {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) {
      return false;
    }
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = speechLang;
    utterance.voice = pickSpeechVoice(speechLang);
    utterance.rate = 0.9;
    utterance.onend = () => {
      if (speechUtterance === utterance) {
        reading.value = false;
        speechUtterance = null;
      }
    };
    utterance.onerror = utterance.onend;
    speechUtterance = utterance;
    reading.value = true;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
    return true;
  }

  function startReading() {
    if (!canRead.value) return;
    stopReading();
    const text = String(getText()).trim();
    const speechLang = getSpeechLang(getTargetLang());

    const native = speakNativeTts(text, speechLang, {
      onDone: onTtsDone,
      onError: onTtsError,
    });
    if (native.started) {
      nativeToken = native.token;
      pendingNativeRead = { text, speechLang };
      reading.value = true;
      return;
    }
    if (native.result !== "unavailable") {
      if (speakWithWeb(text, speechLang)) return;
      if (native.result === "missing-language") {
        showReadStatus(t("news.readAloudMissingLanguage"));
      } else {
        showReadStatus(t("news.readAloudFail"));
      }
      return;
    }

    if (!speakWithWeb(text, speechLang)) {
      showReadStatus(t("news.readAloudFail"));
    }
  }

  function stopReading() {
    pendingNativeRead = null;
    stopNativeTts(nativeToken);
    nativeToken = null;
    if (typeof window !== "undefined" && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
    reading.value = false;
    speechUtterance = null;
  }

  function toggleReading() {
    if (reading.value) {
      stopReading();
      return;
    }
    startReading();
  }

  onMounted(() => {
    nativeTtsAvailable.value = isNativeTtsAvailable();
  });

  onBeforeUnmount(() => {
    if (readStatusTimer) {
      clearTimeout(readStatusTimer);
      readStatusTimer = null;
    }
    stopReading();
  });

  return {
    reading,
    readStatus,
    canRead,
    toggleReading,
    stopReading,
  };
}
