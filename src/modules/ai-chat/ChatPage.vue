<template>
  <div class="chat-view" ref="chatView">
    <header class="chat-header">
      <button class="back-btn" @click="goBack">
        <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor" style="pointer-events:none">
          <path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/>
        </svg>
      </button>
      <div class="contact-avatar">
        <component v-if="isAmiga" :is="amigaIcon" :size="32" />
        <span v-else>{{ contactAvatar }}</span>
      </div>
      <div class="header-info">
        <div class="header-name">{{ contactName }}</div>
      </div>
      <button class="menu-btn" @click="showMenu = !showMenu">⋯</button>
    </header>
    <div v-if="showMenu" class="menu-overlay" @click="showMenu = false" />
    <transition name="fade">
      <div v-if="showMenu" class="menu-panel">
        <div class="menu-item danger" @click="deleteCurrentSession">{{ t('chat.deleteChat') }}</div>
      </div>
    </transition>

    <div class="chat-messages" ref="msgList">
      <div v-if="messages.length === 0 && contactType === 'amiga'" class="welcome-area">
        <div class="welcome-box">
          <p>{{ t('chat.welcomeAmiga1') }}</p>
          <p>{{ t('chat.welcomeAmiga2', { target: targetLabel }) }}</p>
        </div>
        <div v-if="startersLoading" class="starter-chips">
          <span v-for="n in 2" :key="n" class="starter-chip skeleton" />
        </div>
        <div v-else-if="chatStarters.length" class="starter-chips">
          <button
            v-for="starter in chatStarters"
            :key="starter.id"
            type="button"
            class="starter-chip"
            :disabled="loading"
            @click="sendStarter(starter)"
          >
            {{ starterLabel(starter) }}
          </button>
        </div>
        <p v-if="wordLearningEnabled" class="tap-to-learn-hint">{{ t("chat.tapToLearnHint") }}</p>
      </div>
      <div v-if="messages.length === 0 && contactType === 'translator'" class="welcome-box">
        <p>{{ t('chat.welcomeTranslator1') }}</p>
        <p>{{ t('chat.welcomeTranslator2') }}</p>
      </div>
      <div
        v-for="(msg, i) in messages"
        :key="msg.id || i"
        class="msg-row"
        :class="msg.role === 'user' ? 'msg-user' : 'msg-other'"
      >
        <div v-if="msg.role !== 'user'" class="msg-avatar">
          <component v-if="isAmiga" :is="amigaIcon" :size="28" />
          <span v-else>{{ contactAvatar }}</span>
        </div>
        <div
          class="msg-bubble"
          :class="{ 'chat-learnable': wordLearningEnabled && msg.role !== 'user' }"
        >
          <MarkdownText v-if="msg.role !== 'user'" class="msg-text" :content="msg.content" />
          <div v-else class="msg-text msg-text-plain">{{ msg.content }}</div>
        </div>
        <div v-if="msg.role === 'user'" class="msg-avatar user-avatar">😊</div>
      </div>
      <div v-if="loading" class="msg-row msg-other">
        <div class="msg-avatar">
          <component v-if="isAmiga" :is="amigaIcon" :size="28" />
          <span v-else>{{ contactAvatar }}</span>
        </div>
        <div class="msg-bubble typing">
          <span class="dot" /><span class="dot" /><span class="dot" />
        </div>
      </div>
    </div>

    <div class="chat-input-bar">
      <input
        ref="inputEl"
        v-model="inputText"
        class="chat-input"
        :placeholder="t('chat.input')"
        @keydown.enter.prevent="sendMessage"
        @focus="onInputFocus"
      />
        <div class="send-btn" :class="{ disabled: loading || !inputText.trim() }" @click="sendMessage">{{ t('chat.send') }}</div>
    </div>
    <div class="chat-safe-bottom" :class="{ 'keyboard-open': keyboardOpen }" aria-hidden="true" />

    <Transition name="popup">
      <WordPopup
        v-if="wordLearningEnabled && selectedWord"
        :word="selectedWord.text"
        :context="selectedWord.context"
        :source-lang="targetLang"
        :native-lang="nativeLangCode"
        @close="closeWordPopup"
        @known="handleWordKnown"
        @unknown="handleWordUnknown"
      />
    </Transition>

    <SelectionTranslateOverlay
      v-if="wordLearningEnabled"
      :selection-text="selectionText"
      :selection-result="selectionResult"
      :selection-loading="selectionLoading"
      :selection-error="selectionError"
      :show-translate-button="showTranslateButton && !showPracticeWrapUp"
      :translate-button-x="translateButtonX"
      :translate-button-y="translateButtonY"
      :translate-label="t('news.translate')"
      :loading-label="t('news.translating')"
      @clear="clearSelection"
      @translate="onTranslateButtonClick"
    />

    <Transition name="popup">
      <div v-if="wordLearningEnabled && wordToast" class="word-toast">{{ wordToast }}</div>
    </Transition>

    <Transition name="popup">
      <div v-if="showPracticeWrapUp" class="practice-wrap-overlay">
        <div class="practice-wrap-sheet">
          <div class="summary-emoji" aria-hidden="true">💬</div>
          <h2>{{ t("chat.practiceWrapUpTitle") }}</h2>
          <p class="summary-stat">
            {{
              t("chat.practiceWrapUpHint", {
                wordCount: practiceWords.length,
                rounds: practiceRoundCount,
              })
            }}
          </p>
          <p v-if="practiceWordsPreview" class="practice-words-preview">
            {{ t("chat.practiceWrapUpWords", { preview: practiceWordsPreview }) }}
          </p>
          <p v-if="learnedWordsPreview" class="practice-words-preview learned-words-preview">
            {{
              t("chat.practiceLearnedWords", {
                n: learnedWordsThisSession.length,
                preview: learnedWordsPreview,
              })
            }}
          </p>
          <section v-if="practicePlan" class="next-steps-panel">
            <p class="next-steps-eyebrow">{{ t("path.nextStep.title") }}</p>
            <div class="next-steps-primary">
              <span class="next-steps-icon" aria-hidden="true">{{ practicePlan.primary.icon }}</span>
              <div class="next-steps-copy">
                <p class="next-steps-primary-title">{{ stepTitle(practicePlan.primary) }}</p>
                <p
                  v-if="practicePlan.primary.subtitleKey"
                  class="next-steps-primary-sub"
                >
                  {{ stepSubtitle(practicePlan.primary) }}
                </p>
              </div>
            </div>
            <div v-if="practicePlan.secondary.length" class="next-steps-queue">
              <p class="next-steps-queue-title">
                {{ t("path.nextStep.queueTitle", { n: practicePlan.secondary.length }) }}
              </p>
              <button
                v-for="step in practicePlan.secondary"
                :key="step.id"
                type="button"
                class="next-steps-queue-item"
                :disabled="!step.route"
                @click="goToPracticeStep(step)"
              >
                <span class="next-steps-queue-icon" aria-hidden="true">{{ step.icon }}</span>
                <div class="next-steps-queue-copy">
                  <p class="next-steps-queue-item-title">{{ stepTitle(step) }}</p>
                  <p v-if="step.subtitleKey" class="next-steps-queue-item-sub">
                    {{ stepSubtitle(step) }}
                  </p>
                </div>
              </button>
            </div>
          </section>
          <div v-if="practicePlan" class="summary-actions">
            <button type="button" class="action-btn primary" @click="goToPracticeStep(practicePlan.primary)">
              {{ stepContinueLabel(practicePlan.primary) }}
            </button>
            <button type="button" class="action-btn secondary" @click="exitAfterPractice">
              {{ t("chat.practiceWrapUpLater") }}
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </div>
</template>

<script setup>
import { ref, nextTick, onMounted, onUnmounted, computed, markRaw } from "vue";
import { useRoute, useRouter } from "vue-router";
import {
  chatCompletionWithSession,
  getChatMessages,
  deleteChatSession,
  getPathCurriculum,
  getTeachingContent,
  translateText,
} from "@/shared/api.js";
import { loadLearningContext } from "@/shared/learningContext.js";
import { findCurrentSection } from "@/modules/learn/pathResume.js";
import {
  buildFocusArea,
  loadQuestionTypeStats,
  pairStatsKey,
} from "@/modules/learn/questionTypeStats.js";
import { buildReviewedWordsStarter, pickChatStarters } from "@/modules/ai-chat/chatStarters.js";
import {
  defaultExitRouteAfterPractice,
  formatLearnedWordsPreview,
  isGuidedAiPractice,
  mergePracticeWords,
  parsePracticeSource,
  parsePracticeWords,
  shouldShowPracticeWrapUp,
  trackChatLearnedWord,
} from "@/modules/ai-chat/aiPracticeSession.js";
import { buildPostAiPracticePlan } from "@/modules/ai-chat/postAiPracticePlan.js";
import { loadPostAiPracticeContext } from "@/modules/ai-chat/postAiPracticeContext.js";
import { useSelectionTranslation } from "@/modules/news/selectionTranslation.js";
import { useWordLearning } from "@/shared/composables/useWordLearning.js";
import MarkdownText from "@/shared/components/MarkdownText.vue";
import AmigaIcon from "@/shared/components/AmigaIcon.vue";
import WordPopup from "@/shared/components/WordPopup.vue";
import SelectionTranslateOverlay from "@/shared/components/SelectionTranslateOverlay.vue";
import { useI18n } from "@/shared/i18n";
import { useTargetLangStore, TARGET_LANG_CHANGED } from "@/stores/targetLang.js";
import { eventBus } from "@/shared/eventBus.js";
import { displayLang } from "@/shared/constants.js";

const { t, locale } = useI18n();
const route = useRoute();
const router = useRouter();
const targetLangStore = useTargetLangStore();
const amigaIcon = markRaw(AmigaIcon);

const showPracticeWrapUp = ref(false);
const practicePlan = ref(null);
const practicePlanLoading = ref(false);
const userMessageCount = ref(0);
const usedStarter = ref(false);
const practiceRoundCount = ref(0);
const learnedWordsThisSession = ref([]);
const practiceWords = computed(() =>
  mergePracticeWords(parsePracticeWords(route), learnedWordsThisSession.value),
);
const practiceSource = computed(() => parsePracticeSource(route));
const practiceWordsPreview = computed(() => practiceWords.value.slice(0, 3).join(", "));
const learnedWordsPreview = computed(() =>
  formatLearnedWordsPreview(learnedWordsThisSession.value),
);
const isGuidedPractice = computed(() => isGuidedAiPractice(route));

function parseReturnRoute() {
  const raw = route.query?.returnRoute;
  if (!raw || typeof raw !== "string") return null;
  try {
    const parsed = JSON.parse(raw);
    return parsed?.name ? parsed : null;
  } catch {
    return null;
  }
}

function navigateAway(target) {
  if (target?.name) {
    router.replace(target);
    return;
  }
  const parent = route?.meta?.parent;
  if (parent) {
    router.replace({ name: parent });
  } else {
    router.back();
  }
}

function exitAfterPractice() {
  showPracticeWrapUp.value = false;
  navigateAway(defaultExitRouteAfterPractice(practiceSource.value, parseReturnRoute()));
}

async function openPracticeWrapUp() {
  if (practicePlanLoading.value) return;
  practicePlanLoading.value = true;
  try {
    const planCtx = await loadPostAiPracticeContext({ targetLangStore });
    practicePlan.value = buildPostAiPracticePlan({
      source: practiceSource.value,
      practiceWords: practiceWords.value,
      sessionLearnedWords: learnedWordsThisSession.value,
      ...planCtx,
    });
    showPracticeWrapUp.value = true;
  } catch {
    exitAfterPractice();
  } finally {
    practicePlanLoading.value = false;
  }
}

function goBack() {
  if (
    isGuidedPractice.value &&
    shouldShowPracticeWrapUp({
      userMessageCount: userMessageCount.value,
      usedStarter: usedStarter.value,
    })
  ) {
    void openPracticeWrapUp();
    return;
  }
  navigateAway(defaultExitRouteAfterPractice(practiceSource.value, parseReturnRoute()));
}

function stepTitle(step) {
  if (!step?.titleKey) return "";
  return t(step.titleKey, step.titleParams ?? {});
}

function stepSubtitle(step) {
  if (!step?.subtitleKey) return "";
  return t(step.subtitleKey, step.subtitleParams ?? {});
}

function stepContinueLabel(step) {
  if (!step?.continueKey) return t("chat.practiceWrapUpLater");
  return t(step.continueKey, step.continueParams ?? {});
}

function goToPracticeStep(step) {
  if (!step?.route) return;
  showPracticeWrapUp.value = false;
  router.replace(step.route);
}

const messages = ref([]);
const inputText = ref("");
const loading = ref(false);
const msgList = ref(null);
const inputEl = ref(null);
const chatView = ref(null);
const showMenu = ref(false);
const sessionId = ref("");
const contactType = ref("amiga");
const contactName = ref("Amiga");
const contactAvatar = ref("🌐");
const targetLang = ref("es");
const nativeLangCode = ref("zh");
const userId = ref("");
const targetLabel = computed(() => displayLang(targetLang.value, locale.value));
const isAmiga = computed(() => contactType.value === "amiga");
const wordLearningEnabled = computed(
  () => isAmiga.value && !showPracticeWrapUp.value,
);

const {
  selectedWord,
  wordToast,
  openWordPopup,
  closeWordPopup,
  handleWordKnown,
  handleWordUnknown,
  cleanup: cleanupWordLearning,
} = useWordLearning({
  getTargetLang: () => targetLang.value,
  getUserId: () => userId.value,
  source: "ai_chat",
  t,
  knownToastKey: "chat.wordKnown",
  unknownToastKey: "chat.wordSaved",
  onWordMarkedUnknown: (word) => {
    learnedWordsThisSession.value = trackChatLearnedWord(learnedWordsThisSession.value, word);
  },
});

function isChatSelectionAllowed(selection) {
  if (!selection || selection.rangeCount === 0) return false;
  const range = selection.getRangeAt(0);
  const node = range.commonAncestorContainer;
  const element = node.nodeType === Node.TEXT_NODE ? node.parentElement : node;
  return Boolean(element?.closest?.(".chat-learnable"));
}

function selectionContextFromRange(selection) {
  if (!selection || selection.rangeCount === 0) return "";
  const range = selection.getRangeAt(0);
  const node = range.commonAncestorContainer;
  const element = node.nodeType === Node.TEXT_NODE ? node.parentElement : node;
  return element?.closest?.(".chat-learnable")?.textContent?.trim() ?? "";
}

function onSingleWordSelected(text) {
  const selection = window.getSelection?.();
  openWordPopup(text, selectionContextFromRange(selection));
}

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
  getTargetLang: () => targetLang.value,
  getNativeLang: () => nativeLangCode.value,
  t,
  isSelectionAllowed: isChatSelectionAllowed,
  onSingleWordSelected,
});
const keyboardOpen = ref(false);
const startersLoading = ref(false);
const chatStarters = ref([]);
let cachedViewportHeight = 0;
let syncRaf = null;
let unsubscribe = null;

function getVisualViewport() {
  return typeof window === "undefined" ? null : window.visualViewport || null;
}

function startSync() {
  stopSync();
  const vv = getVisualViewport();
  if (!vv || !chatView.value) return;
  function tick() {
    if (!chatView.value) return;
    const v = chatView.value;
    v.style.top = `${vv.offsetTop}px`;
    v.style.height = `${vv.height}px`;
    syncRaf = requestAnimationFrame(tick);
  }
  tick();
}

function stopSync({ reset = false } = {}) {
  if (syncRaf) {
    cancelAnimationFrame(syncRaf);
    syncRaf = null;
  }
  if (reset && chatView.value) {
    chatView.value.style.top = "";
    chatView.value.style.height = "";
  }
}

function onViewportResize() {
  const vv = getVisualViewport();
  if (!vv) return;
  const diff = cachedViewportHeight - vv.height;
  if (diff > 80) {
    keyboardOpen.value = true;
    startSync();
    scrollToBottom();
  } else {
    cachedViewportHeight = vv.height;
    keyboardOpen.value = false;
    stopSync({ reset: true });
  }
}

function onInputFocus() {
  scrollToBottom();
}

function scrollToBottom() {
  nextTick(() => {
    if (msgList.value) msgList.value.scrollTop = msgList.value.scrollHeight;
  });
}

function focusInput() {
  nextTick(() => {
    inputEl.value?.focus();
  });
}

async function loadMessages() {
  if (!sessionId.value) return;
  try {
    messages.value = await getChatMessages(sessionId.value, 50);
    scrollToBottom();
  } catch { /* empty */ }
}

function starterLabel(starter) {
  const params = { ...(starter.labelParams ?? {}) };
  if (params.typeKey) {
    params.type = t(params.typeKey);
    delete params.typeKey;
  }
  return t(starter.labelKey, params);
}

function starterMessage(starter) {
  const params = { ...(starter.messageParams ?? {}) };
  if (params.typeKey) {
    params.type = t(params.typeKey);
    delete params.typeKey;
  }
  return t(starter.messageKey, params);
}

async function dispatchMessage(text, { fromStarter = false } = {}) {
  if (!text || loading.value || !sessionId.value) return;

  messages.value.push({ id: Date.now(), role: "user", content: text });
  userMessageCount.value += 1;
  if (fromStarter) usedStarter.value = true;
  scrollToBottom();

  loading.value = true;
  try {
    const reply = await chatCompletionWithSession(
      sessionId.value,
      text,
      nativeLangCode.value,
      targetLang.value,
    );
    messages.value.push({ id: Date.now() + 1, role: "assistant", content: reply });
    practiceRoundCount.value += 1;
  } catch {
    messages.value.push({ id: Date.now() + 2, role: "assistant", content: t("chat.replyFail") });
  }
  loading.value = false;
  scrollToBottom();
  focusInput();
}

async function sendMessage() {
  focusInput();
  const text = inputText.value.trim();
  if (!text) return;
  inputText.value = "";
  await dispatchMessage(text);
}

async function sendStarter(starter) {
  focusInput();
  await dispatchMessage(starterMessage(starter), { fromStarter: true });
}

function applyReviewedWordsStarter(starters) {
  if (route.query.starterId !== "reviewed-words" || !route.query.words) {
    return starters;
  }
  const words = String(route.query.words)
    .split(",")
    .map((word) => word.trim())
    .filter(Boolean);
  const reviewedStarter = buildReviewedWordsStarter(words);
  if (!reviewedStarter) return starters;
  return [reviewedStarter, ...starters.filter((starter) => starter.id !== "reviewed-words")].slice(
    0,
    3,
  );
}

async function loadChatStarters(nativeLangCode, langCode, cefr) {
  startersLoading.value = true;
  chatStarters.value = [];
  try {
    const curriculum = await getPathCurriculum(nativeLangCode, langCode, cefr);
    const currentSection = findCurrentSection(curriculum);
    let teachingPreview = null;
    if (
      currentSection &&
      (currentSection.section.kind === "grammar" || currentSection.section.kind === "vocab")
    ) {
      try {
        teachingPreview = await getTeachingContent(
          nativeLangCode,
          langCode,
          cefr,
          currentSection.section.id,
        );
      } catch {
        teachingPreview = null;
      }
    }
    const stats = loadQuestionTypeStats(pairStatsKey(nativeLangCode, langCode));
    const focusArea = buildFocusArea(stats);
    chatStarters.value = applyReviewedWordsStarter(
      pickChatStarters({
        currentSection,
        teachingPreview,
        focusArea,
        targetLabel: targetLabel.value,
      }),
    );
  } catch {
    chatStarters.value = applyReviewedWordsStarter(
      pickChatStarters({ targetLabel: targetLabel.value }),
    );
  } finally {
    startersLoading.value = false;
  }
}

async function deleteCurrentSession() {
  showMenu.value = false;
  try {
    await deleteChatSession(sessionId.value);
    router.replace({ name: "chat" });
  } catch { /* ignore */ }
}

onUnmounted(() => {
  const vv = getVisualViewport();
  stopSync({ reset: true });
  if (unsubscribe) unsubscribe();
  if (vv) {
    vv.removeEventListener("resize", onViewportResize);
  }
  document.removeEventListener("selectionchange", onSelectionChange);
  document.removeEventListener("pointerup", onPointerUp);
  if (window.__amigaTranslateSelection === handleNativeTranslate) {
    delete window.__amigaTranslateSelection;
  }
  cleanupSelectionTranslation();
  cleanupWordLearning();
});

onMounted(async () => {
  const vv = getVisualViewport();
  if (vv) {
    cachedViewportHeight = vv.height;
    vv.addEventListener("resize", onViewportResize);
  }
  sessionId.value = route.params.sessionId;
  document.addEventListener("selectionchange", onSelectionChange);
  document.addEventListener("pointerup", onPointerUp);
  window.__amigaTranslateSelection = handleNativeTranslate;

  let learningNativeLang = "zh";
  try {
    const ctx = await loadLearningContext({ targetLangStore });
    targetLang.value = ctx.targetLang || "es";
    learningNativeLang = ctx.nativeLang || "zh";
    nativeLangCode.value = learningNativeLang;
    userId.value = ctx.user?.id ?? "";
    await loadChatStarters(ctx.nativeLang, ctx.targetLang, ctx.cefr);
  } catch {
    targetLang.value = (await targetLangStore.load()) || "es";
    await loadChatStarters(learningNativeLang, targetLang.value, "A1");
  }

  // Determine contact type from session list. Sessions are isolated by
  // (user, target_language, contact_type) (see chat.rs::get_sessions),
  // so we must scope the lookup to the current targetLang — otherwise
  // the query runs with target_language = '' and returns nothing,
  // causing the header to silently fall back to the amiga defaults
  // even when the user opened the translator contact.
  try {
    const { getChatSessions } = await import("@/shared/api.js");
    const sessions = await getChatSessions(targetLang.value);
    const sess = sessions.find((s) => s.id === sessionId.value);
    if (sess) {
      contactType.value = sess.contact_type;
      if (sess.contact_type === "translator") {
        contactName.value = t("chat.translator");
        contactAvatar.value = "🌐";
      }
    }
  } catch { /* default amiga */ }

  // The ongoing conversation keeps its history; subsequent messages use
  // the freshly selected target language.
  unsubscribe = eventBus.on(TARGET_LANG_CHANGED, async (newCode) => {
    targetLang.value = newCode || "es";
    try {
      const ctx = await loadLearningContext({ targetLangStore });
      await loadChatStarters(ctx.nativeLang, ctx.targetLang, ctx.cefr);
    } catch {
      await loadChatStarters(learningNativeLang, targetLang.value, "A1");
    }
  });

  await loadMessages();
  focusInput();
});
</script>

<style scoped>
.chat-view {
  position: fixed;
  inset: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: var(--bg);
  box-sizing: border-box;
  overscroll-behavior: none;
}

/* ─── Header ─── */
.chat-header {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: calc(8px + var(--safe-top)) 12px 8px;
  background: var(--white);
  border-bottom: 1px solid var(--border);
}
.back-btn {
  background: none;
  border: none;
  color: var(--text);
  cursor: pointer;
  padding: 4px;
  display: flex;
  border-radius: 6px;
}
.back-btn:hover {
  background: var(--bg);
}
.contact-avatar {
  line-height: 1;
  display: flex;
  align-items: center;
  justify-content: center;
}
.header-info {
  flex: 1;
}
.header-name {
  font-weight: 700;
  font-size: 16px;
  color: var(--text);
}
.menu-btn {
  background: none;
  border: none;
  color: var(--text);
  font-size: 20px;
  cursor: pointer;
  padding: 4px 8px;
}
.menu-overlay {
  position: absolute;
  inset: 0;
  z-index: 10;
  background: transparent;
}
.menu-panel {
  position: absolute;
  top: 56px;
  right: 12px;
  background: var(--white);
  border-radius: var(--radius);
  box-shadow: 0 4px 12px rgba(0,0,0,.12);
  z-index: 11;
  overflow: hidden;
}
.menu-item {
  padding: 12px 20px;
  font-size: 14px;
  cursor: pointer;
  white-space: nowrap;
}
.menu-item.danger {
  color: var(--red, #f44336);
}
.menu-item:hover {
  background: var(--bg);
}
.fade-enter-active, .fade-leave-active {
  transition: opacity .15s ease;
}
.fade-enter-from, .fade-leave-to {
  opacity: 0;
}

/* ─── Messages ─── */
.chat-messages {
  flex: 1;
  overflow-y: auto;
  padding: 12px 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.welcome-area {
  margin: auto 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.welcome-box {
  background: var(--green-bg);
  border-radius: var(--radius);
  padding: 20px;
  font-size: 14px;
  line-height: 1.7;
  color: var(--text);
  text-align: center;
}
.welcome-box p + p {
  margin-top: 8px;
}
.starter-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  justify-content: center;
}
.starter-chip {
  border: 1px solid var(--green);
  background: var(--white);
  color: var(--green);
  border-radius: 20px;
  padding: 8px 14px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: background var(--transition), color var(--transition);
}
.starter-chip:hover:not(:disabled) {
  background: var(--green-bg);
}
.starter-chip:disabled {
  opacity: 0.6;
  cursor: default;
}
.starter-chip.skeleton {
  width: 120px;
  height: 34px;
  border-color: var(--border);
  background: linear-gradient(90deg, var(--bg) 25%, var(--white) 50%, var(--bg) 75%);
  background-size: 200% 100%;
  animation: shimmer 1.2s infinite;
  cursor: default;
}
@keyframes shimmer {
  0% { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}

.msg-row {
  display: flex;
  align-items: flex-end;
  gap: 8px;
  max-width: 85%;
}
.msg-user {
  align-self: flex-end;
}
.msg-other {
  align-self: flex-start;
}

.msg-avatar {
  line-height: 1;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}
.user-avatar {
  font-size: 28px;
}

.msg-bubble {
  background: var(--white);
  border-radius: 16px 16px 16px 4px;
  padding: 10px 14px;
  box-shadow: 0 1px 3px rgba(0,0,0,.06);
}
.msg-user .msg-bubble {
  background: var(--green);
  color: #fff;
  border-radius: 16px 16px 4px 16px;
}
.msg-text {
  font-size: 14px;
  line-height: 1.5;
  word-break: break-word;
}
.chat-learnable,
.chat-learnable :deep(*) {
  user-select: text;
  -webkit-user-select: text;
}
.msg-text-plain {
  white-space: pre-wrap;
}
.tap-to-learn-hint {
  text-align: center;
  font-size: 12px;
  color: var(--text-secondary);
  line-height: 1.5;
}
.word-toast {
  position: fixed;
  left: 50%;
  bottom: calc(88px + var(--safe-bottom, env(safe-area-inset-bottom, 0px)));
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
.learned-words-preview {
  color: var(--green);
}

.typing {
  display: flex;
  gap: 4px;
  padding: 14px 18px;
}
.dot {
  width: 8px;
  height: 8px;
  background: var(--text-lighter);
  border-radius: 50%;
  animation: bounce 1.4s infinite ease-in-out both;
}
.dot:nth-child(1) { animation-delay: -0.32s; }
.dot:nth-child(2) { animation-delay: -0.16s; }
.dot:nth-child(3) { animation-delay: 0s; }
@keyframes bounce {
  0%, 80%, 100% { transform: scale(0); }
  40% { transform: scale(1); }
}

/* ─── Input bar ─── */
.chat-input-bar {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px 10px;
  background: var(--white);
  border-top: 1px solid var(--border);
}
.chat-input {
  flex: 1;
  border: none;
  background: var(--bg);
  border-radius: 20px;
  padding: 10px 16px;
  font-size: 14px;
  outline: none;
  color: var(--text);
}
.chat-input::placeholder {
  color: var(--text-lighter);
}
.chat-input:disabled {
  opacity: 0.5;
}
.send-btn {
  flex-shrink: 0;
  border: none;
  border-radius: 20px;
  background: var(--green);
  color: #fff;
  font-size: 14px;
  font-weight: 600;
  padding: 8px 16px;
  cursor: pointer;
  transition: background var(--transition);
}
.send-btn.disabled {
  background: var(--border);
  pointer-events: none;
}
.send-btn:not(.disabled):hover {
  background: var(--green-hover);
}

/* System nav bar / home indicator — chat hides the shell bottom-nav,
 * so this fixed full-screen view must reserve safe-bottom itself. */
.chat-safe-bottom {
  flex-shrink: 0;
  height: var(--safe-bottom, env(safe-area-inset-bottom, 0px));
  background: var(--white);
}
/* visualViewport sync already shrinks the chat view above the IME;
   including --safe-bottom (which tracks IME height on Android) would
   push the input bar up a second time. */
.chat-safe-bottom.keyboard-open {
  height: 0;
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

.practice-wrap-overlay {
  position: fixed;
  inset: 0;
  z-index: 700;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  background: rgba(0, 0, 0, 0.45);
  padding: 20px;
  padding-bottom: calc(20px + var(--safe-bottom, env(safe-area-inset-bottom, 0px)));
}

.practice-wrap-sheet {
  width: 100%;
  max-width: 400px;
  padding: 28px 24px 24px;
  background: var(--surface, var(--white));
  border-radius: var(--radius-lg) var(--radius-lg) var(--radius-md) var(--radius-md);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.16);
  text-align: center;
}

.practice-wrap-sheet h2 {
  margin: 0;
  font-size: 22px;
}

.summary-emoji {
  font-size: 40px;
  line-height: 1;
  margin-bottom: 8px;
}

.summary-stat {
  margin: 12px 0 0;
  font-size: 14px;
  color: var(--text-light);
  line-height: 1.45;
}

.practice-words-preview {
  margin: 8px 0 0;
  font-size: 13px;
  color: var(--text-lighter);
  line-height: 1.4;
}

.next-steps-panel {
  width: 100%;
  margin: 12px 0 0;
  padding: 14px 16px 16px;
  background: linear-gradient(135deg, #e8f8ef 0%, #d4f5e0 100%);
  border: 1px solid var(--green);
  border-radius: var(--radius-md);
  text-align: left;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
}

.next-steps-eyebrow {
  margin: 0;
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--green-hover);
}

.next-steps-primary {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  margin-top: 8px;
}

.next-steps-icon {
  font-size: 28px;
  line-height: 1;
  flex-shrink: 0;
}

.next-steps-copy {
  flex: 1;
  min-width: 0;
}

.next-steps-primary-title {
  margin: 0;
  font-size: 17px;
  font-weight: 700;
  color: var(--text);
  line-height: 1.3;
}

.next-steps-primary-sub {
  margin: 4px 0 0;
  font-size: 13px;
  color: var(--text-light);
  line-height: 1.4;
}

.next-steps-queue {
  margin-top: 14px;
  padding-top: 12px;
  border-top: 1px solid rgba(88, 204, 2, 0.25);
}

.next-steps-queue-title {
  margin: 0 0 8px;
  font-size: 12px;
  font-weight: 700;
  color: var(--text-light);
}

.next-steps-queue-item {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  width: 100%;
  margin: 0;
  padding: 10px 0;
  border: none;
  background: transparent;
  text-align: left;
  cursor: pointer;
}

.next-steps-queue-item:disabled {
  opacity: 0.5;
  cursor: default;
}

.next-steps-queue-icon {
  font-size: 20px;
  line-height: 1;
  flex-shrink: 0;
}

.next-steps-queue-copy {
  flex: 1;
  min-width: 0;
}

.next-steps-queue-item-title {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  color: var(--text);
}

.next-steps-queue-item-sub {
  margin: 2px 0 0;
  font-size: 12px;
  color: var(--text-light);
}

.summary-actions {
  display: flex;
  flex-direction: column;
  gap: 10px;
  width: 100%;
  max-width: 280px;
  margin: 16px auto 0;
}

.action-btn {
  flex: 1;
  padding: 14px 16px;
  border: none;
  border-radius: 12px;
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
}

.action-btn.primary {
  background: var(--primary, var(--green));
  color: #fff;
}

.action-btn.secondary {
  background: var(--bg);
  color: var(--text);
}
</style>
