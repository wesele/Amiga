import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import {
  canUseSpeechTts,
  fetchSpeechMultimodalConfig,
  speakText,
  stopSpeech,
} from "@/shared/speechTts.js";

export function useReadAloud({ getText, getTargetLang, t }) {
  const reading = ref(false);
  const readStatus = ref("");
  let readStatusTimer = null;
  const ttsAvailable = ref(canUseSpeechTts());

  const canRead = computed(() => {
    const text = getText ? getText() : "";
    if (!text || !String(text).trim()) return false;
    return ttsAvailable.value || canUseSpeechTts();
  });

  const currentLang = computed(() => {
    return (typeof getTargetLang === "function" ? getTargetLang() : getTargetLang) || "en";
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
    stopReading();
    const text = String(getText ? getText() : "").trim();
    if (!text) return;
    const speechLang = currentLang.value;

    const ok = speakText(text, speechLang, {
      rate: 0.9,
      onStart: () => {
        reading.value = true;
      },
      onEnd: () => {
        reading.value = false;
      },
      onError: (err) => {
        reading.value = false;
        const msg = String(err?.message || err || "");
        if (msg.includes("missing-language") || msg.includes("missing")) {
          showReadStatus(t ? t("news.readAloudMissingLanguage") : "Speech data missing");
        } else {
          showReadStatus(
            t
              ? (t("common.readAloudUnavailable") !== "common.readAloudUnavailable"
                  ? t("common.readAloudUnavailable")
                  : t("news.readAloudFail"))
              : "Read aloud failed",
          );
        }
      },
    });

    if (ok) {
      reading.value = true;
    } else {
      reading.value = false;
      showReadStatus(
        t
          ? (t("common.readAloudUnavailable") !== "common.readAloudUnavailable"
              ? t("common.readAloudUnavailable")
              : t("news.readAloudFail"))
          : "Read aloud failed",
      );
    }
  }

  function stopReading() {
    stopSpeech();
    reading.value = false;
  }

  function toggleReading() {
    if (reading.value) {
      stopReading();
      return;
    }
    startReading();
  }

  onMounted(async () => {
    ttsAvailable.value = canUseSpeechTts();
    try {
      await fetchSpeechMultimodalConfig();
    } catch (_) {}
    ttsAvailable.value = canUseSpeechTts();
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
    isReading: reading,
    readStatus,
    readError: readStatus,
    currentLang,
    canRead,
    toggleReading,
    startReading,
    stopReading,
  };
}
