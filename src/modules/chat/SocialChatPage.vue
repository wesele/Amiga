<template>
  <div class="chat-view" ref="chatView">
    <header class="chat-header">
      <button class="back-btn" @click="goBack">
        <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor" style="pointer-events:none">
          <path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/>
        </svg>
      </button>
      <div class="contact-avatar">
        <GroupChatIcon v-if="mode === 'public'" :size="32" />
        <AvatarEmoji v-else :value="peerAvatar" :size="32" />
      </div>
      <div class="header-info">
        <div class="header-name">{{ roomTitle }}</div>
      </div>
      <button class="menu-btn" @click="showMenu = !showMenu">⋯</button>
    </header>
    <div v-if="showMenu" class="menu-overlay" @click="showMenu = false" />
    <transition name="fade">
      <div v-if="showMenu" class="menu-panel">
        <div class="menu-item danger" @click="deleteCurrentChat">{{ t("chat.deleteChat") }}</div>
      </div>
    </transition>

    <div ref="messageListEl" class="chat-messages">
      <div v-if="messages.length === 0" class="welcome-box">
        {{ emptyText }}
      </div>
      <div
        v-for="(message, index) in messages"
        :key="message.id || index"
        class="msg-row"
        :class="message.senderId === userId ? 'msg-user' : 'msg-other'"
      >
        <div v-if="message.senderId !== userId" class="msg-avatar">
          <AvatarEmoji :value="avatarForSender(message.senderId, message.senderAvatar)" :size="28" />
        </div>
        <div class="msg-bubble">
          <div v-if="mode === 'public' && message.senderId !== userId" class="msg-sender">
            {{ message.senderId }}
          </div>
          <div class="msg-text msg-text-plain">{{ message.text }}</div>
        </div>
        <div v-if="message.senderId === userId" class="msg-avatar user-avatar">
          <AvatarEmoji :value="selfAvatar" :size="28" />
        </div>
      </div>
    </div>

    <div class="chat-input-bar">
      <input
        v-model="inputText"
        class="chat-input"
        :placeholder="t('chat.input')"
        @keydown.enter.prevent="handleEnter"
      />
      <div class="send-btn" :class="{ disabled: !canSend }" @click="sendMessage">{{ t("chat.send") }}</div>
    </div>
    <div v-if="sendError" class="chat-send-error">{{ sendError }}</div>
  </div>
</template>

<script setup>
import { computed, markRaw, nextTick, onMounted, onUnmounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useI18n } from "@/shared/i18n";
import { getCurrentUser } from "@/shared/api.js";
import AvatarEmoji from "@/shared/components/AvatarEmoji.vue";
import GroupChatIcon from "@/shared/components/GroupChatIcon.vue";
import {
  createSocialSocket,
  getSocialConfig,
  getSocialUserAvatars,
  getSocialUserId,
  pullOfflineMessages,
  registerSocialUser,
  shouldDisconnectSocialSocketOnHidden,
} from "./socialService.js";
import {
  getCachedSocialAvatar,
  rememberSocialAvatar,
  rememberSocialAvatars,
} from "./socialAvatars.js";
import {
  clearSocialMessages,
  getSocialMessages,
  mergeSocialMessages,
  saveSocialMessages,
} from "./socialMessages.js";
import {
  clearSocialPreview,
  clearSocialUnread,
  getSocialContactKey,
  updateSocialPreview,
} from "./socialPreview.js";

const route = useRoute();
const router = useRouter();
const { t } = useI18n();

const userId = ref("");
const selfAvatar = ref("😊");
const peerAvatar = ref("😊");
const connectionState = ref("connecting");
const inputText = ref("");
const messages = ref([]);
const messageListEl = ref(null);
const socketRef = ref(null);
const reconnectAttempt = ref(0);
const reconnectTimer = ref(null);
const sendError = ref("");
const initialised = ref(false);
const showMenu = ref(false);
const mode = computed(() => route.params.mode || "public");
const peerId = computed(() => route.params.peerId || "");
const roomTitle = computed(() => {
  if (mode.value === "direct") {
    return route.query.name || peerId.value || t("chat.directRoom");
  }
  return t("chat.publicGroup");
});
const emptyText = computed(() => (
  mode.value === "public" ? t("chat.publicEmpty") : t("chat.directEmpty")
));
const canSend = computed(() => Boolean(inputText.value.trim() && connectionState.value === "connected"));
const previewContactKey = computed(() => (
  getSocialContactKey(
    mode.value === "public" ? "social-public" : "social-direct",
    peerId.value,
  )
));

function avatarForSender(senderId, senderAvatar = "") {
  if (senderAvatar) return senderAvatar;
  return getCachedSocialAvatar(senderId, "😊");
}

function goBack() {
  disconnectSocket();
  const parent = route?.meta?.parent;
  if (parent) {
    router.replace({ name: parent });
  } else {
    router.back();
  }
}

function handleEnter() {
  if (!canSend.value) {
    if (!inputText.value.trim()) return;
    if (connectionState.value === "connecting") {
      sendError.value = t("chat.sendWhileConnecting");
    } else if (connectionState.value === "error" || connectionState.value === "closed") {
      sendError.value = t("chat.sendWhileDisconnected");
    } else {
      sendError.value = t("chat.sendFailed");
    }
    return;
  }
  sendError.value = "";
  sendMessage();
}

function persistMessages() {
  saveSocialMessages(previewContactKey.value, messages.value);
}

function recordPreview(message, { markUnread = false } = {}) {
  updateSocialPreview({
    contactKey: previewContactKey.value,
    text: message.text,
    createdAt: message.createdAt,
    senderId: message.senderId,
    currentUserId: userId.value,
    markUnread,
  });
}

function pushMessage(message, { fromSocket = false, persist = true } = {}) {
  if (message?.senderAvatar) {
    rememberSocialAvatar(message.senderId, message.senderAvatar);
  }
  const normalized = {
    id: message.id || `${message.senderId}-${message.createdAt}-${message.text}`,
    senderId: message.senderId,
    senderAvatar: message.senderAvatar || avatarForSender(message.senderId),
    text: message.text,
    createdAt: message.createdAt || new Date().toISOString(),
  };
  const exists = messages.value.some((item) => item.id === normalized.id);
  if (!exists) {
    messages.value.push(normalized);
  }
  if (persist) {
    persistMessages();
  }
  recordPreview(normalized, { markUnread: fromSocket });
  nextTick(() => {
    if (messageListEl.value) {
      messageListEl.value.scrollTop = messageListEl.value.scrollHeight;
    }
  });
}

function loadCachedMessages() {
  messages.value = getSocialMessages(previewContactKey.value);
  nextTick(() => {
    if (messageListEl.value) {
      messageListEl.value.scrollTop = messageListEl.value.scrollHeight;
    }
  });
}

function disconnectSocket() {
  if (reconnectTimer.value) {
    clearTimeout(reconnectTimer.value);
    reconnectTimer.value = null;
  }
  reconnectAttempt.value = 0;
  const socket = socketRef.value;
  socketRef.value = null;
  if (socket && socket.readyState < 2) {
    socket.close(1000, "client-background");
  }
}

function scheduleReconnect() {
  if (reconnectTimer.value) return;
  if (typeof document !== "undefined" && document.visibilityState === "hidden" && shouldDisconnectSocialSocketOnHidden()) {
    return;
  }
  const attempt = reconnectAttempt.value + 1;
  reconnectAttempt.value = attempt;
  const delay = Math.min(1000 * Math.pow(2, attempt - 1), 15000);
  reconnectTimer.value = setTimeout(() => {
    reconnectTimer.value = null;
    if (socketRef.value || connectionState.value === "connected") return;
    connectSocket().catch(() => {});
  }, delay);
}

function handleVisibility() {
  if (document.visibilityState === "hidden" && shouldDisconnectSocialSocketOnHidden()) {
    disconnectSocket();
  } else if (document.visibilityState === "visible" && (connectionState.value === "error" || connectionState.value === "closed")) {
    reconnectAttempt.value = 0;
    connectSocket().catch(() => {});
  }
}

async function connectSocket() {
  const config = await getSocialConfig();
  if (socketRef.value) return;
  const socket = createSocialSocket(config, {
    userId: userId.value,
    mode: mode.value,
    peerId: mode.value === "direct" ? peerId.value : "",
    onOpen: () => {
      reconnectAttempt.value = 0;
      connectionState.value = "connected";
      sendError.value = "";
    },
    onClose: () => {
      if (socketRef.value === socket) socketRef.value = null;
      connectionState.value = "closed";
      scheduleReconnect();
    },
    onError: () => {
      if (socketRef.value === socket) socketRef.value = null;
      connectionState.value = "error";
      scheduleReconnect();
    },
    onMessage: (payload) => {
      if (payload?.type === "error" && payload.error === "not-friends") {
        sendError.value = t("chat.notFriends");
        return;
      }
      if (payload?.type === "message") {
        pushMessage(payload, { fromSocket: true });
      }
      if (payload?.type === "history") {
        for (const item of payload.items || []) {
          pushMessage(item);
        }
      }
    },
  });
  socketRef.value = markRaw(socket);
}

async function loadInitialState() {
  const config = await getSocialConfig();
  const user = await getCurrentUser().catch(() => ({}));
  if (!userId.value) {
    userId.value = await getSocialUserId();
    await registerSocialUser(config, {
      id: userId.value,
      avatar: user?.avatar,
      native_language: user?.native_language,
    });
  }
  selfAvatar.value = user?.avatar || "😊";
  rememberSocialAvatar(userId.value, selfAvatar.value);

  if (mode.value === "direct" && peerId.value) {
    const avatars = await getSocialUserAvatars(config, [peerId.value]);
    rememberSocialAvatars(avatars);
    peerAvatar.value = avatars[peerId.value] || getCachedSocialAvatar(peerId.value, "😊");

    const offline = await pullOfflineMessages(config, userId.value).catch(() => ({ items: [] }));
    const offlineMessages = [];
    for (const item of offline?.items || []) {
      const isCurrentPeer = item.senderId === peerId.value || item.receiverId === peerId.value;
      if (!isCurrentPeer) continue;
      offlineMessages.push({
        id: item.id ? String(item.id) : `${item.senderId}-${item.createdAt}-${item.content}`,
        senderId: item.senderId,
        text: item.content,
        createdAt: item.createdAt,
      });
    }
    if (offlineMessages.length > 0) {
      messages.value = mergeSocialMessages(previewContactKey.value, offlineMessages);
      nextTick(() => {
        if (messageListEl.value) {
          messageListEl.value.scrollTop = messageListEl.value.scrollHeight;
        }
      });
    }
  }
}

function sendMessage() {
  const text = inputText.value.trim();
  const socket = socketRef.value;
  if (!text || !socket || socket.readyState !== WebSocket.OPEN) {
    if (text) {
      sendError.value = t("chat.sendWhileDisconnected");
    }
    return;
  }

  const payload = {
    type: "message",
    mode: mode.value,
    peerId: mode.value === "direct" ? peerId.value : undefined,
    senderId: userId.value,
    senderAvatar: selfAvatar.value,
    text,
    createdAt: new Date().toISOString(),
  };
  socket.send(JSON.stringify(payload));
  pushMessage(payload);
  inputText.value = "";
  sendError.value = "";
}

async function deleteCurrentChat() {
  showMenu.value = false;
  clearSocialMessages(previewContactKey.value);
  clearSocialPreview(previewContactKey.value);
  messages.value = [];
  goBack();
}

async function enterConversation() {
  sendError.value = "";
  connectionState.value = "connecting";
  disconnectSocket();
  clearSocialUnread(previewContactKey.value);
  loadCachedMessages();
  await loadInitialState();
  await connectSocket();
}

onMounted(async () => {
  document.addEventListener("visibilitychange", handleVisibility);
  if (initialised.value) return;
  initialised.value = true;
  await enterConversation();
});

watch(
  () => [route.params.mode, route.params.peerId],
  (next, prev) => {
    if (!prev || !next) return;
    if (next[0] === prev[0] && next[1] === prev[1]) return;
    enterConversation();
  }
);

onUnmounted(() => {
  document.removeEventListener("visibilitychange", handleVisibility);
  disconnectSocket();
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

.chat-messages {
  flex: 1;
  overflow-y: auto;
  padding: 12px 16px;
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

.msg-sender {
  font-size: 11px;
  font-weight: 600;
  margin-bottom: 4px;
  opacity: 0.8;
}

.msg-text {
  font-size: 14px;
  line-height: 1.5;
  word-break: break-word;
}

.msg-text-plain {
  white-space: pre-wrap;
}

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

.chat-send-error {
  padding: 8px 14px calc(8px + var(--safe-bottom));
  font-size: 12px;
  color: #b53939;
  background: rgba(255, 220, 220, 0.85);
  border-top: 1px solid rgba(181, 57, 57, 0.2);
}
</style>