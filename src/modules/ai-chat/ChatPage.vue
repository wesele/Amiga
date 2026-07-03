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
        <div class="msg-bubble">
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
} from "@/shared/api.js";
import { loadLearningContext } from "@/shared/learningContext.js";
import { findCurrentSection } from "@/modules/learn/pathResume.js";
import {
  buildFocusArea,
  loadQuestionTypeStats,
  pairStatsKey,
} from "@/modules/learn/questionTypeStats.js";
import { pickChatStarters } from "@/modules/ai-chat/chatStarters.js";
import MarkdownText from "@/shared/components/MarkdownText.vue";
import AmigaIcon from "@/shared/components/AmigaIcon.vue";
import { useI18n } from "@/shared/i18n";
import { useTargetLangStore, TARGET_LANG_CHANGED } from "@/stores/targetLang.js";
import { eventBus } from "@/shared/eventBus.js";
import { displayLang } from "@/shared/constants.js";

const { t, locale } = useI18n();
const route = useRoute();
const router = useRouter();
const targetLangStore = useTargetLangStore();
const amigaIcon = markRaw(AmigaIcon);

function goBack() {
  const parent = route?.meta?.parent;
  if (parent) {
    router.replace({ name: parent });
  } else {
    router.back();
  }
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
const targetLabel = computed(() => displayLang(targetLang.value, locale.value));
const isAmiga = computed(() => contactType.value === "amiga");
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

async function dispatchMessage(text) {
  if (!text || loading.value || !sessionId.value) return;

  messages.value.push({ id: Date.now(), role: "user", content: text });
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
  await dispatchMessage(starterMessage(starter));
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
    chatStarters.value = pickChatStarters({
      currentSection,
      teachingPreview,
      focusArea,
      targetLabel: targetLabel.value,
    });
  } catch {
    chatStarters.value = pickChatStarters({ targetLabel: targetLabel.value });
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
});

onMounted(async () => {
  const vv = getVisualViewport();
  if (vv) {
    cachedViewportHeight = vv.height;
    vv.addEventListener("resize", onViewportResize);
  }
  sessionId.value = route.params.sessionId;

  let learningNativeLang = "zh";
  try {
    const ctx = await loadLearningContext({ targetLangStore });
    targetLang.value = ctx.targetLang || "es";
    learningNativeLang = ctx.nativeLang || "zh";
    nativeLangCode.value = learningNativeLang;
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
.msg-text-plain {
  white-space: pre-wrap;
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
</style>
