<template>
  <div class="news-reader">
    <!-- Header -->
    <header class="reader-header">
      <button class="back-btn" @click="goBack">
        <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor">
          <path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/>
        </svg>
      </button>
      <div class="header-info">
        <div class="header-title">{{ article?.original_title }}</div>
        <div class="header-title-translation" v-if="bilingualMode && titleTranslation">{{ titleTranslation }}</div>
        <a
          v-if="article?.source"
          class="header-source"
          :href="article.source"
          target="_blank"
          rel="noopener noreferrer"
          :title="article.source"
          @click.stop.prevent="openSourceUrl(article.source)"
        >{{ formatSource(article.source) }}</a>
      </div>
    </header>

    <!-- Loading / Rewrite prompt -->
    <div v-if="!article" class="loading-center">{{ t('news.loading') }}</div>
    <div v-else-if="!article.rewritten_body && !rewriting && !rewriteError" class="rewrite-prompt">
      <p>{{ t('news.rewritePrompt') }}</p>
      <button class="btn-rewrite" @click="doRewrite">{{ t('news.rewriteBtn') }}</button>
    </div>
    <div v-else-if="rewriting" class="loading-center">
      <div class="spinner" />
      <p>{{ t('news.rewriting') }}</p>
    </div>
    <div v-else-if="rewriteError" class="rewrite-prompt">
      <p class="error-text">{{ rewriteError }}</p>
      <button class="btn-rewrite" @click="doRewrite">{{ t('common.retry') }}</button>
    </div>

    <!-- Article body -->
    <div v-else class="article-body">
      <!-- Original mode -->
      <div v-if="!bilingualMode" class="article-text">
        <template v-for="(token, idx) in tokens" :key="idx">
          <span v-if="token.isWord" class="word" @click.stop="onWordTap(token)">
            {{ token.text }}
          </span>
          <span v-else>{{ token.text }}</span>
        </template>
      </div>

      <!-- Bilingual mode -->
      <div v-else-if="translations.length > 0" class="article-text bilingual">
        <template v-for="(tokens, pidx) in paraTokens" :key="pidx">
          <p class="para-original">
            <template v-for="(token, idx) in tokens" :key="idx">
              <span v-if="token.isWord" class="word" @click.stop="onWordTap(token)">{{ token.text }}</span>
              <span v-else>{{ token.text }}</span>
            </template>
          </p>
          <p class="para-translation">{{ translations[pidx] || "..." }}</p>
        </template>
      </div>
      <div v-else-if="loadingTranslation" class="loading-center">
        <div class="spinner" />
        <p>{{ t('news.translating') }}</p>
      </div>
      <div v-else class="loading-center">
        <p class="error-text">{{ translationError || t('news.bilingualLoadFail') }}</p>
        <button class="btn-rewrite" @click="loadBilingual">{{ t('common.retry') }}</button>
      </div>
    </div>

    <!-- Word popup -->
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

    <!-- Selection translate popup -->
    <Transition name="popup">
      <div v-if="selectionText" class="sel-overlay" @click.self="clearSelection">
        <div class="sel-popup">
          <div class="sel-source">{{ selectionText }}</div>
          <div v-if="selectionLoading" class="sel-loading">{{ t('news.translating') }}</div>
          <div v-else-if="selectionResult" class="sel-result">{{ selectionResult }}</div>
          <div v-else-if="selectionError" class="sel-error">{{ selectionError }}</div>
          <button class="sel-close" @click="clearSelection">x</button>
        </div>
      </div>
    </Transition>

    <!-- Fixed bottom bar -->
    <div v-if="article?.rewritten_body" class="bottom-bar">
      <div class="mode-bar">
        <button
          class="mode-btn mode-toggle"
          :class="{ 'is-bilingual': bilingualMode }"
          :title="bilingualMode ? t('news.original') : t('news.bilingual')"
          @click="toggleBilingual"
        >
          <span class="mode-toggle-label">{{ bilingualMode ? t('news.bilingual') : t('news.original') }}</span>
          <svg class="mode-toggle-icon" viewBox="0 0 24 24" width="14" height="14" fill="currentColor" aria-hidden="true">
            <path d="M7 10l5 5 5-5z"/>
          </svg>
        </button>
        <button
          class="mode-btn icon-btn read-btn"
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
        <button
          class="mode-btn icon-btn share-btn"
          :disabled="sharing"
          :title="t('news.shareTitle')"
          :aria-label="t('news.share')"
          @click="onShare"
        >
          <svg class="share-icon" viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true">
            <path d="M18 16.08c-.76 0-1.44.3-1.96.77L8.91 12.7c.05-.23.09-.46.09-.7s-.04-.47-.09-.7l7.05-4.11c.54.5 1.25.81 2.04.81 1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3c0 .24.04.47.09.7L8.04 9.81C7.5 9.31 6.79 9 6 9c-1.66 0-3 1.34-3 3s1.34 3 3 3c.79 0 1.5-.31 2.04-.81l7.12 4.16c-.05.21-.08.43-.08.65 0 1.61 1.31 2.92 2.92 2.92s2.92-1.31 2.92-2.92-1.31-2.92-2.92-2.92z"/>
          </svg>
        </button>
      </div>
    </div>

    <!-- Share / read-aloud status toast -->
    <Transition name="popup">
      <div v-if="shareStatus || readStatus" class="share-toast">{{ shareStatus || readStatus }}</div>
    </Transition>
  </div>
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount, watch } from "vue";
import { useRouter } from "vue-router";
import { getArticle, saveReadingLog } from "@/shared/backend/news.js";
import { getBilingual, rewriteArticle, translateText } from "@/shared/backend/llm.js";
import { shareText as nativeShareText } from "@/shared/backend/share.js";
import WordPopup from "@/shared/components/WordPopup.vue";
import { useI18n, getLocale } from "@/shared/i18n";
import { useTargetLangStore, TARGET_LANG_CHANGED } from "@/stores/targetLang.js";
import { eventBus } from "@/shared/eventBus.js";
import { openSourceUrl } from "./utils.js";
import { displayLang } from "@/shared/constants.js";
import { loadLearningContext } from "@/shared/learningContext.js";
import { tokenizeArticleText } from "./articleText.js";
import { shareArticle } from "./share.js";
import { useSelectionTranslation } from "./selectionTranslation.js";
import { useReadAloud } from "@/shared/readAloud.js";
import { useNewsArticleWords } from "./useNewsArticleWords.js";

const { t } = useI18n();
const props = defineProps({ id: [String, Number] });
const router = useRouter();
const targetLangStore = useTargetLangStore();

const article = ref(null);
const rewriting = ref(false);
const rewriteError = ref("");
const startTime = ref(Date.now());
let targetLang = "es";
let userId = "";
let currentLevel = "A1";
let unsubscribe = null;

// Bilingual mode state
const bilingualMode = ref(false);
const translations = ref([]);
const paragraphs = ref([]);
const paraTokens = ref([]);
const titleTranslation = ref("");
const loadingTranslation = ref(false);
const translationError = ref("");

// Share state
const sharing = ref(false);
const shareStatus = ref("");
let shareStatusTimer = null;

const {
  selectedWord,
  knownWordIds,
  wordsKnownSet,
  wordsUnknownSet,
  processArticleWords,
  ensureArticleWordsSeenIfNeeded,
  onWordTap,
  onWordKnown,
  onWordUnknown,
} = useNewsArticleWords({
  getUserId: () => userId,
  getTargetLang: () => targetLang,
  getArticle: () => article.value,
});

function getReadableArticleText() {
  if (!article.value) return "";
  const title = article.value.original_title || "";
  const body = article.value.rewritten_body || article.value.original_body || "";
  return `${title}\n\n${body}`.trim();
}

const {
  reading,
  readStatus,
  canRead: canReadArticle,
  toggleReading,
  stopReading,
} = useReadAloud({
  getText: getReadableArticleText,
  getTargetLang: () => targetLang,
  t,
});

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
  startTime.value = Date.now();
  document.addEventListener("selectionchange", onSelectionChange);
  document.addEventListener("pointerup", onPointerUp);
  // Android: the system text-selection toolbar calls this global function
  // when the user taps the "缈昏瘧" menu item (see MainActivity.kt).
  window.__amigaTranslateSelection = handleNativeTranslate;
  try {
    const ctx = await loadLearningContext({ targetLangStore });
    userId = ctx.user.id;
    targetLang = ctx.targetLang;
    currentLevel = ctx.cefr;
    const art = await getArticle(Number(props.id));
    article.value = art;
    if (!art.rewritten_body) {
      await doRewrite();
    } else {
      processArticleWords();
    }
  } catch (e) {
    console.error("Failed to load article:", e);
  }
  // The reader is bound to a single article; if the user switches target
  // language elsewhere, jump back to the list so NewsList can refetch
  // articles in the new language.
  unsubscribe = eventBus.on(TARGET_LANG_CHANGED, () => {
    if (router.currentRoute.value.path.startsWith("/news/")) {
      router.replace("/news");
    }
  });
});

onBeforeUnmount(async () => {
  if (unsubscribe) unsubscribe();
  document.removeEventListener("selectionchange", onSelectionChange);
  document.removeEventListener("pointerup", onPointerUp);
  delete window.__amigaTranslateSelection;
  cleanupSelectionTranslation();
  if (shareStatusTimer) {
    clearTimeout(shareStatusTimer);
    shareStatusTimer = null;
  }
  stopReading();
  if (userId && article.value) {
    const elapsed = Math.round((Date.now() - startTime.value) / 1000);
    try {
      await saveReadingLog({
        user_id: userId,
        article_id: Number(props.id),
        words_looked_up: JSON.stringify(Array.from(knownWordIds.value)),
        words_known: JSON.stringify(Array.from(wordsKnownSet.value)),
        words_unknown: JSON.stringify(Array.from(wordsUnknownSet.value)),
        reading_time_sec: elapsed,
        completed: true,
      });
    } catch (e) {
      console.error("Failed to save reading log:", e);
    }

    await ensureArticleWordsSeenIfNeeded();
  }
});

async function doRewrite() {
  rewriting.value = true;
  rewriteError.value = "";
  try {
    const result = await rewriteArticle(Number(props.id), currentLevel, userId, targetLang);
    article.value = result;
    processArticleWords();
  } catch (e) {
    console.error("Failed to rewrite article:", e);
    rewriteError.value = typeof e === "string" ? e : (e?.message || t("news.rewriteFail"));
  } finally {
    rewriting.value = false;
  }
}

async function toggleBilingual() {
  bilingualMode.value = !bilingualMode.value;
  if (bilingualMode.value && translations.value.length === 0) {
    await loadBilingual();
  }
}

async function loadBilingual() {
  loadingTranslation.value = true;
  translationError.value = "";
  try {
    // Split body into paragraphs
    const body = article.value?.rewritten_body || article.value?.original_body || "";
    paragraphs.value = body.split("\n\n").map(p => p.trim()).filter(p => p);
    paraTokens.value = paragraphs.value.map(p => tokenizeArticleText(p));
    const result = await getBilingual(Number(props.id), targetLang, getLocale());
    translations.value = result;
    // Translate title
    const title = article.value?.original_title || "";
    if (title) {
      try {
        titleTranslation.value = await translateText(title, targetLang, getLocale());
      } catch (titleErr) {
        titleTranslation.value = "";
        console.debug("Failed to translate news title", titleErr);
      }
    }
  } catch (e) {
    console.error("Failed to load bilingual:", e);
    translationError.value = typeof e === "string" ? e : (e?.message || t("news.bilingualLoadFail"));
  } finally {
    loadingTranslation.value = false;
  }
}

// Tokenize article body
const tokens = ref([]);
function parseText(text) {
  tokens.value = tokenizeArticleText(text);
}

watch(() => article.value?.rewritten_body, (val) => {
  if (val) parseText(val);
});

watch(() => article.value?.original_body, (val) => {
  if (val && !article.value?.rewritten_body) parseText(val);
});

function showShareStatus(msg) {
  shareStatus.value = msg;
  if (shareStatusTimer) clearTimeout(shareStatusTimer);
  shareStatusTimer = setTimeout(() => { shareStatus.value = ""; }, 2500);
}

async function onShare() {
  if (!article.value || sharing.value) return;
  sharing.value = true;
  try {
    const locale = getLocale();
    await shareArticle({
      article: article.value,
      targetLabel: displayLang(targetLang, locale),
      t,
      nativeShareText,
      showShareStatus,
    });
  } finally {
    sharing.value = false;
  }
}

function goBack() {
  const parent = router.currentRoute.value?.meta?.parent;
  if (parent) {
    router.replace({ name: parent });
  } else {
    router.replace("/news");
  }
}

function formatSource(source) {
  if (!source || source === "sample") return t("news.sample");
  try {
    const url = new URL(source);
    return url.hostname;
  } catch {
    return source?.slice(0, 30) || "";
  }
}
</script>

<style scoped>
.news-reader {
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
  cursor: pointer;
  color: var(--text);
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
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
 display: -webkit-box;
 -webkit-line-clamp: 5;
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
 -webkit-line-clamp: 2;
 -webkit-box-orient: vertical;
 overflow: hidden;
 }

.header-source {
  display: inline-block;
  font-size: 11px;
  color: var(--text-lighter);
  margin-top: 2px;
  text-decoration: underline;
  text-decoration-style: dotted;
  text-underline-offset: 2px;
  cursor: pointer;
}

.header-source:hover {
  color: var(--green);
}

.loading-center {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 16px;
  color: var(--text-light);
}

.spinner {
  width: 32px;
  height: 32px;
  border: 3px solid var(--border);
  border-top-color: var(--green);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.rewrite-prompt {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 16px;
  padding: 40px;
  text-align: center;
  color: var(--text-light);
}

.error-text {
  color: var(--red);
  font-size: 14px;
  max-width: 300px;
  word-break: break-word;
}

.btn-rewrite {
  padding: 12px 32px;
  border-radius: var(--radius-md);
  background: var(--green);
  color: #fff;
  border: none;
  font-size: 15px;
  font-weight: 700;
  cursor: pointer;
  font-family: inherit;
  transition: all var(--transition);
}

.btn-rewrite:hover {
  background: var(--green-hover);
}

/* Article text */
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
  line-height: 2.0;
  color: var(--text);
  overflow-wrap: break-word;
  word-wrap: break-word;
  -webkit-user-select: text;
  -webkit-touch-callout: default;
  user-select: text;
  -webkit-tap-highlight-color: transparent;
  touch-action: auto;
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

/* Fixed bottom bar */
.bottom-bar {
  flex-shrink: 0;
  border-top: 1px solid var(--border);
  background: var(--surface);
  padding: 12px 16px;
  padding-bottom: 12px;
}

/* Mode bar */
.mode-bar {
  display: flex;
  gap: 10px;
  margin-bottom: 0;
}

.mode-btn {
  flex: 1;
  padding: 10px 0;
  border: 1.5px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--surface);
  color: var(--text-light);
  font-size: 16px;
  font-weight: 700;
  cursor: pointer;
  transition: all var(--transition);
  font-family: inherit;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
}

.mode-toggle {
  /* The single "鍘熸枃/鍙岃" toggle. Show the current mode and a
     chevron hint to suggest it can be switched. */
  color: var(--blue);
  border-color: var(--blue);
  background: var(--blue-bg);
  box-shadow: 0 0 0 2px rgba(28, 176, 246, 0.15);
}

.mode-toggle-icon {
  opacity: 0.7;
  margin-top: 1px;
}

.icon-btn {
  flex: 0 0 52px;
  width: 52px;
  padding: 10px 0;
}

.read-btn {
  color: var(--purple, #7c3aed);
  border-color: var(--purple, #7c3aed);
  background: rgba(124, 58, 237, 0.08);
  box-shadow: 0 0 0 2px rgba(124, 58, 237, 0.12);
}

.read-btn:hover:not(:disabled),
.read-btn.is-reading {
  background: rgba(124, 58, 237, 0.15);
}

.read-btn:disabled {
  opacity: 0.5;
  cursor: default;
}

.share-btn {
  color: var(--green, #58cc02);
  border-color: var(--green, #58cc02);
  background: var(--green-bg, rgba(88, 204, 2, 0.08));
  box-shadow: 0 0 0 2px rgba(88, 204, 2, 0.12);
}

.share-btn:hover:not(:disabled) {
  background: var(--green-bg, rgba(88, 204, 2, 0.15));
}

.share-btn:disabled {
  opacity: 0.6;
  cursor: default;
}

.share-icon {
  flex-shrink: 0;
}

.share-toast {
  position: fixed;
  left: 50%;
  bottom: calc(80px + var(--safe-bottom, env(safe-area-inset-bottom, 0px)));
  transform: translateX(-50%);
  background: var(--text);
  color: #fff;
  padding: 10px 20px;
  border-radius: var(--radius-md);
  font-size: 13px;
  font-weight: 600;
  z-index: 400;
  max-width: calc(100% - 40px);
  text-align: center;
  box-shadow: var(--shadow-lg);
  line-height: 1.4;
}

/* Bilingual paragraphs */
.bilingual .para-original {
  margin-bottom: 4px;
  overflow-wrap: break-word;
}

.bilingual .para-translation {
  color: var(--text-lighter);
  font-size: 14px;
  line-height: 1.7;
  margin-bottom: 20px;
  padding-left: 12px;
  border-left: 2px solid var(--border);
  overflow-wrap: break-word;
}

/* Selection translate popup */
.sel-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.25);
  display: flex;
  align-items: flex-end;
  justify-content: center;
  z-index: 500;
  padding: 20px;
  padding-bottom: calc(20px + 80px);
}

/* Floating "缈昏瘧" button that appears over the user's text
   selection. Pure-JS fallback for Android (system selection
   toolbar doesn't have a translate item). */
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
  animation: slideUp 0.2s cubic-bezier(0.2, 0, 0, 1);
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
  word-break: break-all;
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
  font-size: 13px;
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

/* Popup transition */
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
