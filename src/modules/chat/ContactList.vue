<template>
  <div class="contact-list">
    <header class="list-header">
      <h2>{{ t("chat.title") }}</h2>
      <button class="manage-btn" :aria-label="t('chat.socialHub')" @click="openSocialHub">⋯</button>
    </header>
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
          <span v-if="contact.unreadCount > 0" class="contact-badge">{{ formatBadge(contact.unreadCount) }}</span>
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
import { getChatSessions } from "@/shared/api.js";
import { openAiContact } from "@/modules/ai-chat/openAiContact.js";
import { useI18n } from "@/shared/i18n";
import { displayLang } from "@/shared/constants.js";
import { eventBus } from "@/shared/eventBus.js";
import AmigaIcon from "@/shared/components/AmigaIcon.vue";
import GroupChatIcon from "@/shared/components/GroupChatIcon.vue";
import AvatarEmoji from "@/shared/components/AvatarEmoji.vue";
import { getCachedSocialAvatar } from "./social/socialAvatars.js";
import { useTargetLangStore, TARGET_LANG_CHANGED } from "@/stores/targetLang.js";
import { bootSocialInbox, getInboxFriends, SOCIAL_FRIENDS_UPDATED } from "./social/socialInboxService.js";
import {
  getSocialContactKey,
  getSocialPreview,
  SOCIAL_PREVIEW_UPDATED,
} from "./social/socialPreview.js";

const router = useRouter();
const { t, locale } = useI18n();
const targetLangStore = useTargetLangStore();
const sessions = ref([]);
const friends = ref(getInboxFriends());
const previewVersion = ref(0);
const flashingIds = ref(new Set());
let unsubscribeLang = null;
let unsubscribePreview = null;
let unsubscribeFriends = null;
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
  const raw = preview.unread;
  const unreadCount = typeof raw === "number" ? raw : (raw ? 1 : 0);
  return {
    ...contact,
    desc: preview.text || contact.desc,
    lastTime: preview.createdAt ? formatTime(preview.createdAt) : contact.lastTime,
    unread: unreadCount > 0,
    unreadCount,
  };
}

function formatBadge(count) {
  if (count > 99) return "99+";
  return String(count);
}

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
      desc: t("chat.amigaDesc", { target: targetLabel }),
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

async function refreshSessions() {
  const lang = targetLangStore.code || (await targetLangStore.load());
  try {
    sessions.value = await getChatSessions(lang);
  } catch {
    sessions.value = [];
  }
}

async function refreshFriends() {
  // The social inbox service is the single source of truth for the
  // friend list and for live messages. We just sync our local copy
  // from it (the service also re-emits via SOCIAL_FRIENDS_UPDATED).
  try {
    await bootSocialInbox();
    friends.value = getInboxFriends();
  } catch {
    friends.value = [];
  }
}

function openSocialHub() {
  router.push({ name: "social-hub" });
}

async function openAiChat(contact) {
  const lang = targetLangStore.code || (await targetLangStore.load());
  await openAiContact(router, contact, { targetLang: lang });
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
  unsubscribeFriends?.();
  for (const timer of flashTimers.values()) {
    clearTimeout(timer);
  }
  flashTimers.clear();
});

onMounted(async () => {
  await refreshSessions();
  await refreshFriends();
  unsubscribeLang = eventBus.on(TARGET_LANG_CHANGED, () => {
    refreshSessions();
  });
  unsubscribePreview = eventBus.on(SOCIAL_PREVIEW_UPDATED, handlePreviewUpdated);
  unsubscribeFriends = eventBus.on(SOCIAL_FRIENDS_UPDATED, (next) => {
    friends.value = next || [];
  });
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
  position: relative;
}

.contact-badge {
  position: absolute;
  top: -4px;
  right: -6px;
  min-width: 18px;
  height: 18px;
  border-radius: 9px;
  background: var(--red, #e53935);
  color: #fff;
  font-size: 11px;
  font-weight: 700;
  line-height: 18px;
  text-align: center;
  padding: 0 4px;
  box-sizing: border-box;
  pointer-events: none;
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