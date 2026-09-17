import { onBeforeUnmount, watch } from "vue";
import { getSpeechLang } from "@/shared/speechTts.js";
import { useSpeechPlayback } from "@/shared/useSpeechPlayback.js";

export function useListeningQuestionAudio({ currentQuestion, currentQuestionIndex, getTargetLang }) {
  const { busy: audioBusy, play, stop: stopAudio } = useSpeechPlayback();

  function playAudio() {
    const text = currentQuestion.value?.audio_text;
    if (!text || audioBusy.value) return;
    play(text, getSpeechLang(getTargetLang()));
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
