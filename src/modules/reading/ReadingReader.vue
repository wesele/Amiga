<template>
  <div class="reading-reader">
    <header class="reader-header">
      <button class="back-btn" @click="goBack">
        <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor">
          <path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/>
        </svg>
      </button>
      <div class="header-info">
        <div class="header-title">{{ article?.title || t('reading.title') }}</div>
        <div v-if="bilingualMode && titleTranslation" class="header-title-translation">
          {{ titleTranslation }}
        </div>
        <div class="header-meta" v-if="article">
          {{ formatDate(article) }} · {{ article.cefr_level }}
        </div>
      </div>
    </header>

    <div v-if="loading && !article" class="loading-center">
      <div class="spinner" />
      <p>{{ t('common.loading') }}</p>
    </div>

    <div v-else-if="loadError && !article" class="rewrite-prompt">
      <p class="error-text">{{ loadError }}</p>
      <button class="btn-rewrite" @click="loadArticle">{{ t('common.retry') }}</button>
    </div>

    <div v-else-if="article" class="article-body">
      <div v-if="!bilingualMode" class="article-text">
        <template v-for="(token, idx) in tokens" :key="idx">
          <span v-if="token.isWord" class="word" @click.stop="onWordTap(token)">{{ token.text }}</span>
          <span v-else>{{ token.text }}</span>
        </template>
      </div>

      <div v-else-if="translations.length > 0" class="article-text bilingual">
        <template v-for="(tokens, pidx) in paraTokens" :key="pidx">
          <p class="para-original">
            <template v-for="(token, idx) in tokens" :key="idx">
              <span v-if="token.isWord" class="word" @click.stop="onWordTap(token)">{{ token.text }}</span>
              <span v-else>{{ token.text }}</span>
            </template>
          </p>
          <p class="para-translation">{{ translations[pidx] || '...' }}</p>
        </template>
      </div>

      <div v-else-if="loadingTranslation" class="loading-center">
        <div class="spinner" />
        <p>{{ t('news.translating') }}</p>
      </div>

      <div v-else class="rewrite-prompt">
        <p class="error-text">{{ translationError || t('news.bilingualLoadFail') }}</p>
        <button class="btn-rewrite" @click="loadBilingual">{{ t('common.retry') }}</button>
      </div>
    </div>

    <Transition name="popup">
      <WordPopup
        v-if="selectedWord"
        :word="selectedWord.text"
        :context="selectedWord.context"
        :source-lang="targetLang"
        :native-lang="getLocale()"
        mode="word"
        @close="selectedWord = null"
        @known="onWordKnown"
        @unknown="onWordUnknown"
      />
    </Transition>

    <Transition name="popup">
      <div v-if="selectionText" class="sel-overlay" @click.self="clearSelection">
        <div class="sel-popup">
          <div class="sel-source">{{ selectionText }}</div>
          <div v-if="selectionLoading" class="sel-loading">{{ t('news.translating') }}</div>
          <div v-else-if="selectionResult" class="sel-result">{{ selectionResult }}</div>
          <div v-else-if="selectionError" class="sel-error">{{ selectionError }}</div>
          <button class="sel-close" @click="clearSelection">×</button>
        </div>
      </div>
    </Transition>

    <button
      v-if="showTranslateButton"
      class="translate-fab"
      :style="{ top: translateButtonY + 'px', left: translateButtonX + 'px' }"
      @click="onTranslateButtonClick"
    >{{ t('news.translate') }}</button>

    <div v-if="article" class="bottom-bar">
      <div class="bottom-actions">
        <button class="btn-mode" :class="{ active: bilingualMode }" @click="toggleBilingual">
          {{ bilingualMode ? t('news.bilingual') : t('news.original') }}
        </button>
        <button
          class="btn-read"
          :class="{ 'is-reading': reading }"
          :disabled="!canReadArticle"
          :title="reading ? t('news.stopReading') : t('news.readAloud')"
          :aria-label="reading ? t('news.stopReading') : t('news.readAloud')"
          @click="toggleReading"
        >
          <svg v-if="!reading" class="read-icon" viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true">
            <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1-3.29-2.5-4.03v8.05c1.5-.73 2.5-2.25 2.5-4.02z"/>
            <path d="M14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/>
          </svg>
          <svg v-else class="read-icon" viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true">
            <path d="M6 6h4v12H6V6zm8 0h4v12h-4V6z"/>
          </svg>
        </button>
        <button class="btn-test" :disabled="testLoading" @click="goTest">
          {{ t('reading.test') }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount, watch } from "vue";
import { useRouter } from "vue-router";
import { useI18n, getLocale } from "@/shared/i18n";
import { useTargetLangStore } from "@/stores/targetLang.js";
import {
  getReadingArticle,
  markReadingArticleRead,
  translateText,
  lookupWordIds,
  updateWordMastery,
  addDiscoveredWord,
} from "@/shared/api.js";
import WordPopup from "@/shared/components/WordPopup.vue";
import { loadLearningContext } from "@/shared/learningContext.js";
import { tokenizeArticleText } from "../news/articleText.js";
import { useSelectionTranslation } from "../news/selectionTranslation.js";

const { t } = useI18n();
const router = useRouter();
const targetLangStore = useTargetLangStore();
const props = defineProps({ id: [String, Number] });

const article = ref(null);
const loadError = ref("");
const loading = ref(true);
const bilingualMode = ref(false);
const translations = ref([]);
const paraTokens = ref([]);
const titleTranslation = ref("");
const loadingTranslation = ref(false);
const translationError = ref("");
const tokens = ref([]);
const selectedWord = ref(null);
const testLoading = ref(false);

// Read aloud state
const reading = ref(false);
const nativeTtsAvailable = ref(false);
let speechUtterance = null;
const canReadArticle = computed(() => {
  if (!getReadableArticleText()) return false;
  return nativeTtsAvailable.value || (typeof window !== "undefined" && "speechSynthesis" in window);
});
const speechLangMap = {
  es: "es-ES",
  en: "en-US",
  zh: "zh-CN",
};

let targetLang = "es";
let userId = "";

const {
  selectionText,
  selectionResult,
  selectionLoading,
  selectionError,
  showTranslateButton,
  translateButtonX,
  translateButtonY,
  onSelectionChange,
  onPointerUp,
  handleNativeTranslate,
  onTranslateButtonClick,
  clearSelection,
  cleanup: cleanupSelectionTranslation,
} = useSelectionTranslation({
  translateText,
  getTargetLang: () => targetLang,
  getNativeLang: () => getLocale(),
  t,
});

onMounted(async () => {
  document.addEventListener("selectionchange", onSelectionChange);
  document.addEventListener("pointerup", onPointerUp);
  window.__amigaTranslateSelection = handleNativeTranslate;
  window.__amigaTtsDone = () => {
    reading.value = false;
    speechUtterance = null;
  };
  nativeTtsAvailable.value = !!(window.__amigaTts && typeof window.__amigaTts.speak === "function");
  await loadArticle();
});

onBeforeUnmount(() => {
  document.removeEventListener("selectionchange", onSelectionChange);
  document.removeEventListener("pointerup", onPointerUp);
  delete window.__amigaTranslateSelection;
  delete window.__amigaTtsDone;
  cleanupSelectionTranslation();
  stopReading();
});

watch(() => article.value?.body, (val) => {
  if (val) tokens.value = tokenizeArticleText(val);
});

async function loadArticle() {
  loading.value = true;
  loadError.value = "";
  try {
    const ctx = await loadLearningContext({ targetLangStore });
    userId = ctx.user?.id || "";
    targetLang = ctx.targetLang;
    const art = await getReadingArticle(Number(props.id));
    article.value = art;
    tokens.value = tokenizeArticleText(art?.body || "");
    await markReadingArticleRead(Number(props.id));
  } catch (e) {
    console.error("Failed to load article:", e);
    loadError.value = e?.message || String(e);
  } finally {
    loading.value = false;
  }
}

async function toggleBilingual() {
  bilingualMode.value = !bilingualMode.value;
  if (bilingualMode.value && translations.value.length === 0) {
    await loadBilingual();
  }
}

async function loadBilingual() {
  if (!article.value) return;
  loadingTranslation.value = true;
  translationError.value = "";
  try {
    const body = article.value?.body || "";
    const paragraphs = body.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
    paraTokens.value = paragraphs.map((p) => tokenizeArticleText(p));
    translations.value = await Promise.all(
      paragraphs.map((paragraph) => translateText(paragraph, targetLang, getLocale())),
    );
    const title = article.value?.title || "";
    if (title) {
      try {
        titleTranslation.value = await translateText(title, targetLang, getLocale());
      } catch (_) {
        titleTranslation.value = "";
      }
    }
  } catch (e) {
    console.error("Failed to load bilingual:", e);
    translationError.value = typeof e === "string" ? e : (e?.message || t("news.bilingualLoadFail"));
  } finally {
    loadingTranslation.value = false;
  }
}

function formatDate(articleItem) {
  const slot = articleItem.slot === "AM" ? t("reading.slotAm") : t("reading.slotPm");
  return `${articleItem.local_date} ${slot}`;
}

function onWordTap(token) {
  if (!token.isWord) return;
  const sel = window.getSelection();
  if (sel && sel.toString().trim().length > 0) return;
  selectedWord.value = token;
}

async function onWordKnown() {
  if (!selectedWord.value || !userId) {
    selectedWord.value = null;
    return;
  }
  try {
    const ids = await lookupWordIds([selectedWord.value.text], targetLang);
    if (ids.length > 0) {
      await updateWordMastery(userId, ids[0], 2, "reading");
    } else {
      const newId = await addDiscoveredWord(userId, selectedWord.value.text, targetLang, selectedWord.value.context);
      await updateWordMastery(userId, newId, 2, "reading");
    }
  } catch (_) {}
  selectedWord.value = null;
}

async function onWordUnknown() {
  if (!selectedWord.value || !userId) {
    selectedWord.value = null;
    return;
  }
  try {
    const ids = await lookupWordIds([selectedWord.value.text], targetLang);
    if (ids.length > 0) {
      await updateWordMastery(userId, ids[0], 1, "reading");
    } else {
      await addDiscoveredWord(userId, selectedWord.value.text, targetLang, selectedWord.value.context);
    }
  } catch (_) {}
  selectedWord.value = null;
}

function goBack() {
  router.push("/learn/reading");
}

function goTest() {
  if (testLoading.value) return;
  testLoading.value = true;
  router.push(`/learn/reading/${props.id}/test`).finally(() => {
    testLoading.value = false;
  });
}

function getReadableArticleText() {
  if (!article.value) return "";
  const title = article.value.title || "";
  const body = article.value.body || "";
  return `${title}\n\n${body}`.trim();
}

function toggleReading() {
  if (reading.value) {
    stopReading();
    return;
  }
  startReading();
}

function startReading() {
  if (!canReadArticle.value) return;
  stopReading();
  const text = getReadableArticleText();
  const speechLang = getSpeechLang(targetLang);
  if (window.__amigaTts && typeof window.__amigaTts.speak === "function") {
    const result = window.__amigaTts.speak(text, speechLang);
    if (result === "ok" || result === "initializing") {
      reading.value = true;
    }
    return;
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
  window.speechSynthesis.speak(utterance);
}

function getSpeechLang(lang) {
  return speechLangMap[lang] || lang || "en-US";
}

function pickSpeechVoice(lang) {
  if (typeof window === "undefined" || !window.speechSynthesis) return null;
  const voices = window.speechSynthesis.getVoices();
  const langLower = lang.toLowerCase();
  const family = langLower.split("-")[0];
  return (
    voices.find((voice) => voice.lang.toLowerCase() === langLower) ||
    voices.find((voice) => voice.lang.toLowerCase().startsWith(`${family}-`)) ||
    voices.find((voice) => voice.lang.toLowerCase() === family) ||
    null
  );
}

function stopReading() {
  if (typeof window !== "undefined" && window.__amigaTts && typeof window.__amigaTts.stop === "function") {
    window.__amigaTts.stop();
  }
  if (typeof window !== "undefined" && window.speechSynthesis) {
    window.speechSynthesis.cancel();
  }
  reading.value = false;
  speechUtterance = null;
}
</script>

<style scoped>
.reading-reader {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--surface);
  position: relative;
}

.reader-header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 8px 12px 4px;
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
}

.back-btn {
  width: 44px;
  height: 44px;
  border: none;
  background: none;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  cursor: pointer;
  color: var(--text);
  transition: background var(--transition);
  flex-shrink: 0;
}

.back-btn:hover {
  background: var(--surface-variant);
}

.header-info {
  flex: 1;
  min-width: 0;
}

.header-title {
  font-size: 14px;
  font-weight: 700;
  line-height: 1.3;
  color: var(--text);
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
  overflow-wrap: break-word;
}

.header-title-translation {
  font-size: 12px;
  font-weight: 400;
  color: var(--text-lighter);
  line-height: 1.3;
  margin-top: 2px;
  display: -webkit-box;
  -webkit-line-clamp: 1;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.header-meta {
  font-size: 12px;
  color: var(--text-lighter);
  margin-top: 2px;
}

.loading-center,
.rewrite-prompt {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 48px 16px;
  gap: 12px;
  color: var(--text-lighter);
}

.error-text {
  color: var(--red);
  font-size: 14px;
  max-width: 300px;
  word-break: break-word;
  text-align: center;
}

.spinner {
  width: 24px;
  height: 24px;
  border: 3px solid var(--border);
  border-top-color: var(--green);
  border-radius: 50%;
  animation: spin 0.6s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.article-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  overscroll-behavior: contain;
  padding: 20px 20px 80px;
}

.article-text {
  font-size: 17px;
  line-height: 2;
  color: var(--text);
  white-space: pre-wrap;
  overflow-wrap: break-word;
  word-wrap: break-word;
  -webkit-user-select: text;
  -webkit-touch-callout: default;
  user-select: text;
  -webkit-tap-highlight-color: transparent;
  touch-action: auto;
}

.article-text.bilingual {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.para-original {
  margin: 0;
  white-space: pre-wrap;
  overflow-wrap: break-word;
}

.para-translation {
  color: var(--text-lighter);
  font-size: 14px;
  line-height: 1.7;
  margin: 0 0 20px;
  padding-left: 12px;
  border-left: 2px solid var(--border);
  white-space: pre-wrap;
  overflow-wrap: break-word;
}

.word {
  cursor: pointer;
  padding: 0 1px;
  border-radius: 3px;
  transition: background 0.1s;
  white-space: normal;
  -webkit-user-select: text;
  user-select: text;
}

.word:hover {
  background: var(--blue-bg);
}

.bottom-bar {
  flex-shrink: 0;
  display: flex;
  justify-content: center;
  padding: 12px 16px;
  background: var(--surface);
  border-top: 1px solid var(--border);
}

.bottom-actions {
  width: 100%;
  display: flex;
  gap: 10px;
  align-items: center;
}

.btn-mode,
.btn-test,
.btn-read,
.btn-rewrite {
  border-radius: var(--radius-md);
  font-family: inherit;
  font-weight: 700;
  cursor: pointer;
}

.btn-mode {
  flex: 1;
  padding: 10px 16px;
  border: 1.5px solid var(--blue);
  background: var(--blue-bg);
  color: var(--blue);
  font-size: 16px;
  box-shadow: 0 0 0 2px rgba(28, 176, 246, 0.15);
}

.btn-mode.active {
  background: var(--blue-bg);
  border-color: var(--blue);
  color: var(--blue);
}

.btn-test {
  flex: 1;
  padding: 12px 16px;
  border: none;
  background: var(--green);
  color: var(--white);
  font-size: 15px;
  transition: opacity var(--transition);
}

.btn-test:disabled {
  opacity: 0.5;
  cursor: wait;
}

.btn-test:hover:not(:disabled) {
  opacity: 0.9;
}

.btn-read {
  flex: 0 0 52px;
  width: 52px;
  padding: 10px 0;
  border: 1.5px solid var(--purple, #7c3aed);
  background: rgba(124, 58, 237, 0.08);
  color: var(--purple, #7c3aed);
  font-size: 16px;
  box-shadow: 0 0 0 2px rgba(124, 58, 237, 0.12);
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.btn-read:hover:not(:disabled),
.btn-read.is-reading {
  background: rgba(124, 58, 237, 0.15);
}

.btn-read:disabled {
  opacity: 0.5;
  cursor: default;
}

.read-icon {
  flex-shrink: 0;
}

.btn-rewrite {
  padding: 10px 20px;
  border: none;
  background: var(--green);
  color: var(--white);
  font-size: 14px;
}

.sel-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.25);
  display: flex;
  align-items: flex-end;
  justify-content: center;
  z-index: 500;
  padding: 20px;
  padding-bottom: calc(20px + 80px);
}

.translate-fab {
  position: fixed;
  z-index: 600;
  background: var(--purple, #7c3aed);
  color: #fff;
  font-size: 14px;
  font-weight: 700;
  font-family: inherit;
  border: none;
  border-radius: 18px;
  padding: 6px 14px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.18);
  cursor: pointer;
  user-select: none;
  -webkit-user-select: none;
}

.translate-fab:active {
  transform: scale(0.96);
}

.sel-popup {
  background: var(--surface);
  border-radius: var(--radius-lg) var(--radius-lg) var(--radius-sm) var(--radius-sm);
  padding: 20px 24px;
  width: 100%;
  max-width: 360px;
  box-shadow: var(--shadow-lg);
  position: relative;
}

.sel-source {
  font-size: 15px;
  color: var(--text-light);
  margin-bottom: 8px;
  line-height: 1.4;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
  word-break: break-word;
}

.sel-loading {
  font-size: 14px;
  color: var(--text-lighter);
  font-style: italic;
  padding: 4px 0;
}

.sel-result {
  font-size: 17px;
  font-weight: 700;
  color: var(--purple);
  line-height: 1.5;
  padding: 4px 0;
}

.sel-error {
  font-size: 13px;
  color: var(--red);
}

.sel-close {
  position: absolute;
  top: 12px;
  right: 12px;
  width: 28px;
  height: 28px;
  border: none;
  background: var(--surface-variant);
  border-radius: 50%;
  cursor: pointer;
  font-size: 18px;
  line-height: 1;
  color: var(--text-light);
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: inherit;
  transition: background var(--transition);
}

.sel-close:hover {
  background: var(--border);
}

.popup-enter-active,
.popup-leave-active {
  transition: all 0.2s cubic-bezier(0.2, 0, 0, 1);
}

.popup-enter-from,
.popup-leave-to {
  opacity: 0;
  transform: translateY(8px);
}
</style>
