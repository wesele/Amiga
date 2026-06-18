<template>
  <div class="chat-view">
    <header class="chat-header">
      <button class="back-btn" @click="$router.push('/interaction')">
        <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor">
          <path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/>
        </svg>
      </button>
      <div class="contact-avatar">{{ contactAvatar }}</div>
      <div class="header-info">
        <div class="header-name">{{ contactName }}</div>
      </div>
      <button class="menu-btn" @click="showMenu = !showMenu">⋯</button>
    </header>
    <div v-if="showMenu" class="menu-overlay" @click="showMenu = false" />
    <transition name="fade">
      <div v-if="showMenu" class="menu-panel">
        <div class="menu-item danger" @click="deleteCurrentSession">删除对话</div>
      </div>
    </transition>

    <div class="chat-messages" ref="msgList">
      <div v-if="messages.length === 0 && contactType === 'amiga'" class="welcome-box">
        <p>你好！我是 Amiga 🤖，你的 AI 语言学习伙伴。</p>
        <p>我们可以用中文聊天，也可以一起练习你想学的语言。</p>
      </div>
      <div v-if="messages.length === 0 && contactType === 'translator'" class="welcome-box">
        <p>你好！我是 AI 翻译 🌐</p>
        <p>输入任何语言的单词或句子，我帮你翻译和解释。</p>
      </div>
      <div
        v-for="(msg, i) in messages"
        :key="msg.id || i"
        class="msg-row"
        :class="msg.role === 'user' ? 'msg-user' : 'msg-other'"
      >
        <div v-if="msg.role !== 'user'" class="msg-avatar">{{ contactAvatar }}</div>
        <div class="msg-bubble">
          <div class="msg-text">{{ msg.content }}</div>
        </div>
        <div v-if="msg.role === 'user'" class="msg-avatar user-avatar">😊</div>
      </div>
      <div v-if="loading" class="msg-row msg-other">
        <div class="msg-avatar">{{ contactAvatar }}</div>
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
        placeholder="输入消息…"
        @keydown.enter.prevent="sendMessage"
        :disabled="loading"
      />
      <button class="send-btn" @click="sendMessage" :disabled="loading || !inputText.trim()">
        <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor">
          <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/>
        </svg>
      </button>
    </div>
  </div>
</template>

<script setup>
import { ref, nextTick, onMounted } from "vue";
import { useRoute, useRouter } from "vue-router";
import {
  getCurrentUser,
  getLearningGoals,
  chatCompletionWithSession,
  getChatMessages,
  deleteChatSession,
} from "@/shared/api.js";

const route = useRoute();
const router = useRouter();

const messages = ref([]);
const inputText = ref("");
const loading = ref(false);
const msgList = ref(null);
const inputEl = ref(null);
const showMenu = ref(false);
const sessionId = ref("");
const contactType = ref("amiga");
const contactName = ref("Amiga");
const contactAvatar = ref("🤖");
const targetLang = ref("es");
const nativeLang = ref("zh");

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

async function sendMessage() {
  const text = inputText.value.trim();
  if (!text || loading.value || !sessionId.value) return;
  inputText.value = "";

  messages.value.push({ id: Date.now(), role: "user", content: text });
  scrollToBottom();

  loading.value = true;
  try {
    const reply = await chatCompletionWithSession(
      sessionId.value,
      text,
      nativeLang.value,
      targetLang.value,
    );
    messages.value.push({ id: Date.now() + 1, role: "assistant", content: reply });
  } catch {
    messages.value.push({ id: Date.now() + 2, role: "assistant", content: "抱歉，我暂时无法回复。请检查网络连接或稍后再试。🙇" });
  }
  loading.value = false;
  scrollToBottom();
  focusInput();
}

async function deleteCurrentSession() {
  showMenu.value = false;
  try {
    await deleteChatSession(sessionId.value);
    router.push("/interaction");
  } catch { /* ignore */ }
}

onMounted(async () => {
  sessionId.value = route.params.sessionId;

  try {
    const user = await getCurrentUser();
    const goals = await getLearningGoals();
    if (goals && goals.length > 0) {
      targetLang.value = goals[0].target_language || "es";
    }
    if (user?.native_language) {
      nativeLang.value = user.native_language;
    }
  } catch { /* use defaults */ }

  // Determine contact type from session list
  try {
    const { getChatSessions } = await import("@/shared/api.js");
    const sessions = await getChatSessions();
    const sess = sessions.find((s) => s.id === sessionId.value);
    if (sess) {
      contactType.value = sess.contact_type;
      if (sess.contact_type === "translator") {
        contactName.value = "AI 翻译";
        contactAvatar.value = "🌐";
      }
    }
  } catch { /* default amiga */ }

  await loadMessages();
  focusInput();
});
</script>

<style scoped>
.chat-view {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
  background: var(--bg);
  position: relative;
}

/* ─── Header ─── */
.chat-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background: var(--white);
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
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
  font-size: 32px;
  line-height: 1;
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
  padding: 16px;
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
  margin: auto 0;
}
.welcome-box p + p {
  margin-top: 8px;
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
  font-size: 28px;
  line-height: 1;
  flex-shrink: 0;
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
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-word;
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
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  padding-bottom: calc(10px + var(--safe-bottom));
  background: var(--white);
  border-top: 1px solid var(--border);
  flex-shrink: 0;
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
  width: 40px;
  height: 40px;
  border: none;
  border-radius: 50%;
  background: var(--green);
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  flex-shrink: 0;
  transition: background var(--transition);
}
.send-btn:disabled {
  background: var(--border);
  cursor: default;
}
.send-btn:not(:disabled):hover {
  background: var(--green-hover);
}
</style>
