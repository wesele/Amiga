<template>
  <div class="social-hub">
    <header class="hub-header">
      <button class="back-btn" @click="goBack">{{ t("app.back") }}</button>
      <div>
        <h2>{{ t("chat.socialHub") }}</h2>
        <p>{{ t("chat.socialHubDesc") }}</p>
      </div>
    </header>

    <section class="hub-card">
      <div class="row-between">
        <div>
          <div class="card-title">{{ t("chat.publicGroup") }}</div>
          <div class="card-subtitle">{{ t("chat.publicGroupDesc") }}</div>
        </div>
        <button class="primary-btn" :disabled="!ready" @click="openPublicGroup">{{ t("chat.enterRoom") }}</button>
      </div>
      <div class="stats-row">
        <div class="stat-pill">
          <span>{{ t("chat.onlinePopulation") }}</span>
          <strong>{{ stats.userCount }}</strong>
        </div>
        <div class="stat-pill">
          <span>{{ t("chat.pendingCount") }}</span>
          <strong>{{ pendingRequests.length }}</strong>
        </div>
      </div>
    </section>

    <section class="hub-card">
      <div class="card-title">{{ t("chat.addFriendTitle") }}</div>
      <div class="card-subtitle">{{ t("chat.addFriendDesc", { userId }) }}</div>
      <div class="inline-form">
        <input v-model="friendIdInput" :placeholder="t('chat.friendIdPlaceholder')" :maxlength="64" @input="onFriendIdInput" />
        <button class="primary-btn" :disabled="!ready || !isFriendIdValid" @click="submitFriendRequest">
          {{ t("chat.sendRequest") }}
        </button>
      </div>
      <div v-if="statusText" class="status-text">{{ statusText }}</div>
    </section>

    <section class="hub-card">
      <div class="card-title">{{ t("chat.pendingRequestsTitle") }}</div>
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
    </section>

    <section class="hub-card">
      <div class="card-title">{{ t("chat.friendsTitle") }}</div>
      <div v-if="friends.length === 0" class="empty-state">{{ t("chat.friendsEmpty") }}</div>
      <div v-for="friend in friends" :key="friend.friendUserId" class="friend-row">
        <div>
          <div class="friend-name">{{ friend.friendUserId }}</div>
          <div class="friend-meta">{{ t("chat.friendSince", { date: formatDate(friend.updatedAt) }) }}</div>
        </div>
        <button class="primary-btn" :disabled="!ready" @click="openDirectChat(friend.friendUserId)">
          {{ t("chat.openDirect") }}
        </button>
      </div>
    </section>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from "vue";
import { useRouter } from "vue-router";
import { getCurrentUser } from "@/shared/api.js";
import { useI18n } from "@/shared/i18n";
import {
  acceptFriendRequest,
  getPendingFriendRequests,
  getSocialConfig,
  getSocialFriendships,
  getSocialStats,
  getSocialUserId,
  registerSocialUser,
  sendFriendRequest,
} from "./socialService.js";

const router = useRouter();
const { t } = useI18n();

const userId = ref("");
const stats = reactive({ userCount: 0 });
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
  router.replace({ name: "chat" });
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

  const [socialStats, requests, friendships] = await Promise.all([
    getSocialStats(config),
    getPendingFriendRequests(config, userId.value),
    getSocialFriendships(config, userId.value),
  ]);
  stats.userCount = socialStats?.userCount || 0;
  pendingRequests.value = requests?.items || [];
  friends.value = friendships?.items || [];
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

function openPublicGroup() {
  router.push({ name: "social-chat", params: { mode: "public" } });
}

function openDirectChat(friendUserId) {
  router.push({
    name: "social-chat",
    params: { mode: "direct", peerId: friendUserId },
    query: { name: friendUserId },
  });
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
  padding: 16px;
  box-sizing: border-box;
}

.hub-header {
  display: flex;
  gap: 12px;
  align-items: flex-start;
  margin-bottom: 16px;
}

.hub-header h2 {
  margin: 0;
  font-size: 22px;
}

.hub-header p {
  margin: 4px 0 0;
  font-size: 13px;
  color: var(--text-lighter);
  line-height: 1.5;
}

.back-btn,
.primary-btn {
  border: none;
  border-radius: 14px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
}

.back-btn {
  background: var(--white);
  color: var(--text);
  padding: 10px 12px;
}

.hub-card {
  background: var(--white);
  border-radius: 20px;
  padding: 16px;
  box-shadow: 0 8px 22px rgba(0, 0, 0, 0.05);
}

.hub-card + .hub-card {
  margin-top: 14px;
}

.card-title {
  font-size: 16px;
  font-weight: 700;
  color: var(--text);
}

.card-subtitle,
.status-text,
.friend-meta {
  margin-top: 4px;
  font-size: 12px;
  color: var(--text-lighter);
  line-height: 1.5;
}

.inline-form input {
  width: 100%;
  box-sizing: border-box;
  border: 1px solid var(--border);
  border-radius: 14px;
  padding: 12px 14px;
  background: var(--bg);
  color: var(--text);
  font-size: 14px;
}

.inline-form,
.row-between,
.friend-row,
.stats-row {
  display: flex;
  gap: 10px;
}

.inline-form,
.stats-row {
  margin-top: 12px;
}

.row-between,
.friend-row {
  align-items: center;
  justify-content: space-between;
}

.friend-row + .friend-row {
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid var(--border);
}

.primary-btn {
  background: var(--green);
  color: #fff;
  padding: 10px 14px;
}

.primary-btn:disabled {
  opacity: 0.55;
  cursor: default;
}

.stats-row {
  flex-wrap: wrap;
}

.stat-pill {
  min-width: 120px;
  flex: 1;
  background: var(--green-bg);
  border-radius: 16px;
  padding: 12px 14px;
}

.stat-pill span {
  display: block;
  font-size: 12px;
  color: var(--text-lighter);
}

.stat-pill strong {
  display: block;
  margin-top: 6px;
  font-size: 24px;
  color: var(--text);
}

.friend-name {
  font-size: 15px;
  font-weight: 600;
  color: var(--text);
}

.empty-state {
  margin-top: 12px;
  border-radius: 16px;
  background: var(--bg);
  color: var(--text-lighter);
  padding: 14px;
  text-align: center;
  font-size: 13px;
}
</style>
