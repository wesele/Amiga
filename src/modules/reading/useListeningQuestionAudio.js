import { onBeforeUnmount, ref, watch } from "vue";
import { getSpeechLang, pickSpeechVoice } from "@/shared/speechTts.js";
import { speakNativeTts, stopNativeTts } from "@/shared/ttsBridge.js";

export function useListeningQuestionAudio({ currentQuestion, currentQuestionIndex, getTargetLang }) {
  const audioBusy = ref(false);

  let speechUtterance = null;
  let pendingNativeRead = null;
  let nativeToken = null;

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
        audioBusy.value = false;
        speechUtterance = null;
      }
    };
    utterance.onerror = utterance.onend;
    speechUtterance = utterance;
    audioBusy.value = true;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
    return true;
  }

  function onTtsDone() {
    pendingNativeRead = null;
    nativeToken = null;
    audioBusy.value = false;
    speechUtterance = null;
  }

  function onTtsError() {
    const pending = pendingNativeRead;
    pendingNativeRead = null;
    nativeToken = null;
    audioBusy.value = false;
    speechUtterance = null;
    if (pending) speakWithWeb(pending.text, pending.speechLang);
  }

  function stopAudio() {
    pendingNativeRead = null;
    stopNativeTts(nativeToken);
    nativeToken = null;
    if (typeof window !== "undefined" && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
    audioBusy.value = false;
    speechUtterance = null;
  }

  function playAudio() {
    const text = currentQuestion.value?.audio_text;
    if (!text || audioBusy.value) return;
    stopAudio();
    const speechLang = getSpeechLang(getTargetLang());

    const native = speakNativeTts(text, speechLang, {
      onDone: onTtsDone,
      onError: onTtsError,
    });
    if (native.started) {
      nativeToken = native.token;
      pendingNativeRead = { text, speechLang };
      audioBusy.value = true;
      return;
    }

    speakWithWeb(text, speechLang);
  }

  watch(currentQuestionIndex, () => {
    stopAudio();
  });

  onBeforeUnmount(() => {
    stopAudio();
  });

  return {
    audioBusy,
    playAudio,
    stopAudio,
  };
}
