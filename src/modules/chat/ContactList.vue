<template>
  <div class="contact-list">
    <header class="list-header">
      <h2>{{ t("chat.title") }}</h2>
      <button class="manage-btn" :aria-label="t('chat.socialHub')" @click="openSocialHub">⋯</button>
    </header>
    <section v-if="showPendingHero" class="pending-practice-hero">
      <p class="pending-practice-eyebrow">{{ t("chat.pendingPracticeTitle") }}</p>
      <p class="pending-practice-hint">{{ pendingPracticeHint }}</p>
      <div class="pending-practice-actions">
        <button
          type="button"
          class="pending-practice-start"
          :disabled="startingPendingPractice"
          @click="startPendingPractice"
        >
          {{ t("chat.pendingPracticeStart") }}
        </button>
        <button type="button" class="pending-practice-dismiss" @click="dismissPendingPractice">
          {{ t("chat.pendingPracticeDismiss") }}
        </button>
      </div>
    </section>
    <div class="contact-list-scroll">
      <div
        v-for="contact in combinedContacts"
        :key="contact.id"
        class="contact-item"
        :class="{
          'contact-item-unread': contact.unread,
          'contact-item-flash': flashingIds.has(contact.id),
        }"
        @click="openContact(contact)"
      >
        <div class="contact-avatar">
          <component v-if="contact.component" :is="contact.component" :size="40" />
          <GroupChatIcon v-else-if="contact.contactType === 'social-public'" :size="40" />
          <AvatarEmoji v-else-if="contact.avatarEmoji" :value="contact.avatarEmoji" :size="40" />
          <span v-else>{{ contact.avatar }}</span>
        </div>
        <div class="contact-info">
          <div class="contact-name">{{ contact.name }}</div>
          <div class="contact-desc">{{ contact.desc }}</div>
        </div>
        <div class="contact-time">{{ contact.lastTime }}</div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, markRaw, onMounted, onUnmounted, ref } from "vue";
import { useRouter } from "vue-router";
import { getChatSessions, getPathCurriculum } from "@/shared/api.js";
import { loadLearningContext } from "@/shared/learningContext.js";
import { findCurrentSection } from "@/modules/learn/pathResume.js";
import { openAiContact } from "@/modules/ai-chat/openAiContact.js";
import {
  clearPendingAiPractice,
  formatPendingPracticePreview,
  PENDING_SOURCES,
  peekPendingAiPractice,
  shouldShowPendingPracticeHero,
} from "@/modules/ai-chat/pendingAiPractice.js";
import { saveComprehensionPracticePayload } from "@/modules/news/comprehensionAiPractice.js";
import { useI18n } from "@/shared/i18n";
import { displayLang } from "@/shared/constants.js";
import { eventBus } from "@/shared/eventBus.js";
import AmigaIcon from "@/shared/components/AmigaIcon.vue";
import GroupChatIcon from "@/shared/components/GroupChatIcon.vue";
import AvatarEmoji from "@/shared/components/AvatarEmoji.vue";
import { getCachedSocialAvatar, rememberSocialAvatars } from "./social/socialAvatars.js";
import { useTargetLangStore, TARGET_LANG_CHANGED } from "@/stores/targetLang.js";
import {
  getSocialConfig,
  getSocialFriendships,
  getSocialUserId,
} from "./social/socialService.js";
import { startSocialInboxListener } from "./social/socialInbox.js";
import {
  getSocialContactKey,
  getSocialPreview,
  SOCIAL_PREVIEW_UPDATED,
} from "./social/socialPreview.js";

const router = useRouter();
const { t, locale } = useI18n();
const targetLangStore = useTargetLangStore();
const sessions = ref([]);
const currentUnitTitle = ref("");
const friends = ref([]);
const previewVersion = ref(0);
const flashingIds = ref(new Set());
const socialUserId = ref("");
const pendingPractice = ref(null);
const startingPendingPractice = ref(false);
let unsubscribeLang = null;
let unsubscribePreview = null;
let stopInbox = null;
let flashTimers = new Map();

function formatTime(dateStr) {
  if (!dateStr) return "";
  const d = new Date(dateStr.endsWith("Z") ? dateStr : `${dateStr}Z`);
  const now = new Date();
  const diff = (now - d) / 1000;
  if (diff < 60) return t("time.justNow");
  if (diff < 3600) return t("time.minutesAgo", { n: Math.floor(diff / 60) });
  if (diff < 86400) return t("time.hoursAgo", { n: Math.floor(diff / 3600) });
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

function applySocialPreview(contact) {
  const contactKey = getSocialContactKey(contact.contactType, contact.peerId);
  const preview = getSocialPreview(contactKey);
  if (!preview) return contact;
  return {
    ...contact,
    desc: preview.text || contact.desc,
    lastTime: preview.createdAt ? formatTime(preview.createdAt) : contact.lastTime,
    unread: Boolean(preview.unread),
  };
}

const showPendingHero = computed(() => shouldShowPendingPracticeHero(pendingPractice.value));

const pendingPracticeHint = computed(() => {
  const pending = pendingPractice.value;
  if (!pending) return "";
  if (pending.source === PENDING_SOURCES.COMPREHENSION) {
    return t("chat.pendingComprehensionPracticeHint", {
      title: pending.practiceContext?.articleTitle ?? pending.articleTitle ?? "",
      n: pending.practiceContext?.wrongCount ?? 0,
    });
  }
  if (!pending.words?.length) return "";
  const preview = formatPendingPracticePreview(pending.words);
  const hintKey = {
    reading: "chat.pendingPracticeHintReading",
    vocab: "chat.pendingPracticeHintVocab",
    teaching: "chat.pendingPracticeHintTeaching",
    mistake: "chat.pendingPracticeHintMistake",
  }[pending.source] ?? "chat.pendingPracticeHintVocab";
  return t(hintKey, { preview });
});

const amigaPendingDesc = computed(() => {
  const pending = pendingPractice.value;
  if (!shouldShowPendingPracticeHero(pending)) return "";
  if (pending.source === PENDING_SOURCES.COMPREHENSION) {
    return t("chat.pendingComprehensionPractice", {
      title: pending.practiceContext?.articleTitle ?? pending.articleTitle ?? "",
      n: pending.practiceContext?.wrongCount ?? 0,
    });
  }
  const n = pending.words.length;
  if (currentUnitTitle.value) {
    return t("chat.amigaDescPendingWithUnit", { n, unit: currentUnitTitle.value });
  }
  return t("chat.amigaDescPendingPractice", { n });
});

const aiContacts = computed(() => {
  previewVersion.value;
  const targetLabel = displayLang(targetLangStore.code, locale.value);
  const publicContact = applySocialPreview({
    id: "public-group",
    name: t("chat.publicGroup"),
    contactType: "social-public",
    desc: t("chat.publicGroupDesc"),
    lastTime: "",
  });
  return [
    publicContact,
    {
      id: "amiga",
      name: t("chat.amiga"),
      component: markRaw(AmigaIcon),
      contactType: "amiga",
      desc:
        amigaPendingDesc.value
        || (currentUnitTitle.value
          ? t("chat.amigaDescWithUnit", {
              target: targetLabel,
              unit: currentUnitTitle.value,
            })
          : t("chat.amigaDesc", { target: targetLabel })),
    },
    {
      id: "translator",
      name: t("chat.translator"),
      avatar: "🌐",
      contactType: "translator",
      desc: t("chat.translatorDesc", { target: targetLabel }),
    },
  ];
});

const contactsWithSessions = computed(() => aiContacts.value.map((contact) => {
  if (contact.contactType === "social-public") {
    return contact;
  }
  const session = sessions.value.find((item) => item.contact_type === contact.contactType);
  return {
    ...contact,
    lastTime: session ? formatTime(session.updated_at) : "",
    desc: session?.last_message || contact.desc,
  };
}));

const friendContacts = computed(() => {
  previewVersion.value;
  return friends.value.map((friend) => applySocialPreview({
    id: `friend-${friend.friendUserId}`,
    name: friend.friendUserId,
    avatarEmoji: friend.friendAvatar || getCachedSocialAvatar(friend.friendUserId, "😊"),
    contactType: "social-direct",
    peerId: friend.friendUserId,
    desc: t("chat.friendSince", { date: new Date(friend.updatedAt).toLocaleDateString() }),
    lastTime: formatTime(friend.updatedAt),
  }));
});

const combinedContacts = computed(() => [
  ...contactsWithSessions.value,
  ...friendContacts.value,
]);

function flashContact(contactId) {
  const next = new Set(flashingIds.value);
  next.add(contactId);
  flashingIds.value = next;
  const existing = flashTimers.get(contactId);
  if (existing) clearTimeout(existing);
  const timer = setTimeout(() => {
    const updated = new Set(flashingIds.value);
    updated.delete(contactId);
    flashingIds.value = updated;
    flashTimers.delete(contactId);
  }, 700);
  flashTimers.set(contactId, timer);
}

function resolveContactId(contactKey) {
  if (contactKey === "public") return "public-group";
  if (contactKey?.startsWith("direct:")) {
    return `friend-${contactKey.slice("direct:".length)}`;
  }
  return "";
}

function handlePreviewUpdated(payload) {
  previewVersion.value += 1;
  if (!payload?.unread) return;
  const contactId = resolveContactId(payload.contactKey);
  if (contactId) flashContact(contactId);
}

async function refreshPathContext() {
  try {
    const ctx = await loadLearningContext({ targetLangStore });
    const curriculum = await getPathCurriculum(ctx.nativeLang, ctx.targetLang, ctx.cefr);
    const current = findCurrentSection(curriculum);
    currentUnitTitle.value = current?.unit?.title_native ?? "";
  } catch {
    currentUnitTitle.value = "";
  }
}

async function refreshSessions() {
  const lang = targetLangStore.code || (await targetLangStore.load());
  try {
    sessions.value = await getChatSessions(lang);
  } catch {
    sessions.value = [];
  }
}

async function refreshFriends() {
  try {
    const config = await getSocialConfig();
    if (!socialUserId.value) {
      socialUserId.value = await getSocialUserId();
    }
    const friendships = await getSocialFriendships(config, socialUserId.value);
    friends.value = friendships?.items || [];
    const avatarMap = Object.fromEntries(
      friends.value
        .filter((friend) => friend.friendUserId && friend.friendAvatar)
        .map((friend) => [friend.friendUserId, friend.friendAvatar]),
    );
    rememberSocialAvatars(avatarMap);
    stopInbox?.();
    stopInbox = startSocialInboxListener({
      userId: socialUserId.value,
      friends: friends.value,
    });
  } catch {
    friends.value = [];
    stopInbox?.();
    stopInbox = null;
  }
}

function openSocialHub() {
  router.push({ name: "social-hub" });
}

function refreshPendingPractice() {
  pendingPractice.value = peekPendingAiPractice();
}

async function openAiChat(contact, options = {}) {
  const lang = targetLangStore.code || (await targetLangStore.load());
  return openAiContact(router, contact, { targetLang: lang, ...options });
}

async function startPendingPractice() {
  const pending = pendingPractice.value;
  if (!shouldShowPendingPracticeHero(pending) || startingPendingPractice.value) return;
  startingPendingPractice.value = true;
  try {
    const amigaContact = aiContacts.value.find((contact) => contact.contactType === "amiga");
    if (!amigaContact) return;
    let opened = false;
    if (pending.source === PENDING_SOURCES.COMPREHENSION) {
      saveComprehensionPracticePayload(pending.practiceContext);
      opened = await openAiChat(amigaContact, {
        starterId: "comprehension-practice",
        starterParams: { from: "comprehension" },
      });
    } else {
      opened = await openAiChat(amigaContact, {
        starterId: "reviewed-words",
        starterParams: {
          words: pending.words.join(", "),
          from: pending.source,
        },
      });
    }
    if (opened) refreshPendingPractice();
  } finally {
    startingPendingPractice.value = false;
  }
}

function dismissPendingPractice() {
  clearPendingAiPractice();
  refreshPendingPractice();
}

function openContact(contact) {
  if (contact.contactType === "social-public") {
    router.push({ name: "social-chat", params: { mode: "public" } });
    return;
  }
  if (contact.contactType === "social-direct") {
    router.push({
      name: "social-chat",
      params: { mode: "direct", peerId: contact.peerId },
      query: { name: contact.name },
    });
    return;
  }
  openAiChat(contact);
}

onUnmounted(() => {
  unsubscribeLang?.();
  unsubscribePreview?.();
  stopInbox?.();
  for (const timer of flashTimers.values()) {
    clearTimeout(timer);
  }
  flashTimers.clear();
});

onMounted(async () => {
  refreshPendingPractice();
  await Promise.all([refreshSessions(), refreshPathContext()]);
  await refreshFriends();
  unsubscribeLang = eventBus.on(TARGET_LANG_CHANGED, () => {
    refreshSessions();
    refreshPathContext();
  });
  unsubscribePreview = eventBus.on(SOCIAL_PREVIEW_UPDATED, handlePreviewUpdated);
});
</script>

<style scoped>
.contact-list {
  height: 100%;
  display: flex;
  flex-direction: column;
  background: var(--bg);
}

.list-header {
  padding: 16px 20px 8px;
  background: var(--white);
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.list-header h2 {
  margin: 0;
  font-size: 22px;
  font-weight: 700;
}

.manage-btn {
  border: none;
  width: 34px;
  height: 34px;
  border-radius: 12px;
  background: transparent;
  color: var(--text);
  font-size: 22px;
  line-height: 1;
  font-weight: 700;
}

.pending-practice-hero {
  margin: 8px 16px 0;
  padding: 14px 16px;
  border-radius: var(--radius-md);
  background: linear-gradient(135deg, #f3e8ff 0%, #ede9fe 100%);
  border: 1px solid var(--purple);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
}

.pending-practice-eyebrow {
  margin: 0;
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--purple);
}

.pending-practice-hint {
  margin: 8px 0 0;
  font-size: 14px;
  line-height: 1.4;
  color: var(--text);
}

.pending-practice-actions {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 12px;
}

.pending-practice-start {
  flex: 1;
  border: none;
  border-radius: var(--radius-sm);
  padding: 10px 12px;
  background: var(--purple);
  color: var(--white);
  font-size: 14px;
  font-weight: 600;
}

.pending-practice-start:disabled {
  opacity: 0.6;
}

.pending-practice-dismiss {
  border: none;
  border-radius: var(--radius-sm);
  padding: 10px 12px;
  background: transparent;
  color: var(--text-lighter);
  font-size: 13px;
  font-weight: 500;
}

.contact-list-scroll {
  flex: 1;
  overflow-y: auto;
}

.contact-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 20px;
  background: var(--white);
  cursor: pointer;
  transition: background var(--transition);
}

.contact-item:hover {
  background: var(--bg);
}

.contact-item-unread .contact-name {
  color: var(--green);
}

.contact-item-unread .contact-desc {
  color: var(--text);
  font-weight: 500;
}

.contact-item-flash {
  animation: contact-flash 0.7s ease;
}

@keyframes contact-flash {
  0%, 100% { background: var(--white); }
  35% { background: var(--green-bg); }
}

.contact-avatar {
  font-size: 40px;
  line-height: 1;
  width: 48px;
  height: 48px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.contact-info {
  flex: 1;
  min-width: 0;
}

.contact-name {
  font-size: 15px;
  font-weight: 600;
  color: var(--text);
}

.contact-desc {
  font-size: 12px;
  color: var(--text-lighter);
  margin-top: 2px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.contact-time {
  font-size: 11px;
  color: var(--text-lighter);
  flex-shrink: 0;
}
</style>