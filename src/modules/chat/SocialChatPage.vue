<template>
  <div class="social-chat-view">
    <header class="chat-header">
      <button class="back-btn" @click="goBack">
        <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor" style="pointer-events:none">
          <path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/>
        </svg>
      </button>
      <div class="chat-title-wrap">
        <div class="chat-title">{{ roomTitle }}</div>
        <div class="chat-subtitle">{{ connectionLabel }}</div>
      </div>
    </header>

    <div class="chat-banner">
      <span>{{ bannerText }}</span>
    </div>

    <div ref="messageListEl" class="chat-messages">
      <div v-if="messages.length === 0" class="empty-state">
        {{ emptyText }}
      </div>
      <div
        v-for="(message, index) in messages"
        :key="message.id || index"
        class="message-row"
        :class="message.senderId === userId ? 'mine' : 'theirs'"
      >
        <div class="message-meta">
          <strong>{{ message.senderId === userId ? t("chat.youLabel") : message.senderId }}</strong>
          <span>{{ formatTime(message.createdAt) }}</span>
        </div>
        <div class="message-bubble">{{ message.text }}</div>
      </div>
    </div>

    <div class="chat-input-bar">
      <input
        v-model="inputText"
        class="chat-input"
        :placeholder="t('chat.input')"
        @keydown.enter.prevent="sendMessage"
      />
      <button class="send-btn" :disabled="!canSend" @click="sendMessage">{{ t("chat.send") }}</button>
    </div>
  </div>
</template>

<script setup>
import { computed, nextTick, onMounted, onUnmounted, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useI18n } from "@/shared/i18n";
import { getCurrentUser } from "@/shared/api.js";
import {
  createSocialSocket,
  getSocialConfig,
  getSocialUserId,
  pullOfflineMessages,
  registerSocialUser,
  shouldDisconnectSocialSocketOnHidden,
} from "./socialService.js";

const route = useRoute();
const router = useRouter();
const { t } = useI18n();

const userId = ref("");
const connectionState = ref("connecting");
const inputText = ref("");
const messages = ref([]);
const messageListEl = ref(null);
const socketRef = ref(null);
const mode = computed(() => route.params.mode || "public");
const peerId = computed(() => route.params.peerId || "");
const roomTitle = computed(() => {
  if (mode.value === "direct") {
    return route.query.name || peerId.value || t("chat.directRoom");
  }
  return t("chat.publicGroup");
});
const connectionLabel = computed(() => {
  if (connectionState.value === "connected") return t("chat.connected");
  if (connectionState.value === "error") return t("chat.connectionLost");
  return t("chat.connecting");
});
const bannerText = computed(() => (
  mode.value === "public" ? t("chat.publicBanner") : t("chat.directBanner")
));
const emptyText = computed(() => (
  mode.value === "public" ? t("chat.publicEmpty") : t("chat.directEmpty")
));
const canSend = computed(() => Boolean(inputText.value.trim() && connectionState.value === "connected"));

function goBack() {
  disconnectSocket();
  router.replace({ name: "social-hub" });
}

function formatTime(value) {
  if (!value) return "";
  return new Date(value).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function pushMessage(message) {
  messages.value.push({
    id: message.id || `${message.senderId}-${message.createdAt}-${messages.value.length}`,
    senderId: message.senderId,
    text: message.text,
    createdAt: message.createdAt || new Date().toISOString(),
  });
  nextTick(() => {
    if (messageListEl.value) {
      messageListEl.value.scrollTop = messageListEl.value.scrollHeight;
    }
  });
}

function disconnectSocket() {
  const socket = socketRef.value;
  socketRef.value = null;
  if (socket && socket.readyState < 2) {
    socket.close(1000, "client-background");
  }
}

function handleVisibility() {
  if (document.visibilityState === "hidden" && shouldDisconnectSocialSocketOnHidden()) {
    disconnectSocket();
  }
}

async function connectSocket() {
  const config = await getSocialConfig();
  const socket = createSocialSocket(config, {
    userId: userId.value,
    mode: mode.value,
    peerId: mode.value === "direct" ? peerId.value : "",
    onOpen: () => {
      connectionState.value = "connected";
    },
    onClose: () => {
      connectionState.value = "closed";
    },
    onError: () => {
      connectionState.value = "error";
    },
    onMessage: (payload) => {
      if (payload?.type === "message") {
        pushMessage(payload);
      }
      if (payload?.type === "history") {
        for (const item of payload.items || []) {
          pushMessage(item);
        }
      }
    },
  });
  socketRef.value = socket;
}

async function loadInitialState() {
  const config = await getSocialConfig();
  const user = await getCurrentUser().catch(() => ({}));
  userId.value = await getSocialUserId();
  await registerSocialUser(config, {
    id: userId.value,
    avatar: user?.avatar,
    native_language: user?.native_language,
  });

  if (mode.value === "direct") {
    const offline = await pullOfflineMessages(config, userId.value).catch(() => ({ items: [] }));
    for (const item of offline?.items || []) {
      const isCurrentPeer = item.senderId === peerId.value || item.receiverId === peerId.value;
      if (isCurrentPeer) {
        pushMessage({
          id: item.id,
          senderId: item.senderId,
          text: item.content,
          createdAt: item.createdAt,
        });
      }
    }
  }
}

function sendMessage() {
  const text = inputText.value.trim();
  const socket = socketRef.value;
  if (!text || !socket || socket.readyState !== WebSocket.OPEN) return;

  const payload = {
    type: "message",
    mode: mode.value,
    peerId: mode.value === "direct" ? peerId.value : undefined,
    senderId: userId.value,
    text,
    createdAt: new Date().toISOString(),
  };
  socket.send(JSON.stringify(payload));
  pushMessage(payload);
  inputText.value = "";
}

onMounted(async () => {
  document.addEventListener("visibilitychange", handleVisibility);
  await loadInitialState();
  await connectSocket();
});

onUnmounted(() => {
  document.removeEventListener("visibilitychange", handleVisibility);
  disconnectSocket();
});
</script>

<style scoped>
.social-chat-view {
  position: fixed;
  inset: 0;
  display: flex;
  flex-direction: column;
  background: linear-gradient(180deg, #eef7f2 0%, #f8faf8 45%, #ffffff 100%);
}

.chat-header {
  display: flex;
  gap: 10px;
  align-items: center;
  padding: calc(8px + var(--safe-top)) 14px 10px;
  background: rgba(255, 255, 255, 0.92);
  backdrop-filter: blur(16px);
  border-bottom: 1px solid rgba(22, 45, 33, 0.08);
}

.back-btn {
  border: none;
  background: #fff;
  color: var(--text);
  width: 38px;
  height: 38px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.chat-title-wrap {
  min-width: 0;
}

.chat-title {
  font-size: 16px;
  font-weight: 700;
  color: var(--text);
}

.chat-subtitle {
  margin-top: 2px;
  font-size: 12px;
  color: var(--text-lighter);
}

.chat-banner {
  margin: 12px 14px 0;
  padding: 12px 14px;
  border-radius: 16px;
  background: rgba(81, 173, 124, 0.12);
  color: var(--text);
  font-size: 12px;
  line-height: 1.5;
}

.chat-messages {
  flex: 1;
  overflow-y: auto;
  padding: 16px 14px 12px;
}

.empty-state {
  margin-top: 24px;
  text-align: center;
  color: var(--text-lighter);
  font-size: 13px;
}

.message-row {
  margin-bottom: 12px;
}

.message-meta {
  margin-bottom: 4px;
  font-size: 11px;
  color: var(--text-lighter);
  display: flex;
  gap: 8px;
  align-items: center;
}

.message-bubble {
  display: inline-block;
  max-width: 86%;
  padding: 11px 14px;
  border-radius: 18px;
  font-size: 14px;
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-word;
  box-shadow: 0 6px 18px rgba(0, 0, 0, 0.05);
}

.mine {
  text-align: right;
}

.mine .message-meta {
  justify-content: flex-end;
}

.mine .message-bubble {
  background: var(--green);
  color: #fff;
  border-bottom-right-radius: 6px;
}

.theirs .message-bubble {
  background: #fff;
  color: var(--text);
  border-bottom-left-radius: 6px;
}

.chat-input-bar {
  display: flex;
  gap: 8px;
  padding: 10px 12px calc(10px + var(--safe-bottom));
  background: rgba(255, 255, 255, 0.96);
  border-top: 1px solid rgba(22, 45, 33, 0.08);
}

.chat-input {
  flex: 1;
  border: none;
  border-radius: 20px;
  padding: 12px 14px;
  background: var(--bg);
  font-size: 14px;
  outline: none;
}

.send-btn {
  border: none;
  border-radius: 18px;
  background: var(--green);
  color: #fff;
  min-width: 76px;
  font-weight: 700;
}

.send-btn:disabled {
  opacity: 0.5;
}
</style>
