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
        <div class="header-source" v-if="article?.source">{{ formatSource(article.source) }}</div>
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
          <p class="para-translation">{{ translations[pidx] || '…' }}</p>
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
        :native-lang="nativeLang"
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
          <button class="sel-close" @click="clearSelection">✕</button>
        </div>
      </div>
    </Transition>

    <!--
      Custom Android "translate" affordance. The Chromium WebView on
      API 34+ removed setCustomSelectionActionModeCallback, so we
      cannot inject a "翻译" item into the system selection toolbar
      (see MainActivity.kt onActionModeStarted hook — it does fire
      for some action modes, but the selection action mode the
      WebView creates is TYPE_FLOATING and the system bypasses the
      activity hook for it on this build). The fallback below is
      pure JS: when the user has a multi-word selection in the
      article body, show a small floating button near the
      selection. Tapping it triggers translation.
    -->
    <button
      v-if="showTranslateButton"
      class="translate-fab"
      :style="{ top: translateButtonY + 'px', left: translateButtonX + 'px' }"
      @click="onTranslateButtonClick"
    >{{ t('news.translate') }}</button>

    <!-- Fixed bottom bar -->
    <div v-if="article?.rewritten_body" class="bottom-bar">
      <div class="mode-bar">
        <button
          class="mode-btn"
          :class="{ active: !bilingualMode }"
          @click="bilingualMode = false"
        >{{ t('news.original') }}</button>
        <button
          class="mode-btn"
          :class="{ active: bilingualMode }"
          @click="toggleBilingual"
        >{{ t('news.bilingual') }}</button>
      </div>

    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount, watch } from "vue";
import { useRouter } from "vue-router";
import { getArticle, rewriteArticle, translateWord, saveReadingLog, updateWordMastery, getCurrentUser, getBilingual, translateText, lookupWordIds, markWordsSeen, getLearningGoals } from "@/shared/api.js";
import WordPopup from "./components/WordPopup.vue";
import { useI18n } from "@/shared/i18n";
import { useTargetLangStore, TARGET_LANG_CHANGED } from "@/stores/targetLang.js";
import { eventBus } from "@/shared/eventBus.js";

const { t } = useI18n();
const props = defineProps({ id: [String, Number] });
const router = useRouter();
const targetLangStore = useTargetLangStore();

const article = ref(null);
const rewriting = ref(false);
const rewriteError = ref("");
const selectedWord = ref(null);
const knownWordIds = ref(new Set());
const startTime = ref(Date.now());
let targetLang = "es";
let userId = "";
let nativeLang = "zh";
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

onMounted(async () => {
  startTime.value = Date.now();
  document.addEventListener("selectionchange", onSelectionChange);
  document.addEventListener("pointerup", onPointerUp);
  // Android: the system text-selection toolbar calls this global function
  // when the user taps the "翻译" menu item (see MainActivity.kt).
  window.__amigaTranslateSelection = handleNativeTranslate;
  try {
    const user = await getCurrentUser();
    userId = user.id;
    nativeLang = user.native_language || "zh";
    targetLang = (await targetLangStore.load()) || "es";
    // Pick the CEFR level matching the user's current target language,
    // so the rewrite is calibrated to what they're actually studying.
    try {
      const goals = await getLearningGoals(userId);
      const g = goals.find((x) => x.target_language === targetLang);
      if (g?.cefr_level) currentLevel = g.cefr_level;
    } catch (_) { /* fall back to A1 */ }
    const art = await getArticle(Number(props.id));
    article.value = art;
    if (!art.rewritten_body) {
      await doRewrite();
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
  if (selectionTimer) {
    clearTimeout(selectionTimer);
    selectionTimer = null;
  }
  if (userId && article.value) {
    const elapsed = Math.round((Date.now() - startTime.value) / 1000);
    try {
      await saveReadingLog({
        user_id: userId,
        article_id: Number(props.id),
        words_looked_up: JSON.stringify(Array.from(knownWordIds.value)),
        words_known: JSON.stringify([]),
        words_unknown: JSON.stringify([]),
        reading_time_sec: elapsed,
        completed: true,
      });
    } catch (e) {
      console.error("Failed to save reading log:", e);
    }

    // Mark article words as "seen" in vocab_bank
    try {
      const body = article.value?.rewritten_body || article.value?.original_body || "";
      const title = article.value?.original_title || "";
      const allText = `${title} ${body}`;
      const wordTokens = extractWordTexts(allText);
      if (wordTokens.length > 0) {
        const ids = await lookupWordIds(wordTokens, targetLang);
        if (ids.length > 0) {
          await markWordsSeen(userId, ids);
        }
      }
    } catch (e) {
      console.error("Failed to mark words as seen:", e);
    }
  }
});

function extractWordTexts(text) {
  if (!text) return [];
  const matches = text.match(/\b\p{L}{2,}\b/gu);
  if (!matches) return [];
  return [...new Set(matches.map(w => w.toLowerCase()))];
}

async function doRewrite() {
  rewriting.value = true;
  rewriteError.value = "";
  try {
    const result = await rewriteArticle(Number(props.id), currentLevel, userId, targetLang);
    article.value = result;
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
    paraTokens.value = paragraphs.value.map(p => tokenize(p));
    const result = await getBilingual(Number(props.id), targetLang, nativeLang);
    translations.value = result;
    // Translate title
    const title = article.value?.original_title || "";
    if (title) {
      try {
        titleTranslation.value = await translateText(title, targetLang, nativeLang);
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

// Tokenize article body
const tokens = ref([]);
function tokenize(text) {
  if (!text) return [];
  const parts = text.split(/(\s+)/);
  const result = [];

  for (const part of parts) {
    if (part.trim() === "" && part.length > 0) {
      result.push({ text: part, isWord: false, isNewWord: false, context: "" });
      continue;
    }

    const boldRegex = /\*\*(.+?)\*\*/g;
    let match;
    let lastIdx = 0;
    const tempStr = part;

    while ((match = boldRegex.exec(tempStr)) !== null) {
      if (match.index > lastIdx) {
        const prefix = tempStr.slice(lastIdx, match.index);
        for (const w of prefix.split(/(?<=\P{L})(?=\p{L})|(?<=\p{L})(?=\P{L})/u)) {
          if (w.trim()) {
            result.push({ text: w, isWord: /^\p{L}/u.test(w), isNewWord: false, context: getContext(text, w) });
          } else {
            result.push({ text: w, isWord: false, isNewWord: false, context: "" });
          }
        }
      }
      result.push({ text: match[1], isWord: true, isNewWord: false, context: getContext(text, match[1]) });
      lastIdx = match.index + match[0].length;
    }

    if (lastIdx < tempStr.length) {
      const suffix = tempStr.slice(lastIdx);
      for (const w of suffix.split(/(?<=\P{L})(?=\p{L})|(?<=\p{L})(?=\P{L})/u)) {
        if (w.trim()) {
          result.push({ text: w, isWord: /^\p{L}/u.test(w), isNewWord: false, context: getContext(text, w) });
        } else {
          result.push({ text: w, isWord: false, isNewWord: false, context: "" });
        }
      }
    }
  }
  return result;
}

function parseText(text) {
  tokens.value = tokenize(text);
}

function getContext(fullText, word) {
  const idx = fullText.indexOf(word);
  if (idx < 0) return word;
  const start = Math.max(0, idx - 30);
  const end = Math.min(fullText.length, idx + word.length + 30);
  return fullText.slice(start, end).trim();
}

watch(() => article.value?.rewritten_body, (val) => {
  if (val) parseText(val);
});

watch(() => article.value?.original_body, (val) => {
  if (val && !article.value?.rewritten_body) parseText(val);
});

function onWordTap(token) {
  if (!token.isWord) return;
  // If there's an active multi-character text selection, this click likely
  // resulted from the user finishing a drag-selection — don't open the word
  // popup; let the selectionchange handler process the selection instead.
  const sel = window.getSelection();
  if (sel && sel.toString().trim().length > 0) return;
  selectedWord.value = token;
  knownWordIds.value.add(token.text);
}

async function onWordKnown() {
  if (selectedWord.value) {
    knownWordIds.value.add(selectedWord.value.text);
    try {
      const ids = await lookupWordIds([selectedWord.value.text], targetLang);
      if (ids.length > 0) {
        await updateWordMastery(userId, ids[0], 2, "news_reading");
      }
    } catch (_) {}
  }
  selectedWord.value = null;
}

async function onWordUnknown() {
  if (selectedWord.value) {
    knownWordIds.value.add(selectedWord.value.text);
    try {
      const ids = await lookupWordIds([selectedWord.value.text], targetLang);
      if (ids.length > 0) {
        await updateWordMastery(userId, ids[0], 1, "news_reading");
      }
    } catch (_) {}
  }
  selectedWord.value = null;
}

// Selection translate state
const selectionText = ref("");
const selectionResult = ref("");
const selectionLoading = ref(false);
const selectionError = ref("");
let selectionTimer = null;
let isSelecting = false;

// Pure-JS translate affordance: a small floating button that
// appears over the article body when the user has selected text.
// Replaces the missing Android selection-toolbar "翻译" item
// (see template comment).
const showTranslateButton = ref(false);
const translateButtonX = ref(0);
const translateButtonY = ref(0);

// Core translation logic shared by pointerup (Windows) and native menu (Android).
function translateSelection(text) {
  if (!text || text.length === 0) return false;
  if (text.split(/\s+/).length <= 1) return false;

  selectionText.value = text;
  selectionLoading.value = true;
  selectionResult.value = "";
  selectionError.value = "";

  translateText(text, targetLang, nativeLang || "zh")
    .then(result => {
      selectionResult.value = result;
      selectionLoading.value = false;
    })
    .catch(err => {
      selectionError.value = typeof err === "string" ? err : t("news.translateFail");
      selectionLoading.value = false;
    });

  return true;
}

// Track selection changes while the user is actively dragging — only record
// that a selection is in progress, don't trigger translation yet.
function onSelectionChange() {
  const sel = window.getSelection();
  if (!sel || sel.isCollapsed || sel.rangeCount === 0) {
    isSelecting = false;
    showTranslateButton.value = false;
    return;
  }
  const text = sel.toString().trim();
  if (text && text.split(/\s+/).length > 1) {
    isSelecting = true;
    positionTranslateButton(sel);
  } else {
    showTranslateButton.value = false;
  }
}

function positionTranslateButton(sel) {
  // Place the floating button just above the selection's top-right
  // corner. If the selection is near the top of the viewport we
  // place it below instead.
  const range = sel.getRangeAt(0);
  const rect = range.getBoundingClientRect();
  if (rect.width === 0 && rect.height === 0) {
    showTranslateButton.value = false;
    return;
  }
  const articleBody = document.querySelector(".article-body");
  // Don't show the button for selections that aren't inside the
  // article body (e.g. selections in the header or footer).
  if (articleBody && !articleBody.contains(range.commonAncestorContainer)) {
    showTranslateButton.value = false;
    return;
  }
  const buttonWidth = 88;
  const margin = 8;
  // Prefer above the selection; flip below if there's no room.
  let y = rect.top - 40;
  if (y < 60) y = rect.bottom + 8;
  translateButtonX.value = Math.max(margin, Math.min(window.innerWidth - buttonWidth - margin, rect.right - buttonWidth));
  translateButtonY.value = y;
  showTranslateButton.value = true;
}

function onTranslateButtonClick() {
  const sel = window.getSelection();
  if (!sel) return;
  const text = sel.toString().trim();
  if (!text) return;
  if (!translateSelection(text)) return;
  sel.removeAllRanges();
  showTranslateButton.value = false;
}

// Windows: when the user releases the mouse, check if there was a valid
// multi-word selection and trigger translation.
function onPointerUp() {
  if (selectionTimer) clearTimeout(selectionTimer);
  selectionTimer = setTimeout(() => {
    selectionTimer = null;
    if (!isSelecting) return;
    isSelecting = false;

    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || sel.rangeCount === 0) return;
    const text = sel.toString().trim();
    if (!translateSelection(text)) return;
    sel.removeAllRanges();
  }, 50);
}

// Android: called from the native "翻译" menu item (see MainActivity.kt).
// The selected text is passed in from Kotlin via evaluateJavascript.
function handleNativeTranslate(text) {
  isSelecting = false; // prevent pointerup from double-firing
  if (!translateSelection(text)) return;
  const sel = window.getSelection();
  if (sel) sel.removeAllRanges();
}

function clearSelection() {
  if (selectionTimer) {
    clearTimeout(selectionTimer);
    selectionTimer = null;
  }
  selectionText.value = "";
  selectionResult.value = "";
  selectionError.value = "";
  selectionLoading.value = false;
}

function goBack() {
  router.push("/news");
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
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
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

.header-source {
  font-size: 11px;
  color: var(--text-lighter);
  margin-top: 2px;
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
  margin-bottom: 8px;
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
}

.mode-btn.active {
  border-color: var(--blue);
  background: var(--blue-bg);
  color: var(--blue);
  box-shadow: 0 0 0 2px rgba(28, 176, 246, 0.2);
}

/* Bilingual paragraphs */
.bilingual .para-original {
  margin-bottom: 4px;
}

.bilingual .para-translation {
  color: var(--text-lighter);
  font-size: 14px;
  line-height: 1.7;
  margin-bottom: 20px;
  padding-left: 12px;
  border-left: 2px solid var(--border);
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

/* Floating "翻译" button that appears over the user's text
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
