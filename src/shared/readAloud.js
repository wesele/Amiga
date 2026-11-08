import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { cleanHtmlText, splitTextIntoSentences } from "@/shared/articleText.js";
import {
  canUseSpeechTts,
  fetchSpeechMultimodalConfig,
  speakText,
  stopSpeech,
} from "@/shared/speechTts.js";

export function useReadAloud({ getText, getLang, getTargetLang, getSegments, t } = {}) {
  const reading = ref(false);
  const readStatus = ref("");
  let readStatusTimer = null;
  const ttsAvailable = ref(canUseSpeechTts());

  const activeSentence = ref(null);
  const isTitleActive = computed(() => Boolean(reading.value && activeSentence.value?.isTitle));

  function isSentenceActive(paragraphIndex, sentenceIndex) {
    return Boolean(
      reading.value &&
        activeSentence.value &&
        !activeSentence.value.isTitle &&
        activeSentence.value.paragraphIndex === paragraphIndex &&
        activeSentence.value.sentenceIndex === sentenceIndex,
    );
  }

  const canRead = computed(() => {
    let hasContent = false;
    if (typeof getSegments === "function") {
      const segs = getSegments() || [];
      hasContent = segs.some((s) => Boolean(s && String(s.text || "").trim()));
    }
    if (!hasContent && getText) {
      const text = getText();
      if (text && String(text).trim()) {
        hasContent = true;
      }
    }
    if (!hasContent) return false;
    return ttsAvailable.value || canUseSpeechTts();
  });

  const currentLang = computed(() => {
    const langFn = getLang || getTargetLang;
    return (typeof langFn === "function" ? langFn() : langFn) || "en";
  });

  function showReadStatus(msg) {
    if (!msg) return;
    readStatus.value = msg;
    if (readStatusTimer) clearTimeout(readStatusTimer);
    readStatusTimer = setTimeout(() => {
      readStatus.value = "";
    }, 2800);
  }

  function resolveSegments() {
    if (typeof getSegments === "function") {
      const raw = getSegments() || [];
      return raw
        .map((seg) => ({
          ...seg,
          isTitle: Boolean(seg?.isTitle),
          paragraphIndex: seg?.paragraphIndex ?? -1,
          sentenceIndex: seg?.sentenceIndex ?? -1,
          text: cleanHtmlText(seg?.text || "").trim(),
        }))
        .filter((seg) => Boolean(seg.text));
    }

    const rawText = String(getText ? getText() : "").trim();
    if (!rawText) return [];

    const rawParagraphs = rawText
      .split(/\n{2,}/)
      .map((p) => p.trim())
      .filter(Boolean);

    const segments = [];
    rawParagraphs.forEach((para, pIdx) => {
      const sentences = splitTextIntoSentences(para);
      sentences.forEach((sent, sIdx) => {
        segments.push({
          isTitle: false,
          paragraphIndex: pIdx,
          sentenceIndex: sIdx,
          text: sent,
        });
      });
    });
    return segments;
  }

  let activeRunId = 0;

  function stopReading() {
    activeRunId++;
    stopSpeech();
    reading.value = false;
    activeSentence.value = null;
  }

  function startReading() {
    if (!canRead.value) return;
    stopReading();
    const currentRunId = ++activeRunId;

    const segments = resolveSegments();
    if (!segments || segments.length === 0) return;

    const speechLang = currentLang.value;

    function playSegment(index) {
      if (currentRunId !== activeRunId) return;

      if (index >= segments.length) {
        reading.value = false;
        readStatus.value = "";
        activeSentence.value = null;
        return;
      }

      const seg = segments[index];
      reading.value = true;
      readStatus.value = "";
      activeSentence.value = {
        isTitle: Boolean(seg.isTitle),
        paragraphIndex: seg.paragraphIndex ?? -1,
        sentenceIndex: seg.sentenceIndex ?? -1,
      };

      let hasAdvanced = false;
      const advance = () => {
        if (currentRunId !== activeRunId) return;
        if (hasAdvanced) return;
        hasAdvanced = true;
        playSegment(index + 1);
      };

      let result;
      try {
        result = speakText(seg.text, speechLang, {
          rate: 0.9,
          onStart: () => {
            if (currentRunId !== activeRunId) return;
            reading.value = true;
            readStatus.value = "";
            activeSentence.value = {
              isTitle: Boolean(seg.isTitle),
              paragraphIndex: seg.paragraphIndex ?? -1,
              sentenceIndex: seg.sentenceIndex ?? -1,
            };
          },
          onEnd: () => {
            advance();
          },
          onError: (err) => {
            if (currentRunId !== activeRunId) return;
            activeRunId++;
            stopSpeech();
            reading.value = false;
            activeSentence.value = null;
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
      } catch (err) {
        if (currentRunId !== activeRunId) return;
        activeRunId++;
        stopSpeech();
        reading.value = false;
        activeSentence.value = null;
        showReadStatus(
          t
            ? (t("common.readAloudUnavailable") !== "common.readAloudUnavailable"
                ? t("common.readAloudUnavailable")
                : t("news.readAloudFail"))
            : "Read aloud failed",
        );
        return;
      }

      const isStarted =
        result !== false &&
        !(result && typeof result === "object" && result.started === false);

      if (!isStarted) {
        if (currentRunId !== activeRunId) return;
        activeRunId++;
        stopSpeech();
        reading.value = false;
        activeSentence.value = null;
        showReadStatus(
          t
            ? (t("common.readAloudUnavailable") !== "common.readAloudUnavailable"
                ? t("common.readAloudUnavailable")
                : t("news.readAloudFail"))
            : "Read aloud failed",
        );
      }
    }

    playSegment(0);
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
    canRead,
    currentLang,
    activeSentence,
    isTitleActive,
    isSentenceActive,
    startReading,
    stopReading,
    toggleReading,
  };
}
