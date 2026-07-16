import { ref } from "vue";
import {
  addDiscoveredWord,
  ensureWordsSeen,
  lookupWordIds,
  updateWordMastery,
} from "@/shared/backend/vocabulary.js";
import { extractWordTexts } from "./articleText.js";

export function useNewsArticleWords({ getUserId, getTargetLang, getArticle }) {
  const selectedWord = ref(null);
  const knownWordIds = ref(new Set());
  const wordsKnownSet = ref(new Set());
  const wordsUnknownSet = ref(new Set());
  const wordsProcessed = ref(false);

  function articleWordTexts() {
    const article = getArticle();
    const body = article?.rewritten_body || article?.original_body || "";
    const title = article?.original_title || "";
    return extractWordTexts(`${title} ${body}`);
  }

  async function processArticleWords() {
    if (wordsProcessed.value || !getUserId() || !getArticle()) return;
    const wordTokens = articleWordTexts();
    if (wordTokens.length === 0) return;
    try {
      await ensureWordsSeen(getUserId(), wordTokens, getTargetLang());
      wordsProcessed.value = true;
    } catch (e) {
      console.error("Failed to process article words:", e);
    }
  }

  async function ensureArticleWordsSeenIfNeeded() {
    if (wordsProcessed.value) return;
    try {
      const wordTokens = articleWordTexts();
      if (wordTokens.length > 0) {
        await ensureWordsSeen(getUserId(), wordTokens, getTargetLang());
      }
    } catch (e) {
      console.error("Failed to mark words as seen:", e);
    }
  }

  function onWordTap(token) {
    if (!token.isWord) return;
    const sel = window.getSelection();
    if (sel && sel.toString().trim().length > 0) return;
    selectedWord.value = token;
    knownWordIds.value.add(token.text);
  }

  async function upsertWordMastery(word, mastery, source) {
    const ids = await lookupWordIds([word.text], getTargetLang());
    if (ids.length > 0) {
      await updateWordMastery(getUserId(), ids[0], mastery, source);
      return;
    }
    const newId = await addDiscoveredWord(getUserId(), word.text, getTargetLang(), word.context);
    if (mastery > 1) {
      await updateWordMastery(getUserId(), newId, mastery, source);
    }
  }

  async function onWordKnown() {
    if (selectedWord.value) {
      knownWordIds.value.add(selectedWord.value.text);
      wordsKnownSet.value.add(selectedWord.value.text);
      try {
        await upsertWordMastery(selectedWord.value, 2, "news_reading");
      } catch (e) {
        console.error("Failed to mark news word known", e);
      }
    }
    selectedWord.value = null;
  }

  async function onWordUnknown() {
    if (selectedWord.value) {
      knownWordIds.value.add(selectedWord.value.text);
      wordsUnknownSet.value.add(selectedWord.value.text);
      try {
        await upsertWordMastery(selectedWord.value, 1, "news_reading");
      } catch (e) {
        console.error("Failed to mark news word unknown", e);
      }
    }
    selectedWord.value = null;
  }

  return {
    selectedWord,
    knownWordIds,
    wordsKnownSet,
    wordsUnknownSet,
    processArticleWords,
    ensureArticleWordsSeenIfNeeded,
    onWordTap,
    onWordKnown,
    onWordUnknown,
  };
}
