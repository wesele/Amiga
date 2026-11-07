import { computed, onBeforeUnmount, ref, watch } from "vue";
import { canUseSpeechTts, speakText, stopSpeech } from "@/shared/speechTts.js";

export function useListeningQuestionAudio({ currentQuestion, currentQuestionIndex, getTargetLang }) {
  const audioBusy = ref(false);
  const speakingQuestionKey = ref(null);

  const canPlayListeningAudio = computed(() => {
    return canUseSpeechTts() && !!currentQuestion.value?.audio_text;
  });

  function stopAudio() {
    stopSpeech();
    audioBusy.value = false;
    speakingQuestionKey.value = null;
  }

  function playAudio() {
    const text = currentQuestion.value?.audio_text;
    if (!text || audioBusy.value) return;
    stopAudio();
    const speechLang = typeof getTargetLang === "function" ? getTargetLang() : (getTargetLang || "en");
    audioBusy.value = true;
    speakingQuestionKey.value = currentQuestion.value?.id ?? currentQuestionIndex?.value ?? "current";

    const ok = speakText(text, speechLang, {
      rate: 0.9,
      onStart: () => {
        audioBusy.value = true;
      },
      onEnd: () => {
        audioBusy.value = false;
        speakingQuestionKey.value = null;
      },
      onError: () => {
        audioBusy.value = false;
        speakingQuestionKey.value = null;
      },
    });

    if (!ok) {
      audioBusy.value = false;
      speakingQuestionKey.value = null;
    }
  }

  function toggleListeningAudio() {
    if (audioBusy.value) {
      stopAudio();
    } else {
      playAudio();
    }
  }

  watch(currentQuestionIndex, () => {
    stopAudio();
  });

  onBeforeUnmount(() => {
    stopAudio();
  });

  return {
    audioBusy,
    isPlaying: audioBusy,
    speakingQuestionKey,
    canPlayListeningAudio,
    playAudio,
    stopAudio,
    stopListeningAudio: stopAudio,
    toggleListeningAudio,
  };
}
