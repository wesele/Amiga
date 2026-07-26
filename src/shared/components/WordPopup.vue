<template>
  <div
    ref="rootRef"
    class="word-popup-root"
    :class="layout === 'page' ? 'layout-page' : 'layout-popup'"
    @click.self="onOverlayClick"
  >
    <div class="word-popup" :class="{ 'word-popup-page': layout === 'page' }">
      <div class="popup-header">
        <div class="popup-word">{{ word }}</div>
        <button
          v-if="!loading"
          type="button"
          class="act-refresh"
          data-tv-defer-focus
          :disabled="refreshing"
          :title="t('popup.refresh')"
          :aria-label="t('popup.refresh')"
          @click="onRefresh"
        >
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M21 12a9 9 0 1 1-2.64-6.36" />
            <polyline points="21 3 21 9 15 9" />
          </svg>
        </button>
      </div>

      <div class="popup-body" :class="{ 'popup-body--page': isPageStudy }">
        <div v-if="loading" class="popup-loading">
          <div class="mini-spinner" />
          <span>{{ t('popup.translating') }}</span>
        </div>

        <template v-else-if="textTranslation">
          <div
            class="popup-trans"
            :class="{ 'popup-trans--hidden': isTransHidden }"
            :tabindex="isTransHidden ? 0 : undefined"
            data-tv-focus-key="word-reveal"
            @click="isTransHidden ? revealTranslation() : null"
            @keydown.enter.prevent="isTransHidden ? revealTranslation() : null"
            @keydown.space.prevent="isTransHidden ? revealTranslation() : null"
          >
            <template v-if="isTransHidden">
              <span class="trans-placeholder">🙈 {{ t('popup.clickToReveal') }}</span>
            </template>
            <template v-else>
              {{ textTranslation }}
            </template>
          </div>
        </template>

        <template v-else-if="translation">
          <div
            class="popup-trans"
            :class="{ 'popup-trans--hidden': isTransHidden }"
            :tabindex="isTransHidden ? 0 : undefined"
            data-tv-focus-key="word-reveal"
            @click="isTransHidden ? revealTranslation() : null"
            @keydown.enter.prevent="isTransHidden ? revealTranslation() : null"
            @keydown.space.prevent="isTransHidden ? revealTranslation() : null"
          >
            <template v-if="isTransHidden">
              <span class="trans-placeholder">🙈 {{ t('popup.clickToReveal') }}</span>
            </template>
            <template v-else>
              {{ translation.translation }}
            </template>
          </div>
          <div class="popup-extra">
            <span v-if="translation.pos" class="tag-pos">{{ translation.pos }}</span>
            <span v-if="translation.ipa" class="tag-ipa">{{ translation.ipa }}</span>
            <button
              type="button"
              class="act-speak"
              data-tv-defer-focus
              data-tv-focus-key="word-speak"
              :class="{ 'is-speaking': speaking }"
              :title="t('popup.speak')"
              :aria-label="t('popup.speak')"
              @click="onSpeakWord"
            >
              <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true">
                <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1-3.29-2.5-4.03v8.05c1.5-.73 2.5-2.25 2.5-4.02z"/>
                <path d="M14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/>
              </svg>
            </button>
          </div>
          <div v-if="translation.example" class="popup-example">{{ translation.example }}</div>
          <!-- Popup layout: actions live with translation content -->
          <template v-if="!isPageStudy">
            <div v-if="showNav" class="popup-nav-row">
              <button type="button" class="act-nav" :disabled="!canPrev" @click="onPrevClick">{{ t('vocab.prev') }}</button>
              <button type="button" class="act-nav" :disabled="!canNext" @click="onNextClick">{{ t('vocab.next') }}</button>
            </div>
            <div class="popup-actions-row">
              <button v-if="!isTvLayoutMode" class="act-ai-translate" @click="openAiTranslate" :title="t('popup.aiTranslate')">
                🤖
              </button>
              <div class="popup-actions-main">
                <button class="act-known" @click="onKnownClick">✅ {{ t('popup.known') }}</button>
                <button class="act-unknown" @click="onUnknownClick">❌ {{ t('popup.unknown') }}</button>
              </div>
            </div>
          </template>
        </template>

        <div v-else-if="error" class="popup-error">
          {{ error || t('popup.fail') }}
          <template v-if="!isPageStudy">
            <div v-if="showNav" class="popup-nav-row">
              <button type="button" class="act-nav" :disabled="!canPrev" @click="onPrevClick">{{ t('vocab.prev') }}</button>
              <button type="button" class="act-nav" :disabled="!canNext" @click="onNextClick">{{ t('vocab.next') }}</button>
            </div>
            <div v-if="!alwaysShowActions" class="popup-actions">
              <button class="act-known" @click="onKnownClick">✅ {{ t('popup.known') }}</button>
              <button class="act-unknown" @click="onUnknownClick">❌ {{ t('popup.unknown') }}</button>
            </div>
          </template>
        </div>

        <div v-if="alwaysShowActions && !isPageStudy && !loading && !translation" class="popup-actions-block">
          <div v-if="showNav" class="popup-nav-row">
            <button type="button" class="act-nav" :disabled="!canPrev" @click="onPrevClick">{{ t('vocab.prev') }}</button>
            <button type="button" class="act-nav" :disabled="!canNext" @click="onNextClick">{{ t('vocab.next') }}</button>
          </div>
          <div class="popup-actions">
            <button class="act-known" @click="onKnownClick">✅ {{ t('popup.known') }}</button>
            <button class="act-unknown" @click="onUnknownClick">❌ {{ t('popup.unknown') }}</button>
          </div>
        </div>
      </div>

      <!--
        Page study: keep nav/actions mounted across word loads so TV remote focus
        is not stolen by MutationObserver → focusFirst (which prefers act-refresh).
      -->
      <div v-if="isPageStudy" class="page-study-footer">
        <div v-if="showNav" class="popup-nav-row page-study-chrome">
          <button
            type="button"
            class="act-nav"
            :disabled="!canPrev"
            data-tv-focus-key="word-prev"
            :data-tv-preferred-focus="preferredActionFocusKey === 'word-prev' ? true : undefined"
            @click="onPrevClick"
          >{{ t('vocab.prev') }}</button>
          <button
            type="button"
            class="act-nav"
            :disabled="!canNext"
            data-tv-focus-key="word-next"
            :data-tv-preferred-focus="preferredActionFocusKey === 'word-next' ? true : undefined"
            @click="onNextClick"
          >{{ t('vocab.next') }}</button>
        </div>
        <div class="popup-actions-row page-study-chrome">
          <div class="popup-actions-main">
            <button
              class="act-known"
              data-tv-focus-key="word-known"
              :data-tv-preferred-focus="preferredActionFocusKey === 'word-known' ? true : undefined"
              @click="onKnownClick"
            >✅ {{ t('popup.known') }}</button>
            <button
              class="act-unknown"
              data-tv-focus-key="word-unknown"
              :data-tv-preferred-focus="preferredActionFocusKey === 'word-unknown' ? true : undefined"
              @click="onUnknownClick"
            >❌ {{ t('popup.unknown') }}</button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount, computed, watch, nextTick } from "vue";
import { useRouter } from "vue-router";
import { translateText, translateWord } from "@/shared/backend/llm.js";
import { useI18n } from "@/shared/i18n";
import { openAiContact } from "@/shared/aiContact.js";
import { pushInPageBackHandler } from "@/shared/inPageBack.js";
import { isTvLayoutMode } from "@/shared/appMode.js";
import { focusElement } from "@/app/tvRemoteNavigation.js";
import { speakText, stopSpeech } from "@/shared/speechTts.js";
import {
  buildTranslationCacheKey,
  getCachedTranslation,
  setCachedTranslation,
  invalidateTranslationCache,
} from "@/shared/translationCache.js";

const props = defineProps({
  word: { type: String, required: true },
  context: { type: String, default: "" },
  sourceLang: { type: String, default: "es" },
  nativeLang: { type: String, default: "zh" },
  alwaysShowActions: { type: Boolean, default: false },
  mode: { type: String, default: "word" },
  /** "popup" bottom sheet (default) or "page" full study panel */
  layout: { type: String, default: "popup" },
  showNav: { type: Boolean, default: false },
  canPrev: { type: Boolean, default: false },
  canNext: { type: Boolean, default: false },
  /** When false, known/unknown only emit events (parent navigates). */
  closeOnAction: { type: Boolean, default: true },
});

const emit = defineEmits(["close", "known", "unknown", "prev", "next"]);
const router = useRouter();
const { t } = useI18n();

const rootRef = ref(null);
const translation = ref(null);
const textTranslation = ref("");
const loading = ref(true);
const refreshing = ref(false);
const error = ref("");
const speaking = ref(false);
let releaseBackHandler = null;
let loadSeq = 0;
/** TV page-study: last action key — also drives data-tv-preferred-focus for global focusFirst. */
const preferredActionFocusKey = ref("word-known");

const isPageStudy = computed(() => props.layout === "page");
const isTranslationRevealed = ref(false);
const isTransHidden = computed(() => isPageStudy.value && !isTranslationRevealed.value);
const actionPending = ref(false);
let actionTimer = null;

function clearActionTimer() {
  if (actionTimer) {
    clearTimeout(actionTimer);
    actionTimer = null;
  }
  actionPending.value = false;
}

function revealTranslation() {
  isTranslationRevealed.value = true;
}

const cacheKey = computed(() =>
  buildTranslationCacheKey(props.mode, props.word, props.sourceLang, props.nativeLang),
);

function rememberActionFocus(key) {
  if (!isTvLayoutMode || !isPageStudy.value) return;
  preferredActionFocusKey.value = key;
}

async function restoreActionFocus() {
  if (!isTvLayoutMode || !isPageStudy.value) return;
  // Two ticks: wait for Vue to apply loading=false and mount chrome if needed.
  await nextTick();
  await nextTick();
  const root = rootRef.value;
  if (!root) return;
  const keys = [
    preferredActionFocusKey.value,
    "word-known",
    "word-unknown",
    "word-prev",
    "word-next",
  ];
  for (const key of keys) {
    const el = root.querySelector(`[data-tv-focus-key="${key}"]`);
    if (el && !el.disabled) {
      focusElement(el);
      return;
    }
  }
}

async function loadTranslation({ force = false } = {}) {
  clearActionTimer();
  isTranslationRevealed.value = false;
  const seq = ++loadSeq;
  const key = cacheKey.value;
  if (!force) {
    const cached = getCachedTranslation(key);
    if (cached !== undefined) {
      if (seq !== loadSeq) return;
      applyCached(cached);
      loading.value = false;
      refreshing.value = false;
      await restoreActionFocus();
      return;
    }
  } else {
    invalidateTranslationCache(key);
  }

  // Page study keeps action chrome mounted; only the body shows a spinner.
  // Popup still tears down actions (close-on-action UX is short-lived).
  loading.value = true;
  error.value = "";
  if (!isPageStudy.value) {
    translation.value = null;
    textTranslation.value = "";
  } else {
    // Keep previous translation visible under spinner? Better clear body only.
    translation.value = null;
    textTranslation.value = "";
  }

  try {
    if (props.mode === "text") {
      const result = await translateText(props.word, props.sourceLang, props.nativeLang);
      if (seq !== loadSeq) return;
      textTranslation.value = result;
      setCachedTranslation(key, { mode: "text", value: result });
    } else {
      const result = await translateWord(props.word, props.context, props.sourceLang, props.nativeLang);
      if (seq !== loadSeq) return;
      translation.value = result;
      setCachedTranslation(key, { mode: "word", value: result });
    }
  } catch (e) {
    if (seq !== loadSeq) return;
    error.value = t("popup.fail");
  } finally {
    if (seq !== loadSeq) return;
    loading.value = false;
    refreshing.value = false;
    await restoreActionFocus();
  }
}

function applyCached(cached) {
  error.value = "";
  if (cached?.mode === "text") {
    textTranslation.value = cached.value || "";
    translation.value = null;
  } else {
    translation.value = cached?.value || null;
    textTranslation.value = "";
  }
}

async function onRefresh() {
  if (loading.value || refreshing.value) return;
  refreshing.value = true;
  await loadTranslation({ force: true });
}

function onSpeakWord() {
  const text = String(props.word || "").trim();
  if (!text) return;
  if (speaking.value) {
    stopSpeech();
    speaking.value = false;
    return;
  }
  const started = speakText(text, props.sourceLang, {
    onStart: () => {
      speaking.value = true;
    },
    onEnd: () => {
      speaking.value = false;
    },
  });
  if (!started) speaking.value = false;
}

function triggerActionWithReveal(actionType) {
  if (actionPending.value) return;
  rememberActionFocus(`word-${actionType}`);

  const perform = () => {
    emit(actionType);
    if (props.closeOnAction) emitClose();
  };

  if (isTransHidden.value) {
    isTranslationRevealed.value = true;
    actionPending.value = true;
    actionTimer = setTimeout(() => {
      actionPending.value = false;
      actionTimer = null;
      perform();
    }, 500);
  } else {
    perform();
  }
}

function onKnownClick() {
  triggerActionWithReveal("known");
}

function onUnknownClick() {
  triggerActionWithReveal("unknown");
}

function onPrevClick() {
  rememberActionFocus("word-prev");
  emit("prev");
}

function onNextClick() {
  rememberActionFocus("word-next");
  emit("next");
}

function onOverlayClick() {
  if (props.layout === "popup") emit("close");
}

onMounted(async () => {
  // Back / Escape closes the popup instead of leaving the reader page.
  releaseBackHandler = pushInPageBackHandler(() => {
    emit("close");
    return "navigated";
  });
  await loadTranslation({ force: false });
});

onBeforeUnmount(() => {
  clearActionTimer();
  releaseBackHandler?.();
  releaseBackHandler = null;
  stopSpeech();
  speaking.value = false;
});

watch(
  () => [props.word, props.mode, props.sourceLang, props.nativeLang, props.context],
  () => {
    stopSpeech();
    speaking.value = false;
    loadTranslation({ force: false });
  },
);

function emitClose() {
  setTimeout(() => emit("close"), 200);
}

async function openAiTranslate() {
  try {
    await openAiContact(
      router,
      { name: t("chat.translator"), contactType: "translator" },
      { routeName: "learn-translator", targetLang: props.sourceLang, initialMessage: props.word },
    );
    emitClose();
  } catch (e) {
    console.error("Failed to open AI translator:", e);
  }
}
</script>

<style scoped>
.word-popup-root.layout-popup {
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

.word-popup-root.layout-page {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 8px 20px 20px;
  box-sizing: border-box;
}

.word-popup {
  background: var(--surface);
  border-radius: var(--radius-lg) var(--radius-lg) var(--radius-sm) var(--radius-sm);
  padding: 20px 24px;
  width: 100%;
  max-width: 360px;
  box-shadow: var(--shadow-lg);
  animation: slideUp 0.2s cubic-bezier(0.2, 0, 0, 1);
  position: relative;
}

.word-popup-page {
  width: min(640px, 100%);
  max-width: 640px;
  flex: 1 1 auto;
  min-height: 0;
  max-height: 100%;
  border-radius: 20px;
  box-shadow: 0 8px 28px rgba(36, 74, 55, 0.08);
  border: 1px solid var(--border);
  animation: none;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  padding: 28px 28px 22px;
  box-sizing: border-box;
}

.popup-body {
  min-width: 0;
}

.popup-body--page {
  flex: 1 1 auto;
  min-height: 0;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  text-align: center;
  overflow-y: auto;
  padding: 8px 0 16px;
  gap: 6px;
}

.page-study-footer {
  flex-shrink: 0;
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding-top: 4px;
  margin-top: 4px;
}

@keyframes slideUp {
  from { transform: translateY(20px); opacity: 0; }
  to { transform: translateY(0); opacity: 1; }
}

.popup-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 8px;
}

.word-popup-page .popup-header {
  align-items: center;
  justify-content: center;
  position: relative;
  margin-bottom: 0;
  width: 100%;
}

.popup-word {
  font-size: 22px;
  font-weight: 800;
  color: var(--purple);
  flex: 1;
  min-width: 0;
  word-break: break-word;
}

.word-popup-page .popup-word {
  flex: none;
  font-size: clamp(32px, 5.5vw, 52px);
  font-weight: 800;
  letter-spacing: -0.02em;
  line-height: 1.15;
  text-align: center;
  max-width: 100%;
}

.word-popup-page .act-refresh {
  position: absolute;
  right: 0;
  top: 50%;
  transform: translateY(-50%);
  margin: 0;
}

.act-refresh {
  flex-shrink: 0;
  width: 36px;
  height: 36px;
  margin: -6px -8px 0 0;
  border: none;
  border-radius: 50%;
  background: transparent;
  color: var(--text-lighter);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: color var(--transition), background var(--transition);
}

.act-refresh:hover:not(:disabled) {
  color: var(--purple);
  background: var(--surface-variant, rgba(0, 0, 0, 0.04));
}

.act-refresh:disabled {
  opacity: 0.45;
  cursor: default;
}

.popup-loading {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--text-lighter);
  font-size: 13px;
  padding: 8px 0;
  flex: 1;
}

.popup-body--page .popup-loading {
  justify-content: center;
  flex: 0;
  font-size: 15px;
  padding: 24px 0;
}

.mini-spinner {
  width: 16px;
  height: 16px;
  border: 2px solid var(--border);
  border-top-color: var(--purple);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.popup-trans {
  font-size: 16px;
  color: var(--text);
  margin-bottom: 8px;
  line-height: 1.4;
}

.word-popup-page .popup-trans {
  font-size: clamp(20px, 2.6vw, 28px);
  font-weight: 600;
  margin-bottom: 0;
  line-height: 1.35;
  max-width: 36em;
}

.popup-trans.popup-trans--hidden {
  cursor: pointer;
  user-select: none;
  background: var(--surface-variant, rgba(0, 0, 0, 0.04));
  border: 1.5px dashed var(--border, #cbd5e1);
  border-radius: 12px;
  padding: 10px 20px;
  color: var(--text-lighter, #64748b);
  font-size: 16px !important;
  font-weight: 500 !important;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  margin: 4px 0 10px;
}

.popup-trans.popup-trans--hidden:hover {
  background: var(--purple-light, rgba(147, 51, 234, 0.08));
  border-color: var(--purple, #9333ea);
  color: var(--purple, #9333ea);
  transform: translateY(-1px);
}

.popup-trans.popup-trans--hidden:focus-visible {
  outline: 2px solid var(--purple);
  outline-offset: 2px;
}

.trans-placeholder {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.popup-extra {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 12px;
  flex-wrap: wrap;
}

.popup-body--page .popup-extra {
  justify-content: center;
  margin-bottom: 4px;
  margin-top: 12px;
  gap: 12px;
}

.popup-example {
  font-size: 13px;
  line-height: 1.45;
  color: var(--text-light);
  margin: 2px 0 12px;
}

.word-popup-page .popup-example {
  font-size: clamp(15px, 1.8vw, 18px);
  margin: 14px 0 0;
  max-width: 34em;
  line-height: 1.5;
}

.popup-nav-row {
  display: flex;
  gap: 10px;
  margin-top: 12px;
}

.page-study-footer .popup-nav-row {
  margin-top: 0;
}

.page-study-chrome {
  flex-shrink: 0;
}

.page-study-footer .popup-actions-row {
  margin-top: 0;
}

.act-nav {
  flex: 1;
  padding: 10px;
  border-radius: var(--radius-sm);
  border: 1.5px solid var(--border);
  background: var(--surface);
  color: var(--text);
  font-size: 14px;
  font-weight: 700;
  cursor: pointer;
  font-family: inherit;
  transition: background var(--transition), border-color var(--transition), opacity var(--transition);
}

.word-popup-page .act-nav,
.word-popup-page .act-known,
.word-popup-page .act-unknown {
  min-height: 48px;
  font-size: 15px;
  border-radius: 14px;
}

/* Living-room: larger card, type, and remote-friendly controls */
html[data-app-mode="tv"] .word-popup-root.layout-page {
  padding: 12px 32px 28px;
}

html[data-app-mode="tv"] .word-popup-page {
  width: min(760px, 92%);
  max-width: 760px;
  padding: 36px 40px 28px;
  border-radius: 24px;
}

html[data-app-mode="tv"] .word-popup-page .popup-word {
  font-size: clamp(44px, 4.2vw, 64px);
}

html[data-app-mode="tv"] .word-popup-page .popup-trans {
  font-size: clamp(24px, 2.2vw, 32px);
}

html[data-app-mode="tv"] .word-popup-page .popup-example {
  font-size: 18px;
}

html[data-app-mode="tv"] .word-popup-page .act-nav,
html[data-app-mode="tv"] .word-popup-page .act-known,
html[data-app-mode="tv"] .word-popup-page .act-unknown {
  min-height: 56px;
  font-size: 18px;
  border-radius: 16px;
}

html[data-app-mode="tv"] .page-study-footer {
  gap: 14px;
  padding-top: 16px;
}

html[data-app-mode="tv"] .word-popup-page .tag-pos,
html[data-app-mode="tv"] .word-popup-page .tag-ipa {
  font-size: 14px;
  padding: 4px 12px;
}

.act-nav:hover:not(:disabled) {
  background: var(--green-bg);
  border-color: var(--green);
}

.act-nav:disabled {
  opacity: 0.4;
  cursor: default;
}

.popup-actions-row {
  display: flex;
  gap: 10px;
  margin-top: 12px;
  align-items: center;
}

.act-ai-translate {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  border: none;
  background: var(--purple);
  color: #fff;
  font-size: 18px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background var(--transition);
  flex-shrink: 0;
}

.act-ai-translate:hover {
  background: var(--purple-hover);
}

.popup-actions-main {
  flex: 1;
  display: flex;
  gap: 10px;
}

.tag-pos {
  font-size: 12px;
  font-weight: 700;
  font-style: italic;
  padding: 3px 10px;
  border-radius: 999px;
  background: var(--purple-light, rgba(147, 51, 234, 0.1));
  color: var(--purple, #9333ea);
  letter-spacing: 0.02em;
  display: inline-flex;
  align-items: center;
  line-height: 1.2;
}

.word-popup-page .tag-pos {
  font-size: clamp(13px, 1.6vw, 15px);
  padding: 5px 14px;
}

.tag-ipa {
  font-size: 12px;
  font-weight: 500;
  padding: 3px 10px;
  border-radius: 999px;
  background: var(--surface-variant, rgba(0, 0, 0, 0.04));
  color: var(--text-lighter, #64748b);
  border: 1px solid var(--border, #cbd5e1);
  letter-spacing: 0.04em;
  display: inline-flex;
  align-items: center;
  line-height: 1.2;
}

.word-popup-page .tag-ipa {
  font-size: clamp(14px, 1.8vw, 17px);
  padding: 5px 14px;
}

.act-speak {
  flex-shrink: 0;
  width: 28px;
  height: 28px;
  margin: 0;
  padding: 0;
  border: none;
  border-radius: 50%;
  background: var(--purple-bg, rgba(156, 109, 255, 0.12));
  color: var(--purple);
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition: background var(--transition), color var(--transition), transform var(--transition);
  font-family: inherit;
}

.act-speak:hover {
  background: var(--purple);
  color: #fff;
}

.act-speak.is-speaking {
  background: var(--purple);
  color: #fff;
  animation: speakPulse 1s ease-in-out infinite;
}

@keyframes speakPulse {
  0%, 100% { transform: scale(1); }
  50% { transform: scale(1.06); }
}

.popup-body--page .act-speak {
  width: 34px;
  height: 34px;
}

.popup-body--page .act-speak svg {
  width: 18px;
  height: 18px;
}

html[data-app-mode="tv"] .popup-body--page .act-speak {
  width: 40px;
  height: 40px;
}

html[data-app-mode="tv"] .popup-body--page .act-speak svg {
  width: 20px;
  height: 20px;
}

.popup-actions-block {
  margin-top: 4px;
}

.popup-actions {
  display: flex;
  gap: 10px;
  margin-top: 12px;
}

.act-known {
  flex: 1;
  padding: 10px;
  border-radius: var(--radius-sm);
  border: none;
  background: var(--green);
  color: #fff;
  font-size: 14px;
  font-weight: 700;
  cursor: pointer;
  font-family: inherit;
  transition: background var(--transition);
}

.act-known:hover {
  background: var(--green-hover);
}

.act-unknown {
  flex: 1;
  padding: 10px;
  border-radius: var(--radius-sm);
  border: none;
  background: var(--red-bg);
  color: var(--red);
  font-size: 14px;
  font-weight: 700;
  cursor: pointer;
  font-family: inherit;
  transition: background var(--transition);
}

.act-unknown:hover {
  background: var(--red);
  color: #fff;
}

.popup-error {
  color: var(--red);
  font-size: 13px;
  padding: 8px 0;
}
</style>
