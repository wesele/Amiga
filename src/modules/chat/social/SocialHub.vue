<template>
  <div class="social-hub">
    <PageHeader :title="t('chat.socialHub')" @back="goBack" />
    <section class="settings-section">
      <h3 class="section-header">Language partner profile</h3>
      <div class="settings-card profile-card">
        <label class="toggle-row">
          <span>Public for matching</span>
          <input v-model="profile.public_enabled" type="checkbox" />
        </label>
        <input v-model="profile.native_lang" placeholder="Native language, e.g. zh" maxlength="16" />
        <input v-model="profile.target_lang" placeholder="Target language, e.g. es" maxlength="16" />
        <input v-model="profile.interestsText" placeholder="Interests, comma separated" maxlength="120" />
        <input v-model="profile.timezone" placeholder="Timezone, e.g. UTC+8" maxlength="32" />
        <input v-model="profile.practice_goal" placeholder="What do you want to practice?" maxlength="120" />
        <button class="primary-btn" :disabled="!ready" @click="saveProfile">Save profile</button>
        <div v-if="profileStatus" class="status-text">{{ profileStatus }}</div>
      </div>
    </section>

    <section class="settings-section">
      <h3 class="section-header">Partner candidates</h3>
      <div class="settings-card">
        <div v-if="candidates.length === 0" class="empty-state">No candidates yet. Turn on your profile or check later.</div>
        <div v-for="candidate in candidates" :key="candidate.user_id" class="friend-row">
          <div>
            <div class="friend-name">{{ candidate.user_id }}</div>
            <div class="friend-meta">{{ candidate.native_lang }} -> {{ candidate.target_lang }} · {{ candidate.practice_goal }}</div>
          </div>
          <button class="primary-btn" @click="greetCandidate(candidate.user_id)">Greet</button>
        </div>
      </div>
    </section>

    <section class="settings-section">
      <h3 class="section-header">Rewrite one sentence</h3>
      <div class="settings-card profile-card">
        <textarea v-model.trim="sentenceText" placeholder="Write one sentence in your target language" rows="3" />
        <button class="primary-btn" :disabled="!ready || !sentenceText" @click="rewriteSentence">Rewrite</button>
        <div v-if="sentenceRewrite" class="rewrite-result">
          <p>{{ sentenceRewrite.rewritten_text }}</p>
          <button class="primary-btn" @click="adoptRewrite">Adopt</button>
        </div>
        <div v-if="sentenceStatus" class="status-text">{{ sentenceStatus }}</div>
      </div>
    </section>

    <section class="settings-section">
      <h3 class="section-header">Culture Q&A</h3>
      <div class="settings-card profile-card">
        <textarea v-model.trim="cultureQuestionText" placeholder="Ask about culture or expression nuance" rows="3" />
        <button class="primary-btn" :disabled="!ready || !cultureQuestionText" @click="askCulture">Ask AI first</button>
        <div v-if="cultureQuestion" class="rewrite-result">
          <p>{{ cultureQuestion.ai_answer }}</p>
          <button class="primary-btn" @click="saveCultureCard">Save card</button>
        </div>
        <div v-if="cultureStatus" class="status-text">{{ cultureStatus }}</div>
      </div>
    </section>

    <section class="settings-section">
      <h3 class="section-header">Safety</h3>
      <div class="settings-card profile-card">
        <input v-model="safetyTarget" placeholder="User ID to block, unblock, or report" maxlength="64" />
        <input v-model="reportReason" placeholder="Report reason" maxlength="120" />
        <div class="inline-form">
          <button class="safety-danger-btn" :disabled="!ready || !safetyTarget" @click="blockTarget(true)">Block</button>
          <button class="primary-btn" :disabled="!ready || !safetyTarget" @click="blockTarget(false)">Unblock</button>
          <button class="safety-danger-btn" :disabled="!ready || !safetyTarget" @click="reportTarget">Report</button>
        </div>
        <div v-if="safetyStatus" class="status-text">{{ safetyStatus }}</div>
      </div>
    </section>

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
import {
  adoptSentenceRewrite,
  askCultureQuestion,
  getCurrentUser,
  getSocialProfile,
  getSocialRecommendations,
  reportSocialUser,
  saveCultureQuestionCard,
  saveSocialProfile,
  setSocialBlock,
  submitSentenceRewrite,
} from "@/shared/api.js";
import { useI18n } from "@/shared/i18n";
import AvatarEmoji from "@/shared/components/AvatarEmoji.vue";
import PageHeader from "@/shared/components/PageHeader.vue";
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
const candidates = ref([]);
const statusText = ref("");
const friendIdInput = ref("");
const profile = ref({
  native_lang: "",
  target_lang: "",
  interestsText: "",
  timezone: "",
  practice_goal: "",
  public_enabled: false,
});
const profileStatus = ref("");
const sentenceText = ref("");
const sentenceRewrite = ref(null);
const sentenceStatus = ref("");
const cultureQuestionText = ref("");
const cultureQuestion = ref(null);
const cultureStatus = ref("");
const safetyTarget = ref("");
const reportReason = ref("");
const safetyStatus = ref("");
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
  await loadLocalSocial();
}

async function loadLocalSocial() {
  try {
    const saved = await getSocialProfile(userId.value);
    if (saved && typeof saved === "object") {
      profile.value = {
        native_lang: saved.native_lang || "",
        target_lang: saved.target_lang || "",
        interestsText: (saved.interests || []).join(", "),
        timezone: saved.timezone || "",
        practice_goal: saved.practice_goal || "",
        public_enabled: Boolean(saved.public_enabled),
      };
    }
    candidates.value = await getSocialRecommendations(userId.value);
  } catch {
    candidates.value = [];
  }
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

async function saveProfile() {
  profileStatus.value = "";
  try {
    await saveSocialProfile({
      user_id: userId.value,
      native_lang: profile.value.native_lang.trim(),
      target_lang: profile.value.target_lang.trim(),
      interests: profile.value.interestsText.split(",").map((item) => item.trim()).filter(Boolean),
      timezone: profile.value.timezone.trim(),
      practice_goal: profile.value.practice_goal.trim(),
      public_enabled: profile.value.public_enabled,
    });
    profileStatus.value = "Profile saved";
    candidates.value = await getSocialRecommendations(userId.value).catch(() => []);
  } catch (error) {
    profileStatus.value = error?.message || "Could not save profile";
  }
}

async function greetCandidate(candidateId) {
  friendIdInput.value = candidateId;
  await submitFriendRequest();
}

async function rewriteSentence() {
  sentenceStatus.value = "";
  sentenceRewrite.value = null;
  try {
    sentenceRewrite.value = await submitSentenceRewrite(
      userId.value,
      profile.value.target_lang || "es",
      sentenceText.value,
    );
  } catch (error) {
    sentenceStatus.value = error?.message || String(error);
  }
}

async function adoptRewrite() {
  if (!sentenceRewrite.value) return;
  try {
    await adoptSentenceRewrite(
      sentenceRewrite.value.id,
      userId.value,
      profile.value.target_lang || "es",
    );
    sentenceStatus.value = "Saved as a learning card";
  } catch (error) {
    sentenceStatus.value = error?.message || "Could not save";
  }
}

async function askCulture() {
  cultureStatus.value = "";
  cultureQuestion.value = null;
  try {
    cultureQuestion.value = await askCultureQuestion(
      userId.value,
      profile.value.target_lang || "es",
      cultureQuestionText.value,
    );
  } catch (error) {
    cultureStatus.value = error?.message || String(error);
  }
}

async function saveCultureCard() {
  if (!cultureQuestion.value) return;
  try {
    await saveCultureQuestionCard(
      cultureQuestion.value.id,
      userId.value,
      profile.value.target_lang || "es",
    );
    cultureStatus.value = "Saved as a learning card";
  } catch (error) {
    cultureStatus.value = error?.message || "Could not save";
  }
}

async function blockTarget(blocked) {
  try {
    await setSocialBlock(userId.value, safetyTarget.value.trim(), blocked);
    safetyStatus.value = blocked ? "Blocked" : "Unblocked";
    candidates.value = await getSocialRecommendations(userId.value).catch(() => []);
  } catch (error) {
    safetyStatus.value = error?.message || "Safety action failed";
  }
}

async function reportTarget() {
  try {
    await reportSocialUser(
      userId.value,
      safetyTarget.value.trim(),
      reportReason.value.trim() || "unspecified",
      "",
    );
    safetyStatus.value = "Report saved";
  } catch (error) {
    safetyStatus.value = error?.message || "Report failed";
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

.profile-card {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.profile-card input,
.profile-card textarea {
  box-sizing: border-box;
  width: 100%;
  border: 1px solid var(--border);
  border-radius: 14px;
  padding: 12px 14px;
  background: var(--bg);
  color: var(--text);
  font: inherit;
  font-size: 14px;
}

.profile-card textarea {
  resize: vertical;
  min-height: 74px;
}

.toggle-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  color: var(--text);
  font-size: 14px;
  font-weight: 700;
}

.rewrite-result {
  padding: 12px;
  border-radius: var(--radius-sm);
  background: var(--green-bg);
  color: var(--text);
  font-size: 14px;
  line-height: 1.5;
}

.rewrite-result p {
  margin: 0 0 10px;
}

.primary-btn,
.danger-btn,
.safety-danger-btn {
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

.danger-btn,
.safety-danger-btn {
  background: rgba(244, 67, 54, 0.12);
  color: var(--red, #f44336);
}

.primary-btn:disabled,
.danger-btn:disabled,
.safety-danger-btn:disabled {
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
