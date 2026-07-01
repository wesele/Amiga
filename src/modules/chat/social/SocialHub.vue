<template>
  <div class="social-hub">
    <header class="page-header">
      <button class="back-btn" @click="goBack">
        <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor">
          <path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/>
        </svg>
      </button>
      <h1 class="page-title">{{ t("chat.socialHub") }}</h1>
    </header>

    <section class="settings-section">
      <h3 class="section-header">{{ t("chat.addFriendTitle") }}</h3>
      <div class="settings-card">
        <p class="card-subtitle">{{ t("chat.addFriendDesc", { userId }) }}</p>
        <div class="inline-form">
          <input v-model="friendIdInput" :placeholder="t('chat.friendIdPlaceholder')" :maxlength="64" @input="onFriendIdInput" />
          <button class="primary-btn" :disabled="!ready || !isFriendIdValid" @click="submitFriendRequest">
            {{ t("chat.sendRequest") }}
          </button>
        </div>
        <div v-if="statusText" class="status-text">{{ statusText }}</div>
      </div>
    </section>

    <section class="settings-section">
      <h3 class="section-header">{{ t("chat.pendingRequestsTitle") }}</h3>
      <div class="settings-card">
        <div v-if="pendingRequests.length === 0" class="empty-state">{{ t("chat.pendingEmpty") }}</div>
        <div v-for="request in pendingRequests" :key="request.fromUserId" class="friend-row">
          <div>
            <div class="friend-name">{{ request.fromUserId }}</div>
            <div class="friend-meta">{{ formatTime(request.createdAt) }}</div>
          </div>
          <button class="primary-btn" :disabled="!ready" @click="acceptRequest(request.fromUserId)">
            {{ t("chat.acceptRequest") }}
          </button>
        </div>
      </div>
    </section>

    <section class="settings-section">
      <h3 class="section-header">{{ t("chat.friendsTitle") }}</h3>
      <div class="settings-card">
        <div v-if="friends.length === 0" class="empty-state">{{ t("chat.friendsEmpty") }}</div>
        <div v-for="friend in friends" :key="friend.friendUserId" class="friend-row">
          <div class="friend-main">
            <AvatarEmoji :value="friend.friendAvatar || '😊'" :size="36" />
            <div>
              <div class="friend-name">{{ friend.friendUserId }}</div>
              <div class="friend-meta">{{ t("chat.friendSince", { date: formatDate(friend.updatedAt) }) }}</div>
            </div>
          </div>
          <button class="danger-btn" :disabled="!ready" @click="removeFriend(friend.friendUserId)">
            {{ t("chat.removeFriend") }}
          </button>
        </div>
      </div>
    </section>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { getCurrentUser } from "@/shared/api.js";
import { useI18n } from "@/shared/i18n";
import AvatarEmoji from "@/shared/components/AvatarEmoji.vue";
import { rememberSocialAvatars } from "./socialAvatars.js";
import {
  acceptFriendRequest,
  getPendingFriendRequests,
  getSocialConfig,
  getSocialFriendships,
  getSocialUserId,
  registerSocialUser,
  removeFriend as removeFriendRequest,
  sendFriendRequest,
} from "./socialService.js";

const router = useRouter();
const route = useRoute();
const { t } = useI18n();

const userId = ref("");
const pendingRequests = ref([]);
const friends = ref([]);
const statusText = ref("");
const friendIdInput = ref("");
const ready = computed(() => Boolean(userId.value));
const isFriendIdValid = computed(() => !validateFriendId(friendIdInput.value.trim()));

function onFriendIdInput() {
  const validation = validateFriendId(friendIdInput.value.trim());
  if (validation) {
    statusText.value = validation;
  } else if (statusText.value === t("chat.requestInvalidEmpty") ||
             statusText.value === t("chat.requestInvalidSelf") ||
             statusText.value === t("chat.requestInvalidTooLong")) {
    statusText.value = "";
  }
}

function goBack() {
  const parent = route?.meta?.parent;
  if (parent) {
    router.replace({ name: parent });
  } else {
    router.replace({ name: "chat" });
  }
}

function formatDate(value) {
  if (!value) return "-";
  return new Date(value).toLocaleDateString();
}

function formatTime(value) {
  if (!value) return "-";
  return new Date(value).toLocaleString();
}

async function loadSummary(config) {
  const user = await getCurrentUser().catch(() => ({}));
  await registerSocialUser(config, {
    id: userId.value,
    avatar: user?.avatar,
    native_language: user?.native_language,
  });

  const [requests, friendships] = await Promise.all([
    getPendingFriendRequests(config, userId.value),
    getSocialFriendships(config, userId.value),
  ]);
  pendingRequests.value = requests?.items || [];
  friends.value = friendships?.items || [];
  rememberSocialAvatars(Object.fromEntries(
    friends.value
      .filter((friend) => friend.friendUserId && friend.friendAvatar)
      .map((friend) => [friend.friendUserId, friend.friendAvatar]),
  ));
}

async function refreshAll() {
  statusText.value = "";
  try {
    const config = await getSocialConfig();
    await loadSummary(config);
  } catch {
    statusText.value = t("chat.socialLoadFailed");
  }
}

function validateFriendId(target) {
  if (!target) return t("chat.requestInvalidEmpty");
  if (target.length > 64) return t("chat.requestInvalidTooLong");
  if (target === userId.value) return t("chat.requestInvalidSelf");
  return "";
}

async function submitFriendRequest() {
  const target = friendIdInput.value.trim();
  const validation = validateFriendId(target);
  if (validation) {
    statusText.value = validation;
    return;
  }
  statusText.value = "";
  try {
    const config = await getSocialConfig();
    await sendFriendRequest(config, userId.value, target);
    friendIdInput.value = "";
    statusText.value = t("chat.requestSent");
    await loadSummary(config);
  } catch (error) {
    statusText.value = error?.message ? `${t("chat.requestFailed")} (${error.message})` : t("chat.requestFailed");
  }
}

async function acceptRequest(fromUserId) {
  statusText.value = "";
  try {
    const config = await getSocialConfig();
    await acceptFriendRequest(config, userId.value, fromUserId);
    statusText.value = t("chat.requestAccepted");
    await loadSummary(config);
  } catch (error) {
    statusText.value = error?.message ? `${t("chat.acceptFailed")} (${error.message})` : t("chat.acceptFailed");
  }
}

async function removeFriend(friendUserId) {
  statusText.value = "";
  try {
    const config = await getSocialConfig();
    await removeFriendRequest(config, userId.value, friendUserId);
    statusText.value = t("chat.friendRemoved");
    await loadSummary(config);
  } catch (error) {
    statusText.value = error?.message ? `${t("chat.removeFriendFailed")} (${error.message})` : t("chat.removeFriendFailed");
  }
}

onMounted(async () => {
  userId.value = await getSocialUserId();
  await refreshAll();
});
</script>

<style scoped>
.social-hub {
  min-height: 100%;
  background: var(--bg);
  padding-bottom: 24px;
}

.page-header {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 8px 4px;
  background: var(--surface);
  border-bottom: 1px solid var(--border);
  position: sticky;
  top: 0;
  z-index: 10;
}

.back-btn {
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  background: none;
  color: var(--text);
  cursor: pointer;
  border-radius: 50%;
  transition: background var(--transition);
  flex-shrink: 0;
}

.back-btn:hover {
  background: var(--surface-variant);
}

.page-title {
  font-size: 20px;
  font-weight: 500;
  margin: 0;
}

.settings-section {
  margin: 12px 0;
}

.section-header {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-light);
  padding: 0 20px;
  margin-bottom: 4px;
}

.settings-card {
  margin: 0 16px;
  border-radius: var(--radius-md);
  overflow: hidden;
  background: var(--surface);
  padding: 16px;
}

.card-subtitle,
.status-text,
.friend-meta {
  margin-top: 4px;
  font-size: 12px;
  color: var(--text-lighter);
  line-height: 1.5;
}

.inline-form {
  display: flex;
  gap: 10px;
  margin-top: 12px;
}

.inline-form input {
  flex: 1;
  box-sizing: border-box;
  border: 1px solid var(--border);
  border-radius: 14px;
  padding: 12px 14px;
  background: var(--bg);
  color: var(--text);
  font-size: 14px;
}

.primary-btn,
.danger-btn {
  border: none;
  border-radius: 14px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  padding: 10px 14px;
  flex-shrink: 0;
}

.primary-btn {
  background: var(--green);
  color: #fff;
}

.danger-btn {
  background: rgba(244, 67, 54, 0.12);
  color: var(--red, #f44336);
}

.primary-btn:disabled,
.danger-btn:disabled {
  opacity: 0.55;
  cursor: default;
}

.friend-row {
  display: flex;
  gap: 10px;
  align-items: center;
  justify-content: space-between;
}

.friend-row + .friend-row {
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid var(--border);
}

.friend-main {
  display: flex;
  gap: 10px;
  align-items: center;
  min-width: 0;
}

.friend-name {
  font-size: 15px;
  font-weight: 600;
  color: var(--text);
}

.empty-state {
  border-radius: 16px;
  background: var(--bg);
  color: var(--text-lighter);
  padding: 14px;
  text-align: center;
  font-size: 13px;
}
</style>