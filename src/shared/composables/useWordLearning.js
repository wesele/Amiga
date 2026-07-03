import { ref } from "vue";
import { addDiscoveredWord, lookupWordIds, updateWordMastery } from "@/shared/api.js";

/**
 * Shared word-popup + vocabulary persistence for reading and chat surfaces.
 */
export function useWordLearning({
  getTargetLang,
  getUserId,
  source = "news_reading",
  t,
  onWordMarkedUnknown,
  onWordMarkedKnown,
  knownToastKey = "news.wordMarkedKnown",
  unknownToastKey = "news.wordMarkedUnknown",
} = {}) {
  const selectedWord = ref(null);
  const wordToast = ref("");
  let wordToastTimer = null;

  function showWordToast(msg) {
    wordToast.value = msg;
    if (wordToastTimer) clearTimeout(wordToastTimer);
    wordToastTimer = setTimeout(() => {
      wordToast.value = "";
      wordToastTimer = null;
    }, 2500);
  }

  function openWordPopup(text, context = "") {
    const trimmed = String(text ?? "").trim();
    if (!trimmed) return;
    selectedWord.value = { text: trimmed, context: String(context ?? "").trim() };
  }

  function closeWordPopup() {
    selectedWord.value = null;
  }

  async function handleWordKnown() {
    if (!selectedWord.value) return;
    const wordText = selectedWord.value.text;
    const context = selectedWord.value.context;
    try {
      const userId = getUserId?.();
      const targetLang = getTargetLang?.();
      if (userId && targetLang) {
        const ids = await lookupWordIds([wordText], targetLang);
        if (ids.length > 0) {
          await updateWordMastery(userId, ids[0], 2, source);
        } else {
          const newId = await addDiscoveredWord(userId, wordText, targetLang, context);
          await updateWordMastery(userId, newId, 2, source);
        }
      }
      showWordToast(t(knownToastKey));
      onWordMarkedKnown?.(wordText);
    } catch (_) {
      // Best-effort persistence.
    }
    selectedWord.value = null;
  }

  async function handleWordUnknown() {
    if (!selectedWord.value) return;
    const wordText = selectedWord.value.text;
    const context = selectedWord.value.context;
    try {
      const userId = getUserId?.();
      const targetLang = getTargetLang?.();
      if (userId && targetLang) {
        const ids = await lookupWordIds([wordText], targetLang);
        if (ids.length > 0) {
          await updateWordMastery(userId, ids[0], 1, source);
        } else {
          await addDiscoveredWord(userId, wordText, targetLang, context);
        }
      }
      showWordToast(t(unknownToastKey));
      onWordMarkedUnknown?.(wordText);
    } catch (_) {
      // Best-effort persistence.
    }
    selectedWord.value = null;
  }

  function cleanup() {
    if (wordToastTimer) {
      clearTimeout(wordToastTimer);
      wordToastTimer = null;
    }
  }

  return {
    selectedWord,
    wordToast,
    openWordPopup,
    closeWordPopup,
    handleWordKnown,
    handleWordUnknown,
    showWordToast,
    cleanup,
  };
}