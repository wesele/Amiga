import { computed, onMounted, onBeforeUnmount, ref } from "vue";
import { getSpeechLang } from "@/shared/speechTts.js";
import { isNativeTtsAvailable } from "@/shared/ttsBridge.js";
import { useSpeechPlayback } from "@/shared/useSpeechPlayback.js";

export function useReadAloud({ getText, getTargetLang, t }) {
  const { busy: reading, play, stop } = useSpeechPlayback();
  const readStatus = ref("");
  let readStatusTimer = null;
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

  function startReading() {
    if (!canRead.value) return;
    const text = String(getText()).trim();
    const speechLang = getSpeechLang(getTargetLang());
    play(text, speechLang, {
      onFail: () => showReadStatus(t("news.readAloudFail")),
      onMissingLanguage: () => showReadStatus(t("news.readAloudMissingLanguage")),
    });
  }

  function stopReading() {
    stop();
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
