<template>
  <Transition name="courseware-modal-fade">
    <div v-if="show" class="courseware-backdrop" @click.self="onClose">
      <div class="courseware-dialog" :class="{ 'is-tv': isTvLayoutMode }">
        <!-- Header -->
        <header class="courseware-header">
          <button class="btn-icon" :title="t('common.close')" @click="onClose">
            <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor">
              <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
            </svg>
          </button>
          <div class="header-center">
            <h3 class="chapter-name">{{ chapter?.title || t('reading.coursewareTitle') }}</h3>
            <div class="progress-subtext">
              <span>{{ t('reading.chapterProgress') }}: {{ progressPercent }}%</span>
              <span class="page-indicator">{{ currentSlideIndex + 1 }} / {{ totalSlides }}</span>
            </div>
          </div>
          <button class="btn-icon" :title="t('reading.replayAnimation')" @click="replayCurrentSvg">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
              <path d="M17.65 6.35A8 8 0 1 0 19.73 14h-2.08A6 6 0 1 1 12 6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"/>
            </svg>
          </button>
        </header>

        <!-- Segmented Progress Bar -->
        <div class="segmented-progress-track">
          <div
            v-for="(_, idx) in slides"
            :key="idx"
            class="progress-segment"
            :class="{
              'is-past': idx < currentSlideIndex,
              'is-current': idx === currentSlideIndex,
              'is-viewed': idx < (chapter?.viewed_pages || 0)
            }"
            @click="goToPage(idx)"
          />
        </div>

        <!-- Loading / Generating State -->
        <div v-if="isGenerating" class="status-panel">
          <div class="spinner-large" />
          <h4 class="status-title">{{ chapter?.courseware_status === 'pending' ? (t('reading.pendingCourseware') || '排队中…') : t('reading.generatingCourseware') }}</h4>
          <p class="status-desc">{{ chapter?.courseware_status === 'pending' ? '本章课件已在生成队列中，即将自动开始解析…' : 'AI 正在深度解析本章难点并生成生动 SVG 动画，请稍候…' }}</p>
        </div>

        <!-- Error State -->
        <div v-else-if="isError" class="status-panel">
          <div class="error-badge">⚠️</div>
          <h4 class="status-title">{{ t('reading.coursewareGenFailed') || '课件生成失败' }}</h4>
          <p class="status-desc">{{ chapter?.error_message || '生成课件时遇到网络或模型超时' }}</p>
          <button class="btn-retry" @click="onRegenerate">
            {{ t('reading.retry') }}
          </button>
        </div>

        <!-- Slide Content -->
        <div v-else-if="currentSlide" class="slide-content-scroller">
          <!-- Badge row -->
          <div class="badge-row">
            <span class="type-pill" :class="currentSlide.slide_type">
              {{ currentSlide.slide_type === 'phrase' ? t('reading.phraseSlide') : t('reading.vocabSlide') }}
            </span>
            <span v-if="currentSlide.pos" class="meta-tag">{{ currentSlide.pos }}</span>
            <span v-if="currentSlide.pronunciation" class="ipa-tag">/{{ currentSlide.pronunciation }}/</span>
          </div>

          <!-- SVG Animation Container -->
          <div class="svg-container" :key="svgRenderKey" v-html="currentSlideSvg" />

          <!-- Knowledge Card -->
          <div class="knowledge-card">
            <div class="term-row">
              <h2 class="term-title">{{ currentSlide.term }}</h2>
              <div class="audio-actions">
                <!-- TTS Pronounce -->
                <button
                  class="btn-audio"
                  :class="{ 'is-speaking': isSpeaking }"
                  :title="t('popup.speak') || '朗读发音'"
                  @click="speakTerm(currentSlide.term)"
                >
                  <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
                    <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1-3.29-2.5-4.03v8.05c1.5-.73 2.5-2.25 2.5-4.02z"/>
                    <path d="M14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/>
                  </svg>
                </button>
                <!-- Original Video Audio Snippet -->
                <button
                  v-if="hasSnippetAudio"
                  class="btn-audio btn-snippet"
                  :class="{ 'is-playing': isSnippetPlaying }"
                  :title="t('reading.playOrigSnippet')"
                  @click="playOriginalSnippet"
                >
                  <span>🎬</span>
                  <span class="snippet-label">{{ t('reading.playOrigSnippet') }}</span>
                </button>
              </div>
            </div>

            <div class="meaning-box">
              <span class="meaning-label">{{ currentSlide.meaning }}</span>
            </div>

            <div v-if="currentSlide.explanation" class="explanation-box">
              <p class="explanation-text">{{ currentSlide.explanation }}</p>
            </div>

            <!-- Context Sentence from Chapter -->
            <div v-if="currentSlide.context_sentence" class="context-card">
              <div class="context-header">
                <span class="context-icon">💬</span>
                <span class="context-label">原句语境</span>
              </div>
              <p class="context-orig">{{ currentSlide.context_sentence }}</p>
              <p v-if="currentSlide.context_translation" class="context-trans">
                {{ currentSlide.context_translation }}
              </p>
            </div>

            <!-- Vocabulary Mastery Actions (only for vocab slides) -->
            <div v-if="currentSlide.slide_type === 'vocab'" class="vocab-mastery-row">
              <button
                class="btn-mastery btn-unfamiliar"
                :class="{ 'active': currentMasteryStatus === 1 }"
                @click="markWordUnfamiliar"
              >
                <span>📌</span>
                <span>{{ currentMasteryStatus === 1 ? '在生词本中' : t('reading.markUnfamiliar') }}</span>
              </button>
              <button
                class="btn-mastery btn-mastered"
                :class="{ 'active': currentMasteryStatus === 2 }"
                @click="markWordMastered"
              >
                <span>✅</span>
                <span>{{ currentMasteryStatus === 2 ? '已掌握' : t('reading.markMastered') }}</span>
              </button>
            </div>
            <div v-if="masteryFeedback" class="mastery-feedback-toast">
              {{ masteryFeedback }}
            </div>
          </div>
        </div>

        <!-- Empty / fallback state -->
        <div v-else class="status-panel">
          <p>{{ t('reading.emptyList') }}</p>
        </div>

        <!-- Footer Navigation Controls -->
        <footer v-if="!isGenerating && !isError && totalSlides > 0" class="courseware-footer">
          <button
            class="btn-nav btn-prev"
            :disabled="currentSlideIndex <= 0"
            @click="prevSlide"
          >
            ← {{ t('reading.prevPage') }}
          </button>

          <button
            v-if="isLastSlide"
            class="btn-nav btn-finish"
            @click="finishCourseware"
          >
            🎉 {{ t('reading.finishCourseware') }}
          </button>
          <button
            v-else
            class="btn-nav btn-next"
            @click="nextSlide"
          >
            {{ t('reading.nextPage') }} →
          </button>
        </footer>
      </div>
    </div>
  </Transition>
</template>

<script setup>
import { ref, computed, watch, onMounted, onBeforeUnmount } from "vue";
import { useI18n } from "@/shared/i18n";
import { isTvLayoutMode } from "@/shared/appMode.js";
import { pushInPageBackHandler } from "@/shared/inPageBack.js";
import {
  lookupWordIds,
  updateWordMastery,
  addDiscoveredWord,
  getWordsMasteryMap,
} from "@/shared/api.js";

const props = defineProps({
  show: Boolean,
  chapter: Object,
  audioEl: Object,
  targetLang: { type: String, default: "es" },
  nativeLang: { type: String, default: "zh" },
  userId: { type: String, default: "u1" },
});

const emit = defineEmits(["close", "progress", "regenerate"]);
const { t } = useI18n();

const currentSlideIndex = ref(0);
const svgRenderKey = ref(0);
const isSpeaking = ref(false);
const isSnippetPlaying = ref(false);
const vocabMasteryMap = ref({});
const masteryFeedback = ref("");
let feedbackTimer = null;
let snippetStopTimer = null;
let removeBackHandler = null;

const slides = computed(() => props.chapter?.slides || []);
const totalSlides = computed(() => slides.value.length || 0);
const currentSlide = computed(() => slides.value[currentSlideIndex.value] || null);
const isLastSlide = computed(() => totalSlides.value > 0 && currentSlideIndex.value >= totalSlides.value - 1);

const currentTermKey = computed(() => currentSlide.value?.term?.trim().toLowerCase() || "");
const currentMasteryStatus = computed(() => {
  if (!currentTermKey.value) return null;
  return vocabMasteryMap.value[currentTermKey.value] ?? null;
});

const isGenerating = computed(() => {
  const status = props.chapter?.courseware_status;
  return status === "generating" || status === "pending";
});
const isError = computed(() => props.chapter?.courseware_status === "error");

const progressPercent = computed(() => {
  if (totalSlides.value <= 0) return 0;
  const viewed = Math.max(currentSlideIndex.value + 1, props.chapter?.viewed_pages || 0);
  return Math.min(100, Math.round((viewed / totalSlides.value) * 100));
});

const currentSlideSvg = computed(() => {
  return currentSlide.value?.svg || "";
});

const hasSnippetAudio = computed(() => {
  return !!(props.audioEl && currentSlide.value?.start_sec != null && currentSlide.value?.end_sec != null);
});

watch(
  () => props.show,
  (val) => {
    if (val) {
      initCoursewarePage();
      setupBackHandler();
    } else {
      cleanupSnippetPlayback();
      if (removeBackHandler) {
        removeBackHandler();
        removeBackHandler = null;
      }
    }
  }
);

watch(
  () => props.chapter?.id,
  (newId, oldId) => {
    if (props.show && newId && newId !== oldId) {
      initCoursewarePage();
    }
  }
);

watch(currentSlideIndex, () => {
  replayCurrentSvg();
  cleanupSnippetPlayback();
  if (typeof window !== "undefined" && window.speechSynthesis) {
    try {
      window.speechSynthesis.cancel();
    } catch (_) {}
  }
  isSpeaking.value = false;
});

function initCoursewarePage() {
  if (!slides.value.length) {
    currentSlideIndex.value = 0;
    return;
  }
  const viewed = props.chapter?.viewed_pages || 0;
  if (viewed >= totalSlides.value) {
    // If completed before, open at slide 0 for review
    currentSlideIndex.value = 0;
  } else {
    // Resume from the highest viewed page (clamped)
    currentSlideIndex.value = Math.max(0, Math.min(viewed, totalSlides.value - 1));
  }
  replayCurrentSvg();
  loadMasteryForChapter();
  persistProgressIfNeeded();
}

async function loadMasteryForChapter() {
  if (!props.userId || !slides.value.length) return;
  const vocabTerms = slides.value
    .filter((s) => s.slide_type === "vocab" && s.term)
    .map((s) => s.term.trim());
  if (!vocabTerms.length) return;
  try {
    const map = await getWordsMasteryMap(props.userId, vocabTerms, props.targetLang);
    if (map && typeof map === "object") {
      vocabMasteryMap.value = { ...vocabMasteryMap.value, ...map };
    }
  } catch (e) {
    console.warn("Failed to load vocab mastery map:", e);
  }
}

function setupBackHandler() {
  if (removeBackHandler) removeBackHandler();
  removeBackHandler = pushInPageBackHandler(() => {
    onClose();
    return "handled";
  });
}

function replayCurrentSvg() {
  svgRenderKey.value += 1;
}

function goToPage(idx) {
  if (idx >= 0 && idx < totalSlides.value && idx !== currentSlideIndex.value) {
    currentSlideIndex.value = idx;
    persistProgressIfNeeded();
  }
}

function prevSlide() {
  if (currentSlideIndex.value > 0) {
    currentSlideIndex.value -= 1;
  }
}

function nextSlide() {
  if (currentSlideIndex.value < totalSlides.value - 1) {
    currentSlideIndex.value += 1;
    persistProgressIfNeeded();
  }
}

function persistProgressIfNeeded() {
  if (!props.chapter?.id || totalSlides.value <= 0) return;
  const viewed = currentSlideIndex.value + 1;
  if (viewed > (props.chapter.viewed_pages || 0)) {
    emit("progress", { chapterId: props.chapter.id, viewedPages: viewed });
  }
}

function finishCourseware() {
  if (props.chapter?.id && totalSlides.value > 0) {
    emit("progress", { chapterId: props.chapter.id, viewedPages: totalSlides.value });
  }
  onClose();
}

function onClose() {
  persistProgressIfNeeded();
  cleanupSnippetPlayback();
  if (typeof window !== "undefined" && window.speechSynthesis) {
    try {
      window.speechSynthesis.cancel();
    } catch (_) {}
  }
  isSpeaking.value = false;
  emit("close");
}

function onRegenerate() {
  if (props.chapter?.id) {
    emit("regenerate", props.chapter.id);
  }
}

// ---- Audio Pronunciation & Snippets ----
function speakTerm(text) {
  if (!text || typeof window === "undefined" || !("speechSynthesis" in window)) return;
  try {
    window.speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance(text);
    utter.lang = props.targetLang === "es" ? "es-ES" : props.targetLang === "en" ? "en-US" : props.targetLang;
    utter.rate = 0.88;
    isSpeaking.value = true;
    utter.onend = () => { isSpeaking.value = false; };
    utter.onerror = () => { isSpeaking.value = false; };
    window.speechSynthesis.speak(utter);
  } catch (e) {
    console.warn("TTS speak failed:", e);
    isSpeaking.value = false;
  }
}

function cleanupSnippetPlayback() {
  if (snippetStopTimer) {
    clearTimeout(snippetStopTimer);
    snippetStopTimer = null;
  }
  if (isSnippetPlaying.value && props.audioEl) {
    try {
      props.audioEl.pause();
    } catch (_) {}
    isSnippetPlaying.value = false;
  }
}

function playOriginalSnippet() {
  if (!props.audioEl || !currentSlide.value) return;
  if (isSnippetPlaying.value) {
    cleanupSnippetPlayback();
    return;
  }

  const start = currentSlide.value.start_sec || 0;
  const end = currentSlide.value.end_sec || (start + 4.0);
  const durationMs = Math.max(800, (end - start) * 1000);

  try {
    props.audioEl.currentTime = start;
    const p = props.audioEl.play();
    isSnippetPlaying.value = true;
    if (p && typeof p.catch === "function") {
      p.catch(() => { isSnippetPlaying.value = false; });
    }

    if (snippetStopTimer) clearTimeout(snippetStopTimer);
    snippetStopTimer = setTimeout(() => {
      cleanupSnippetPlayback();
    }, durationMs);
  } catch (e) {
    console.warn("Snippet playback error:", e);
    isSnippetPlaying.value = false;
  }
}

// ---- Vocabulary Mastery ----
function showFeedback(msg) {
  masteryFeedback.value = msg;
  if (feedbackTimer) clearTimeout(feedbackTimer);
  feedbackTimer = setTimeout(() => {
    masteryFeedback.value = "";
  }, 2200);
}

async function markWordUnfamiliar() {
  if (!currentSlide.value || !props.userId || !currentTermKey.value) return;
  const word = currentSlide.value.term.trim();
  const currentStatus = vocabMasteryMap.value[currentTermKey.value];
  const newStatus = currentStatus === 1 ? 0 : 1;
  vocabMasteryMap.value[currentTermKey.value] = newStatus;

  try {
    const ids = await lookupWordIds([word], props.targetLang);
    if (ids.length > 0) {
      await updateWordMastery(props.userId, ids[0], newStatus, "reading");
    } else if (newStatus > 0) {
      const newId = await addDiscoveredWord(props.userId, word, props.targetLang, currentSlide.value.context_sentence);
      await updateWordMastery(props.userId, newId, newStatus, "reading");
    }
    showFeedback(newStatus === 1 ? "已加入生词本，将在复习中优先强化" : "已移出生词本");
  } catch (e) {
    console.warn("markWordUnfamiliar failed:", e);
  }
}

async function markWordMastered() {
  if (!currentSlide.value || !props.userId || !currentTermKey.value) return;
  const word = currentSlide.value.term.trim();
  const currentStatus = vocabMasteryMap.value[currentTermKey.value];
  const newStatus = currentStatus === 2 ? 0 : 2;
  vocabMasteryMap.value[currentTermKey.value] = newStatus;

  try {
    const ids = await lookupWordIds([word], props.targetLang);
    if (ids.length > 0) {
      await updateWordMastery(props.userId, ids[0], newStatus, "reading");
    } else if (newStatus > 0) {
      const newId = await addDiscoveredWord(props.userId, word, props.targetLang, currentSlide.value.context_sentence);
      await updateWordMastery(props.userId, newId, newStatus, "reading");
    }
    showFeedback(newStatus === 2 ? "已标记为掌握！" : "已取消掌握标记");
  } catch (e) {
    console.warn("markWordMastered failed:", e);
  }
}

// Keyboard shortcuts for desktop & TV remote
function handleKeydown(e) {
  if (!props.show) return;
  if (e.key === "ArrowLeft") {
    prevSlide();
  } else if (e.key === "ArrowRight") {
    if (isLastSlide.value) finishCourseware();
    else nextSlide();
  } else if (e.key === "Escape") {
    onClose();
  }
}

onMounted(() => {
  window.addEventListener("keydown", handleKeydown);
  if (props.show) {
    initCoursewarePage();
    setupBackHandler();
  }
});

onBeforeUnmount(() => {
  window.removeEventListener("keydown", handleKeydown);
  cleanupSnippetPlayback();
  if (removeBackHandler) removeBackHandler();
});
</script>

<style scoped>
.courseware-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.72);
  backdrop-filter: blur(6px);
  z-index: 1200;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 12px;
}

.courseware-dialog {
  width: 100%;
  max-width: 480px;
  height: 92vh;
  max-height: 840px;
  background: var(--bg, #f8fafc);
  border-radius: 20px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  box-shadow: 0 20px 40px rgba(0, 0, 0, 0.28);
}

.courseware-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 14px 8px;
  background: var(--white, #fff);
  border-bottom: 1px solid var(--border, #e2e8f0);
}

.btn-icon {
  background: none;
  border: none;
  color: var(--text-light, #64748b);
  cursor: pointer;
  padding: 6px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.2s, color 0.2s;
}

.btn-icon:hover {
  background: var(--surface-variant, #f1f5f9);
  color: var(--text, #1e293b);
}

.header-center {
  flex: 1;
  text-align: center;
  padding: 0 8px;
  min-width: 0;
}

.chapter-name {
  margin: 0;
  font-size: 14px;
  font-weight: 700;
  color: var(--text, #1e293b);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.progress-subtext {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  font-size: 11px;
  color: var(--text-light, #64748b);
  margin-top: 2px;
}

.page-indicator {
  font-weight: 600;
  color: var(--green, #10b981);
}

/* Segmented Progress Bar */
.segmented-progress-track {
  display: flex;
  gap: 4px;
  padding: 6px 14px 10px;
  background: var(--white, #fff);
  border-bottom: 1px solid var(--border, #e2e8f0);
}

.progress-segment {
  flex: 1;
  height: 4px;
  border-radius: 2px;
  background: var(--border, #e2e8f0);
  cursor: pointer;
  transition: background 0.25s, transform 0.15s;
}

.progress-segment:hover {
  transform: scaleY(1.4);
}

.progress-segment.is-viewed {
  background: rgba(16, 185, 129, 0.45);
}

.progress-segment.is-past {
  background: var(--green, #10b981);
}

.progress-segment.is-current {
  background: var(--green, #10b981);
  box-shadow: 0 0 6px rgba(16, 185, 129, 0.6);
}

/* Status Panels */
.status-panel {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 32px 24px;
  text-align: center;
}

.spinner-large {
  width: 44px;
  height: 44px;
  border: 4px solid var(--border, #e2e8f0);
  border-top-color: var(--green, #10b981);
  border-radius: 50%;
  animation: spin 0.9s linear infinite;
  margin-bottom: 16px;
}

.error-badge {
  font-size: 40px;
  margin-bottom: 12px;
}

.status-title {
  margin: 0 0 8px;
  font-size: 16px;
  font-weight: 700;
  color: var(--text, #1e293b);
}

.status-desc {
  margin: 0 0 20px;
  font-size: 13px;
  color: var(--text-light, #64748b);
  line-height: 1.5;
  max-width: 320px;
}

.btn-retry {
  padding: 8px 20px;
  background: var(--green, #10b981);
  color: #fff;
  border: none;
  border-radius: 10px;
  font-weight: 600;
  font-size: 14px;
  cursor: pointer;
  transition: opacity 0.2s;
}

.btn-retry:hover {
  opacity: 0.9;
}

/* Slide Content */
.slide-content-scroller {
  flex: 1;
  overflow-y: auto;
  padding: 14px 16px 20px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.badge-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.type-pill {
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  padding: 3px 8px;
  border-radius: 6px;
  letter-spacing: 0.5px;
}

.type-pill.vocab {
  background: #ecfdf5;
  color: #059669;
}

.type-pill.phrase {
  background: #eff6ff;
  color: #2563eb;
}

.meta-tag, .ipa-tag {
  font-size: 11px;
  padding: 2px 7px;
  border-radius: 5px;
  background: var(--surface-variant, #f1f5f9);
  color: var(--text-light, #64748b);
}

.ipa-tag {
  font-family: monospace;
}

/* SVG Animation Box */
.svg-container {
  width: 100%;
  aspect-ratio: 16 / 9;
  max-height: 240px;
  background: #0f172a;
  border-radius: 14px;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: inset 0 0 20px rgba(0, 0, 0, 0.4);
}

.svg-container :deep(svg) {
  width: 100%;
  height: 100%;
  display: block;
}

/* Knowledge Card */
.knowledge-card {
  background: var(--white, #fff);
  border-radius: 14px;
  padding: 16px;
  border: 1px solid var(--border, #e2e8f0);
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.04);
}

.term-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 8px;
}

.term-title {
  margin: 0;
  font-size: 20px;
  font-weight: 800;
  color: var(--text, #1e293b);
  word-break: break-word;
}

.audio-actions {
  display: flex;
  align-items: center;
  gap: 6px;
}

.btn-audio {
  background: var(--surface-variant, #f1f5f9);
  border: 1px solid var(--border, #e2e8f0);
  border-radius: 8px;
  padding: 6px 9px;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  color: var(--text, #1e293b);
  font-size: 12px;
  transition: all 0.2s;
}

.btn-audio:hover {
  background: #e2e8f0;
}

.btn-audio.is-speaking,
.btn-audio.is-playing {
  background: #dbeafe;
  border-color: #3b82f6;
  color: #1d4ed8;
  animation: pulse-audio 1.2s infinite;
}

.snippet-label {
  font-weight: 600;
}

.meaning-box {
  margin-bottom: 8px;
}

.meaning-label {
  font-size: 15px;
  font-weight: 600;
  color: var(--green, #10b981);
}

.explanation-box {
  margin-bottom: 12px;
}

.explanation-text {
  margin: 0;
  font-size: 13px;
  color: var(--text-light, #64748b);
  line-height: 1.55;
}

/* Context Card */
.context-card {
  background: var(--surface-variant, #f8fafc);
  border-left: 3px solid var(--green, #10b981);
  border-radius: 6px;
  padding: 10px 12px;
  margin-top: 10px;
}

.context-header {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  font-weight: 700;
  color: var(--text-light, #64748b);
  margin-bottom: 4px;
  text-transform: uppercase;
}

.context-orig {
  margin: 0;
  font-size: 13px;
  color: var(--text, #1e293b);
  line-height: 1.45;
  font-style: italic;
}

.context-trans {
  margin: 4px 0 0;
  font-size: 12px;
  color: var(--text-light, #64748b);
  line-height: 1.4;
}

/* Mastery Buttons */
.vocab-mastery-row {
  display: flex;
  gap: 8px;
  margin-top: 14px;
  padding-top: 12px;
  border-top: 1px dashed var(--border, #e2e8f0);
}

.btn-mastery {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 8px 12px;
  border-radius: 8px;
  border: 1px solid var(--border, #e2e8f0);
  background: var(--surface-variant, #f8fafc);
  color: var(--text, #1e293b);
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-mastery:hover {
  background: #f1f5f9;
}

.btn-mastery.btn-unfamiliar.active {
  background: #fef3c7;
  border-color: #f59e0b;
  color: #b45309;
}

.btn-mastery.btn-mastered.active {
  background: #dcfce7;
  border-color: #10b981;
  color: #047857;
}

.mastery-feedback-toast {
  margin-top: 8px;
  padding: 6px 10px;
  border-radius: 6px;
  background: #0f172a;
  color: #f8fafc;
  font-size: 11px;
  text-align: center;
  animation: fade-in 0.2s ease;
}

/* Footer Controls */
.courseware-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 16px 14px;
  background: var(--white, #fff);
  border-top: 1px solid var(--border, #e2e8f0);
  gap: 10px;
}

.btn-nav {
  flex: 1;
  padding: 10px 14px;
  border-radius: 10px;
  border: 1px solid var(--border, #e2e8f0);
  background: var(--white, #fff);
  color: var(--text, #1e293b);
  font-weight: 600;
  font-size: 13px;
  cursor: pointer;
  transition: all 0.18s;
  text-align: center;
}

.btn-nav:hover:not(:disabled) {
  background: var(--surface-variant, #f1f5f9);
}

.btn-nav:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.btn-nav.btn-next,
.btn-nav.btn-finish {
  background: var(--green, #10b981);
  color: #fff;
  border-color: var(--green, #10b981);
}

.btn-nav.btn-next:hover,
.btn-nav.btn-finish:hover {
  background: #059669;
}

/* Animations */
@keyframes spin {
  to { transform: rotate(360deg); }
}

@keyframes pulse-audio {
  0%, 100% { transform: scale(1); }
  50% { transform: scale(1.05); }
}

@keyframes fade-in {
  from { opacity: 0; transform: translateY(-4px); }
  to { opacity: 1; transform: translateY(0); }
}

/* Modal Fade Transitions */
.courseware-modal-fade-enter-active,
.courseware-modal-fade-leave-active {
  transition: opacity 0.22s ease;
}

.courseware-modal-fade-enter-active .courseware-dialog,
.courseware-modal-fade-leave-active .courseware-dialog {
  transition: transform 0.22s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.22s ease;
}

.courseware-modal-fade-enter-from,
.courseware-modal-fade-leave-to {
  opacity: 0;
}

.courseware-modal-fade-enter-from .courseware-dialog,
.courseware-modal-fade-leave-to .courseware-dialog {
  transform: scale(0.96) translateY(8px);
  opacity: 0;
}
</style>
