<template>
  <div class="reading-reader" :class="{ 'tv-content-pane tv-content-pane--fixed': isTvLayoutMode }">
    <header class="reader-header">
      <button class="back-btn" type="button" :tabindex="isTvLayoutMode ? -1 : undefined" @click="goBack">
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
      <button
        v-if="!isImported"
        class="regen-btn"
        :disabled="regenerating"
        :title="t('reading.regenerate')"
        @click="regenerateArticle"
      >
        <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true">
          <path d="M17.65 6.35A8 8 0 1 0 19.73 14h-2.08A6 6 0 1 1 12 6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"/>
        </svg>
      </button>
    </header>

    <div v-if="loading && !article" class="loading-center">
      <div class="spinner" />
      <p>{{ t('common.loading') }}</p>
    </div>

    <div v-else-if="loadError && !article" class="rewrite-prompt">
      <p class="error-text">{{ loadError }}</p>
      <button class="btn-rewrite" @click="loadArticle">{{ t('common.retry') }}</button>
    </div>

    <div v-else-if="article" class="article-layout-wrapper">
      <div
        ref="articleBodyEl"
        class="article-body"
        @scroll.passive="onBodyScroll"
        @wheel.passive="markUserScroll"
        @touchmove.passive="markUserScroll"
      >
        <div v-if="!bilingualMode" class="article-text">
          <template v-for="(para, pidx) in bodyParagraphs" :key="pidx">
            <div
              v-if="bookmarkedParagraphIdx === pidx"
              class="reading-bookmark-line-wrapper"
              role="separator"
              :aria-label="t('reading.bookmarkLabel') || '阅读进度标记'"
            >
              <div class="reading-bookmark-line" />
            </div>
            <p
              class="para"
              :data-pidx="pidx"
              :class="{
                'is-playing': isParagraphActive(pidx),
                'is-bookmarked': bookmarkedParagraphIdx === pidx,
              }"
              @click="onParagraphClick(pidx)"
            >
              <span
                v-if="formatParagraphTime(pidx)"
                class="para-time"
                :class="{ 'is-bookmarked': bookmarkedParagraphIdx === pidx }"
                :title="t('reading.playFromHere') || '从此处播放'"
                @pointerdown="onTimePointerDown($event, pidx)"
                @pointermove="onTimePointerMove($event)"
                @pointerup="onTimePointerUp"
                @pointercancel="onTimePointerUp"
                @contextmenu.prevent
                @click.stop="onTimeClick($event, pidx)"
              >{{ formatParagraphTime(pidx) }}</span>
              <template v-for="(token, idx) in para" :key="idx">
                <span
                  v-if="token.isWord"
                  class="word"
                  :tabindex="isTvLayoutMode ? 0 : undefined"
                  @click.stop="onWordTap(token)"
                  @keydown.enter.prevent="onWordTap(token)"
                  @keydown.space.prevent="onWordTap(token)"
                >{{ token.text }}</span>
                <span v-else>{{ token.text }}</span>
              </template>
            </p>
          </template>
        </div>

        <div v-else class="article-text bilingual">
          <template v-for="(tokens, pidx) in bodyParagraphs" :key="pidx">
            <div
              v-if="bookmarkedParagraphIdx === pidx"
              class="reading-bookmark-line-wrapper"
              role="separator"
              :aria-label="t('reading.bookmarkLabel') || '阅读进度标记'"
            >
              <div class="reading-bookmark-line" />
            </div>
            <p
              class="para-original"
              :data-pidx="pidx"
              :class="{
                'is-playing': isParagraphActive(pidx),
                'is-bookmarked': bookmarkedParagraphIdx === pidx,
              }"
              @click="onParagraphClick(pidx)"
            >
              <span
                v-if="formatParagraphTime(pidx)"
                class="para-time"
                :class="{ 'is-bookmarked': bookmarkedParagraphIdx === pidx }"
                :title="t('reading.playFromHere') || '从此处播放'"
                @pointerdown="onTimePointerDown($event, pidx)"
                @pointermove="onTimePointerMove($event)"
                @pointerup="onTimePointerUp"
                @pointercancel="onTimePointerUp"
                @contextmenu.prevent
                @click.stop="onTimeClick($event, pidx)"
              >{{ formatParagraphTime(pidx) }}</span>
              <template v-for="(token, idx) in tokens" :key="idx">
                <span
                  v-if="token.isWord"
                  class="word"
                  :tabindex="isTvLayoutMode ? 0 : undefined"
                  @click.stop="onWordTap(token)"
                  @keydown.enter.prevent="onWordTap(token)"
                  @keydown.space.prevent="onWordTap(token)"
                >{{ token.text }}</span>
                <span v-else>{{ token.text }}</span>
              </template>
            </p>
            <p
              class="para-translation"
              :data-tidx="pidx"
              :class="{
                'is-pending': translationState[pidx] !== 'done' && translationState[pidx] !== 'error',
                'is-error': translationState[pidx] === 'error',
              }"
              :tabindex="isTvLayoutMode ? 0 : undefined"
              @click="retryParagraphTranslation(pidx)"
              @keydown.enter.prevent="retryParagraphTranslation(pidx)"
            >{{ translationDisplay(pidx) }}</p>
          </template>
        </div>
    </div>

    <!-- Right-side custom scrollbar: thin rail with green dot thumb -->
    <div
      v-show="canScroll"
      ref="scrollRailEl"
      class="article-scroll-rail"
      :class="{ 'is-dragging': isScrollDragging }"
      role="scrollbar"
      tabindex="-1"
      aria-orientation="vertical"
      :aria-valuenow="Math.round(scrollPercent)"
      aria-valuemin="0"
      aria-valuemax="100"
      @pointerdown="onScrollRailPointerDown"
      @pointermove="onScrollRailPointerMove"
      @pointerup="onScrollRailPointerUp"
      @pointercancel="onScrollRailPointerUp"
    >
      <div class="article-scroll-track">
        <div class="article-scroll-fill" :style="{ height: `${scrollPercent}%` }" />
      </div>
      <div class="article-scroll-thumb" :style="{ top: `${scrollPercent}%` }" />
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

    <div v-if="article" class="bottom-bar">
      <div class="bottom-actions">
        <button class="btn-mode" :class="{ active: bilingualMode }" @click="toggleBilingual">
          {{ bilingualMode ? t('news.bilingual') : t('news.original') }}
        </button>
        <button
          class="btn-read"
          :class="{ 'is-reading': isImported ? isAudioPlaying : reading }"
          :disabled="isImported ? !audioAvailable : !canRead"
          :title="(isImported ? isAudioPlaying : reading) ? t('news.stopReading') : t('news.readAloud')"
          :aria-label="(isImported ? isAudioPlaying : reading) ? t('news.stopReading') : t('news.readAloud')"
          @click="isImported ? togglePlayAudio() : toggleReading()"
        >
          <svg v-if="!(isImported ? isAudioPlaying : reading)" class="read-icon" viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true">
            <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1-3.29-2.5-4.03v8.05c1.5-.73 2.5-2.25 2.5-4.02z"/>
            <path d="M14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/>
          </svg>
          <svg v-else class="read-icon" viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true">
            <path d="M6 6h4v12H6V6zm8 0h4v12h-4V6z"/>
          </svg>
        </button>
        <button v-if="!isImported" class="btn-test" :disabled="testLoading" @click="goTest">
          {{ t('reading.test') }}
        </button>
      </div>
    </div>

    <Transition name="popup">
      <div v-if="readStatus || audioStatus" class="read-toast">{{ readStatus || audioStatus }}</div>
    </Transition>
  </div>
</template>

<script setup>
import { ref, computed, watch, nextTick, onMounted, onBeforeUnmount } from "vue";
import { useRoute, useRouter } from "vue-router";
import { convertFileSrc, isTauri } from "@tauri-apps/api/core";
import { useI18n, getLocale } from "@/shared/i18n";
import { useTargetLangStore } from "@/stores/targetLang.js";
import {
  getReadingArticle,
  getImportedArticle,
  markReadingArticleRead,
  regenerateReadingArticle,
} from "@/shared/backend/reading.js";
import { translateText } from "@/shared/backend/llm.js";
import {
  lookupWordIds,
  updateWordMastery,
  addDiscoveredWord,
  ensureWordsSeen,
} from "@/shared/backend/vocabulary.js";
import WordPopup from "@/shared/components/WordPopup.vue";
import { loadLearningContext } from "@/shared/learningContext.js";
import { tokenizeArticleText, extractWordTexts } from "@/shared/articleText.js";
import { useSelectionTranslation } from "@/shared/selectionTranslation.js";
import { useReadAloud } from "@/shared/readAloud.js";
import { isTvLayoutMode } from "@/shared/appMode.js";
import { pushInPageBackHandler } from "@/shared/inPageBack.js";
import {
  getReadingBookmark,
  clearReadingBookmark,
  toggleReadingBookmark,
} from "./readingBookmark.js";

const { t } = useI18n();
const router = useRouter();
const route = useRoute();
const targetLangStore = useTargetLangStore();
const props = defineProps({
  id: [String, Number],
  isImported: Boolean,
});

const isImported = ref(false);
const importedParagraphs = ref([]);
const audioDuration = ref(0);
const currentTime = ref(0);
const isAudioPlaying = ref(false);
const audioAvailable = ref(false);
let audioEl = null;
let audioBlobUrl = null;
let audioLoadToken = 0;
let pendingSeekTime = null;
let pendingAutoPlay = false;

function cleanupAudioBlob() {
  if (audioBlobUrl) {
    try {
      URL.revokeObjectURL(audioBlobUrl);
    } catch (_) {}
    audioBlobUrl = null;
  }
}

const timelinePercent = computed(() => {
  if (audioDuration.value <= 0) return 0;
  return Math.min(100, Math.max(0, (currentTime.value / audioDuration.value) * 100));
});

function isParagraphActive(pidx) {
  return isImported.value && activeParagraphIdx.value === pidx;
}

function resolveAudioSrc(audioPath) {
  if (/^(https?|blob|data|asset):/i.test(audioPath)) return audioPath;
  const inTauri = typeof isTauri === "function" ? isTauri() : !!isTauri;
  if (inTauri) {
    try {
      return convertFileSrc(audioPath);
    } catch (e) {
      console.warn("convertFileSrc failed:", e);
    }
  }
  return audioPath;
}

const audioStatus = ref("");
let audioStatusTimer = null;
function showAudioStatus(msg) {
  audioStatus.value = msg;
  if (audioStatusTimer) clearTimeout(audioStatusTimer);
  audioStatusTimer = setTimeout(() => {
    audioStatus.value = "";
    audioStatusTimer = null;
  }, 3000);
}

function applyPendingAudioActions(el) {
  if (pendingSeekTime !== null) {
    const t = pendingSeekTime;
    pendingSeekTime = null;
    try {
      el.currentTime = t;
    } catch (err) {
      console.warn("audio seek failed:", err);
    }
  }
  if (pendingAutoPlay) {
    pendingAutoPlay = false;
    const playPromise = el.play();
    if (playPromise && typeof playPromise.catch === "function") {
      playPromise.catch((err) => {
        console.warn("Audio play failed:", err);
        showAudioStatus(t("reading.audioPlayFail"));
      });
    }
  }
}

function initAudio(audioPath, durationSec) {
  if (audioEl) {
    audioEl.pause();
    audioEl = null;
  }
  cleanupAudioBlob();
  pendingSeekTime = null;
  pendingAutoPlay = false;

  audioDuration.value = durationSec || 0;
  currentTime.value = 0;
  isAudioPlaying.value = false;
  audioAvailable.value = false;

  if (!audioPath) return;

  const currentToken = ++audioLoadToken;
  const el = new Audio();
  el.preload = "metadata";
  audioEl = el;
  audioAvailable.value = true;

  el.addEventListener("loadedmetadata", () => {
    if (el.duration && Number.isFinite(el.duration)) {
      audioDuration.value = el.duration;
    }
    applyPendingAudioActions(el);
  });
  el.addEventListener("canplay", () => {
    applyPendingAudioActions(el);
  });
  el.addEventListener("timeupdate", () => {
    currentTime.value = el.currentTime || 0;
  });
  el.addEventListener("ended", () => {
    isAudioPlaying.value = false;
    currentTime.value = 0;
  });
  el.addEventListener("pause", () => {
    isAudioPlaying.value = false;
  });
  el.addEventListener("play", () => {
    isAudioPlaying.value = true;
  });
  el.addEventListener("error", () => {
    console.warn("Audio load failed:", el.error, el.src);
    isAudioPlaying.value = false;
    audioAvailable.value = false;
    showAudioStatus(t("reading.audioLoadFail"));
  });

  const src = resolveAudioSrc(audioPath);
  // On Android/Tauri WebView, playing directly via custom asset protocols breaks Range requests,
  // causing PIPELINE_ERROR_READ stalling after ~32s and broken seeks.
  // Converting local asset URLs to a memory Blob URL provides smooth playback and instantaneous seeks.
  if (/asset\.localhost/i.test(src) || /^asset:\/\//i.test(src)) {
    fetch(src)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.blob();
      })
      .then((blob) => {
        if (currentToken !== audioLoadToken || audioEl !== el) return;
        audioBlobUrl = URL.createObjectURL(blob);
        el.src = audioBlobUrl;
      })
      .catch((err) => {
        console.warn("Failed to fetch audio as blob, falling back to direct src:", err);
        if (currentToken !== audioLoadToken || audioEl !== el) return;
        el.src = src;
      });
  } else {
    el.src = src;
  }
}

function togglePlayAudio() {
  if (!audioEl) return;
  if (isAudioPlaying.value) {
    audioEl.pause();
    pendingAutoPlay = false;
  } else {
    if (!audioEl.src) {
      pendingAutoPlay = true;
      return;
    }
    const p = audioEl.play();
    if (p && typeof p.catch === "function") {
      p.catch((err) => {
        console.warn("Audio play failed:", err);
        showAudioStatus(t("reading.audioPlayFail"));
      });
    }
  }
}

function formatParagraphTime(pidx) {
  if (!isImported.value) return "";
  const p = importedParagraphs.value[pidx];
  if (!p || p.start === undefined || p.start === null) return "";
  const totalSec = Math.floor(p.start);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  if (m >= 60) {
    const h = Math.floor(m / 60);
    const remM = m % 60;
    return `${h}:${String(remM).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function playFromParagraph(pidx) {
  if (!isImported.value) return;
  const p = importedParagraphs.value[pidx];
  if (!p || p.start === undefined || p.start === null) return;
  currentTime.value = p.start;
  if (audioEl) {
    if (!audioEl.src) {
      pendingSeekTime = p.start;
      pendingAutoPlay = true;
      return;
    }
    try {
      audioEl.currentTime = p.start;
    } catch (err) {
      console.warn("audioEl.currentTime seek failed:", err);
    }
    const playPromise = audioEl.play();
    if (playPromise && typeof playPromise.catch === "function") {
      playPromise.catch((err) => {
        console.warn("Audio play failed:", err);
        showAudioStatus(t("reading.audioPlayFail"));
      });
    }
  }
}

function onParagraphClick(pidx) {
  if (!isImported.value) return;
  const selection = window.getSelection?.();
  if (selection && selection.toString().trim().length > 0) return;
  if (selectionText.value) return;
  playFromParagraph(pidx);
}

// ---- Paragraph reading progress bookmark & long-press ----
const bookmarkedParagraphIdx = ref(null);
let longPressTimer = null;
let longPressStartX = 0;
let longPressStartY = 0;
let isLongPressTriggered = false;

function onTimePointerDown(e, pidx) {
  if (e.button !== undefined && e.button !== 0) return;
  if (longPressTimer) {
    clearTimeout(longPressTimer);
    longPressTimer = null;
  }
  isLongPressTriggered = false;
  longPressStartX = e.clientX;
  longPressStartY = e.clientY;
  longPressTimer = setTimeout(() => {
    isLongPressTriggered = true;
    handleTimeLongPress(pidx);
  }, 500);
}

function onTimePointerMove(e) {
  if (!longPressTimer) return;
  const dist = Math.hypot(e.clientX - longPressStartX, e.clientY - longPressStartY);
  if (dist > 10) {
    clearTimeout(longPressTimer);
    longPressTimer = null;
  }
}

function onTimePointerUp() {
  if (longPressTimer) {
    clearTimeout(longPressTimer);
    longPressTimer = null;
  }
}

function handleTimeLongPress(pidx) {
  const p = importedParagraphs.value[pidx];
  const time = p?.start ?? 0;
  const res = toggleReadingBookmark(
    props.id,
    { pidx, time },
    isImported.value,
  );
  if (res.saved) {
    bookmarkedParagraphIdx.value = pidx;
    showAudioStatus(t("reading.bookmarkSaved") || "已记住阅读进度");
  } else {
    bookmarkedParagraphIdx.value = null;
    showAudioStatus(t("reading.bookmarkCleared") || "已取消进度标记");
  }
  if (typeof navigator !== "undefined" && navigator.vibrate) {
    try {
      navigator.vibrate(40);
    } catch (_) {}
  }
}

function onTimeClick(e, pidx) {
  if (isLongPressTriggered) {
    isLongPressTriggered = false;
    e?.preventDefault?.();
    e?.stopPropagation?.();
    return;
  }
  playFromParagraph(pidx);
}

// ---- Custom scrollbar: thin rail with green dot thumb ----
const articleBodyEl = ref(null);
const scrollRailEl = ref(null);
const isScrollDragging = ref(false);
const scrollPercent = ref(0);
const canScroll = ref(true);
let lastUserScrollAt = 0;

function markUserScroll() {
  lastUserScrollAt = Date.now();
}

function updateScrollState() {
  const body = articleBodyEl.value;
  if (!body) {
    canScroll.value = true;
    scrollPercent.value = 0;
    return;
  }
  const maxScroll = body.scrollHeight - body.clientHeight;
  canScroll.value = maxScroll > 4 || (article.value?.body?.length || 0) > 250;
  if (maxScroll > 0) {
    scrollPercent.value = Math.min(100, Math.max(0, (body.scrollTop / maxScroll) * 100));
  } else {
    scrollPercent.value = 0;
  }
}

function onBodyScroll() {
  updateScrollState();
}

function scrollToPercent(pct) {
  const body = articleBodyEl.value;
  if (!body) return;
  const maxScroll = body.scrollHeight - body.clientHeight;
  if (maxScroll <= 0) return;
  const targetTop = Math.max(0, Math.min(maxScroll, pct * maxScroll));
  body.scrollTop = targetTop;
  updateScrollState();
  markUserScroll();
}

function scrollFromPointer(e) {
  const rail = scrollRailEl.value;
  if (!rail) return;
  const rect = rail.getBoundingClientRect();
  if (rect.height <= 0) return;
  const pct = Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height));
  scrollToPercent(pct);
}

function onScrollRailPointerDown(e) {
  isScrollDragging.value = true;
  e.currentTarget?.setPointerCapture?.(e.pointerId);
  scrollFromPointer(e);
}

function onScrollRailPointerMove(e) {
  if (isScrollDragging.value) {
    scrollFromPointer(e);
  }
}

function onScrollRailPointerUp(e) {
  if (!isScrollDragging.value) return;
  isScrollDragging.value = false;
  e.currentTarget?.releasePointerCapture?.(e.pointerId);
}

function scrollToParagraph(pidx, behavior = "smooth") {
  const body = articleBodyEl.value;
  if (!body || pidx < 0) return;
  const el = body.querySelector(`[data-pidx="${pidx}"]`);
  if (!el) return;
  const top =
    el.getBoundingClientRect().top -
    body.getBoundingClientRect().top +
    body.scrollTop -
    body.clientHeight / 3;
  if (typeof body.scrollTo === "function") {
    body.scrollTo({ top: Math.max(0, top), behavior });
  } else {
    body.scrollTop = Math.max(0, top);
  }
  updateScrollState();
}

const activeParagraphIdx = computed(() => {
  if (!isImported.value || !importedParagraphs.value.length) return -1;
  const time = currentTime.value;
  const paras = importedParagraphs.value;
  return paras.findIndex((p, idx) => {
    const isLast = idx === paras.length - 1;
    return time >= p.start && (isLast ? time <= p.end : time < p.end);
  });
});

watch(activeParagraphIdx, (idx) => {
  if (idx < 0 || !isAudioPlaying.value || isScrollDragging.value) return;
  if (Date.now() - lastUserScrollAt < 4000) return;
  scrollToParagraph(idx, "smooth");
});

const article = ref(null);
const loadError = ref("");
const loading = ref(true);
const bilingualMode = ref(false);
const titleTranslation = ref("");
const paragraphTexts = computed(() => {
  const body = article.value?.body || "";
  return body
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);
});
const bodyParagraphs = computed(() => paragraphTexts.value.map((p) => tokenizeArticleText(p)));

// ---- Lazy per-paragraph translation ----
// Each paragraph is translated only when it nears the viewport, with a small
// concurrency cap so long imported transcripts never fire hundreds of calls.
const MAX_CONCURRENT_TRANSLATIONS = 2;
const translations = ref([]);
const translationState = ref([]); // undefined | "queued" | "loading" | "done" | "error"
let translateQueue = [];
let activeTranslations = 0;
let translateGeneration = 0;
let paraObserver = null;
let titleTranslationRequested = false;

function resetTranslations() {
  translateGeneration += 1;
  translateQueue = [];
  activeTranslations = 0;
  translations.value = [];
  translationState.value = [];
  titleTranslation.value = "";
  titleTranslationRequested = false;
  teardownParaObserver();
}

function translationDisplay(pidx) {
  const state = translationState.value[pidx];
  if (state === "done") return translations.value[pidx] || "";
  if (state === "error") return t("reading.paraTranslateRetry");
  return "…";
}

function enqueueTranslation(pidx) {
  const state = translationState.value[pidx];
  if (state === "queued" || state === "loading" || state === "done") return;
  translationState.value[pidx] = "queued";
  translateQueue.push(pidx);
  pumpTranslations();
}

function dequeueTranslation(pidx) {
  if (translationState.value[pidx] !== "queued") return;
  translateQueue = translateQueue.filter((i) => i !== pidx);
  translationState.value[pidx] = undefined;
}

function pumpTranslations() {
  while (activeTranslations < MAX_CONCURRENT_TRANSLATIONS && translateQueue.length > 0) {
    runTranslation(translateQueue.shift());
  }
}

async function runTranslation(pidx) {
  const gen = translateGeneration;
  const text = paragraphTexts.value[pidx];
  if (!text) {
    translationState.value[pidx] = "done";
    return;
  }
  activeTranslations += 1;
  translationState.value[pidx] = "loading";
  try {
    const result = await translateText(text, targetLang, getLocale());
    if (gen !== translateGeneration) return;
    translations.value[pidx] = result || "";
    translationState.value[pidx] = "done";
  } catch (e) {
    if (gen !== translateGeneration) return;
    console.error("Paragraph translation failed:", e);
    translationState.value[pidx] = "error";
  } finally {
    if (gen === translateGeneration) {
      activeTranslations -= 1;
      pumpTranslations();
    }
  }
}

function retryParagraphTranslation(pidx) {
  if (translationState.value[pidx] !== "error") return;
  translationState.value[pidx] = undefined;
  enqueueTranslation(pidx);
}

async function requestTitleTranslation() {
  if (titleTranslationRequested) return;
  const title = article.value?.title || "";
  if (!title) return;
  titleTranslationRequested = true;
  const gen = translateGeneration;
  try {
    const result = await translateText(title, targetLang, getLocale());
    if (gen === translateGeneration) titleTranslation.value = result || "";
  } catch (_) {
    if (gen === translateGeneration) titleTranslationRequested = false;
  }
}

function teardownParaObserver() {
  if (paraObserver) {
    paraObserver.disconnect();
    paraObserver = null;
  }
}

async function setupParaObserver() {
  teardownParaObserver();
  await nextTick();
  if (!bilingualMode.value) return;
  const body = articleBodyEl.value;
  if (!body) return;
  const slots = body.querySelectorAll(".para-translation[data-tidx]");
  if (typeof IntersectionObserver === "undefined") {
    // Fallback for environments without IntersectionObserver: still bounded by the queue cap.
    slots.forEach((el) => enqueueTranslation(Number(el.dataset.tidx)));
    return;
  }
  paraObserver = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        const pidx = Number(entry.target.dataset.tidx);
        if (entry.isIntersecting) enqueueTranslation(pidx);
        else dequeueTranslation(pidx);
      }
    },
    { root: body, rootMargin: "300px 0px 300px 0px" },
  );
  slots.forEach((el) => paraObserver.observe(el));
}
const selectedWord = ref(null);
const testLoading = ref(false);
const wordsProcessed = ref(false);
const regenerating = ref(false);

function articleWordTexts() {
  const title = article.value?.title || "";
  const body = article.value?.body || "";
  return extractWordTexts(`${title} ${body}`);
}

async function processArticleWords() {
  if (wordsProcessed.value || !userId || !article.value) return;
  const wordTokens = articleWordTexts();
  if (wordTokens.length === 0) return;
  try {
    await ensureWordsSeen(userId, wordTokens, targetLang);
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
      await ensureWordsSeen(userId, wordTokens, targetLang);
    }
  } catch (e) {
    console.error("Failed to mark words as seen:", e);
  }
}

// Read aloud state
function getReadableArticleText() {
  if (!article.value) return "";
  const title = article.value.title || "";
  const body = article.value.body || "";
  return `${title}\n\n${body}`.trim();
}

const {
  reading,
  readStatus,
  canRead,
  toggleReading,
} = useReadAloud({
  getText: getReadableArticleText,
  getTargetLang: () => targetLang,
  t,
});

let targetLang = "es";
let userId = "";
let cefrLevel = "";
let nativeLang = "";

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

let releaseSelectionBack = null;
let bodyResizeObserver = null;

onMounted(async () => {
  document.addEventListener("selectionchange", onSelectionChange);
  document.addEventListener("pointerup", onPointerUp);
  window.__amigaTranslateSelection = handleNativeTranslate;
  releaseSelectionBack = pushInPageBackHandler(() => {
    if (selectionText.value) {
      clearSelection();
      return "navigated";
    }
    return null;
  });
  window.addEventListener("resize", updateScrollState);
  if (articleBodyEl.value && typeof ResizeObserver !== "undefined") {
    bodyResizeObserver = new ResizeObserver(() => updateScrollState());
    bodyResizeObserver.observe(articleBodyEl.value);
  }
  await loadArticle();
});

onBeforeUnmount(() => {
  if (audioEl) {
    audioEl.pause();
    audioEl = null;
  }
  cleanupAudioBlob();
  if (audioStatusTimer) {
    clearTimeout(audioStatusTimer);
    audioStatusTimer = null;
  }
  if (longPressTimer) {
    clearTimeout(longPressTimer);
    longPressTimer = null;
  }
  translateGeneration += 1;
  teardownParaObserver();
  window.removeEventListener("resize", updateScrollState);
  bodyResizeObserver?.disconnect();
  bodyResizeObserver = null;
  document.removeEventListener("selectionchange", onSelectionChange);
  document.removeEventListener("pointerup", onPointerUp);
  delete window.__amigaTranslateSelection;
  releaseSelectionBack?.();
  releaseSelectionBack = null;
  cleanupSelectionTranslation();
  ensureArticleWordsSeenIfNeeded();
});

async function loadArticle() {
  loading.value = true;
  loadError.value = "";
  try {
    const ctx = await loadLearningContext({ targetLangStore });
    userId = ctx.user?.id || "";
    targetLang = ctx.targetLang;
    cefrLevel = ctx.cefr || "";
    nativeLang = ctx.nativeLang || "";

    if (route.query.type === "imported" || props.isImported) {
      isImported.value = true;
      const imp = await getImportedArticle(Number(props.id));
      let paras = [];
      try {
        paras = JSON.parse(imp.subtitles_json || "[]");
      } catch {
        paras = [];
      }
      importedParagraphs.value = paras;
      article.value = {
        id: imp.id,
        title: imp.title,
        body: paras.map((p) => p.text).join("\n\n"),
        cefr_level: imp.cefr_level || "A2",
        local_date: imp.created_at ? imp.created_at.split("T")[0] : "",
        status: "read",
      };
      initAudio(imp.audio_path, imp.duration_sec);
    } else {
      isImported.value = false;
      const art = await getReadingArticle(Number(props.id));
      article.value = art;
      await markReadingArticleRead(Number(props.id));
    }

    // Restore bookmark if previously saved
    const savedBookmark = getReadingBookmark(props.id, isImported.value);
    if (savedBookmark && typeof savedBookmark.pidx === "number" && savedBookmark.pidx >= 0) {
      bookmarkedParagraphIdx.value = savedBookmark.pidx;
      if (typeof savedBookmark.time === "number" && savedBookmark.time > 0) {
        currentTime.value = savedBookmark.time;
        if (audioEl) {
          try {
            audioEl.currentTime = savedBookmark.time;
          } catch (_) {
            pendingSeekTime = savedBookmark.time;
          }
        } else {
          pendingSeekTime = savedBookmark.time;
        }
      }
    } else {
      bookmarkedParagraphIdx.value = null;
    }

    // Process article words in the background without blocking initial render/scroll
    processArticleWords();
  } catch (e) {
    console.error("Failed to load article:", e);
    loadError.value = e?.message || String(e);
  } finally {
    loading.value = false;
    await nextTick();
    if (bookmarkedParagraphIdx.value !== null && bookmarkedParagraphIdx.value >= 0) {
      scrollToParagraph(bookmarkedParagraphIdx.value, "auto");
      if (typeof requestAnimationFrame !== "undefined") {
        requestAnimationFrame(() => {
          if (Date.now() - lastUserScrollAt > 1000 && bookmarkedParagraphIdx.value !== null && bookmarkedParagraphIdx.value >= 0) {
            scrollToParagraph(bookmarkedParagraphIdx.value, "auto");
            updateScrollState();
          }
        });
      }
    }
    updateScrollState();
    setTimeout(updateScrollState, 50);
    setTimeout(updateScrollState, 200);
  }
}

async function regenerateArticle() {
  if (regenerating.value || !article.value) return;
  regenerating.value = true;
  try {
    clearReadingBookmark(props.id, isImported.value);
    bookmarkedParagraphIdx.value = null;
    const art = await regenerateReadingArticle(
      Number(props.id),
      cefrLevel,
      nativeLang,
    );
    article.value = art;
    selectedWord.value = null;
    wordsProcessed.value = false;
    bilingualMode.value = false;
    resetTranslations();
    await processArticleWords();
    await nextTick();
    updateScrollState();
  } catch (e) {
    console.error("Failed to regenerate article:", e);
  } finally {
    regenerating.value = false;
  }
}

async function toggleBilingual() {
  bilingualMode.value = !bilingualMode.value;
  if (bilingualMode.value) {
    requestTitleTranslation();
    await setupParaObserver();
  } else {
    teardownParaObserver();
    // Drop not-yet-started requests; finished translations stay cached.
    for (const pidx of translateQueue) translationState.value[pidx] = undefined;
    translateQueue = [];
  }
  await nextTick();
  updateScrollState();
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
  if (typeof window !== "undefined" && typeof window.__amigaGoBack === "function") {
    const result = window.__amigaGoBack();
    if (result === "navigated" || result === "at-root") return;
  }
  if (selectedWord.value) {
    selectedWord.value = null;
    return;
  }
  if (selectionText.value) {
    clearSelection();
    return;
  }
  router.push("/learn/reading");
}

function goTest() {
  if (testLoading.value) return;
  testLoading.value = true;
  router.push(`/learn/reading/${props.id}/test`).finally(() => {
    testLoading.value = false;
  });
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
  padding: 8px 12px 12px;
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

.regen-btn {
  flex-shrink: 0;
  width: 40px;
  height: 40px;
  border: none;
  background: transparent;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  color: var(--text-light);
  transition: background var(--transition);
}

.regen-btn:hover:not(:disabled) {
  background: var(--surface-variant);
}

.regen-btn:disabled {
  opacity: 0.5;
  cursor: wait;
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

.article-layout-wrapper {
  flex: 1;
  min-height: 0;
  display: flex;
  position: relative;
  overflow: hidden;
}

.article-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  overscroll-behavior: contain;
  padding: 20px 20px 80px;
  box-sizing: border-box;
  scrollbar-width: none;
  -ms-overflow-style: none;
}

.article-body::-webkit-scrollbar {
  display: none;
  width: 0;
  height: 0;
}

.article-scroll-rail {
  width: 18px;
  margin: 16px 2px 76px 0;
  position: relative;
  flex-shrink: 0;
  cursor: pointer;
  touch-action: none;
  -webkit-user-select: none;
  user-select: none;
  z-index: 10;
}

.article-scroll-track {
  position: absolute;
  top: 0;
  bottom: 0;
  left: 50%;
  width: 4px;
  transform: translateX(-50%);
  background: var(--border, #e5e7eb);
  border-radius: 999px;
  overflow: hidden;
  transition: width 0.15s ease;
}

.article-scroll-rail:hover .article-scroll-track,
.article-scroll-rail.is-dragging .article-scroll-track {
  width: 6px;
}

.article-scroll-fill {
  width: 100%;
  background: var(--green, #2ecc71);
  border-radius: 999px;
  position: absolute;
  top: 0;
  left: 0;
  transition: height 0.08s linear;
}

.article-scroll-thumb {
  position: absolute;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: var(--green, #2ecc71);
  box-shadow: 0 0 5px rgba(46, 204, 113, 0.7);
  transition: top 0.08s linear, width 0.12s ease, height 0.12s ease;
  pointer-events: none;
}

.article-scroll-rail:hover .article-scroll-thumb,
.article-scroll-rail.is-dragging .article-scroll-thumb {
  width: 14px;
  height: 14px;
  box-shadow: 0 0 8px rgba(46, 204, 113, 0.9);
}

.article-scroll-rail.is-dragging .article-scroll-fill,
.article-scroll-rail.is-dragging .article-scroll-thumb {
  transition: none;
}

/* Match news reader: full-pane reading, modest gutters (no narrow column). */
html[data-app-mode="tv"] .reader-header {
  padding: 10px 16px 12px;
}

html[data-app-mode="tv"] .article-body {
  padding: 14px 16px 28px;
  max-width: none;
  margin: 0;
  width: 100%;
  box-sizing: border-box;
}

html[data-app-mode="tv"] .article-text {
  font-size: 22px;
  line-height: 1.75;
  max-width: none;
  margin-inline: 0;
  width: 100%;
  overflow-wrap: break-word;
  word-wrap: break-word;
}

html[data-app-mode="tv"] .header-title {
  font-size: 18px;
  -webkit-line-clamp: 2;
  overflow-wrap: break-word;
}

.article-text {
  font-size: 17px;
  line-height: 1.7;
  color: var(--text);
  overflow-wrap: break-word;
  word-wrap: break-word;
  -webkit-user-select: text;
  -webkit-touch-callout: default;
  user-select: text;
  -webkit-tap-highlight-color: transparent;
  touch-action: auto;
}

.article-text .para {
  margin: 0 0 1.15em;
  white-space: pre-wrap;
  overflow-wrap: break-word;
  padding: 4px 6px;
  border-left: 3px solid transparent;
  border-radius: 4px;
  transition: background 0.2s ease, border-color 0.2s ease;
}

.article-text .para.is-playing,
.para-original.is-playing {
  background: rgba(46, 204, 113, 0.14);
  border-left-color: var(--green, #2ecc71);
}

.reading-bookmark-line-wrapper {
  width: 100%;
  padding: 8px 0 6px;
  display: flex;
  align-items: center;
  user-select: none;
}

.reading-bookmark-line {
  width: 100%;
  height: 2.5px;
  background: var(--green, #2ecc71);
  border-radius: 999px;
  box-shadow: 0 0 6px rgba(46, 204, 113, 0.55);
  position: relative;
}

.reading-bookmark-line::before {
  content: "";
  position: absolute;
  left: 0;
  top: 50%;
  transform: translateY(-50%);
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--green, #2ecc71);
  box-shadow: 0 0 5px rgba(46, 204, 113, 0.8);
}

.para-time {
  display: inline-block;
  font-size: 12px;
  line-height: 1.4;
  color: var(--text-lighter);
  margin-right: 8px;
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.02em;
  -webkit-touch-callout: none;
  -webkit-user-select: none;
  user-select: none;
  cursor: pointer;
  vertical-align: baseline;
  transition: color 0.15s ease;
}

.para.is-playing .para-time,
.para-original.is-playing .para-time {
  color: var(--green, #2ecc71);
  font-weight: 600;
}

.para-time.is-bookmarked {
  color: var(--green, #2ecc71);
  font-weight: 700;
  text-shadow: 0 0 4px rgba(46, 204, 113, 0.3);
}

.para-time:hover {
  color: var(--green, #2ecc71);
}

.article-text .para:last-child {
  margin-bottom: 0;
}

.article-text.bilingual {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.para-original {
  margin: 0;
  white-space: pre-wrap;
  overflow-wrap: break-word;
}

.para-translation {
  color: var(--text-lighter);
  font-size: 14px;
  line-height: 1.55;
  margin: 0 0 16px;
  padding-left: 12px;
  border-left: 2px solid var(--border);
  white-space: pre-wrap;
  overflow-wrap: break-word;
}

.para-translation.is-pending {
  opacity: 0.55;
  animation: para-pending 1.2s ease-in-out infinite;
}

.para-translation.is-error {
  color: var(--red);
  cursor: pointer;
}

@keyframes para-pending {
  0%, 100% { opacity: 0.35; }
  50% { opacity: 0.7; }
}

html[data-app-mode="tv"] .para-translation {
  font-size: 16px;
  line-height: 1.55;
  border-radius: 6px;
  outline: none;
}
html[data-app-mode="tv"] .para-translation:focus-visible {
  outline: 2px solid #1cb0f6 !important;
  outline-offset: 2px !important;
  box-shadow: none !important;
  transform: none !important;
  background: rgba(28, 176, 246, 0.08);
}

.word {
  cursor: pointer;
  padding: 0 1px;
  border-radius: 3px;
  transition: background 0.1s;
  white-space: normal;
  display: inline;
  -webkit-user-select: text;
  user-select: text;
}

.word:hover {
  background: var(--blue-bg);
}

/* TV: tight inline focus — never scale or use the global 5px outer ring. */
.word:focus-visible {
  outline: 2px solid #1cb0f6 !important;
  outline-offset: 0 !important;
  box-shadow: none !important;
  background: var(--blue-bg) !important;
  transform: none !important;
  z-index: 2;
  position: relative;
  border-radius: 3px;
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

.read-toast {
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
</style>
