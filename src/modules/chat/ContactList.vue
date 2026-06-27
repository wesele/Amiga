<template>
  <div class="contact-list">
    <header class="list-header">
      <h2>{{ t("chat.title") }}</h2>
      <button class="manage-btn" @click="openSocialHub">+</button>
    </header>
    <div class="contact-list-scroll">
      <div
        v-for="contact in combinedContacts"
        :key="contact.id"
        class="contact-item"
        :class="{ 'contact-item-public': contact.contactType === 'social-public' }"
        @click="openContact(contact)"
      >
        <div class="contact-avatar">
          <component v-if="contact.component" :is="contact.component" :size="40" />
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
import { createChatSession, getChatSessions, getCurrentUser } from "@/shared/api.js";
import { useI18n } from "@/shared/i18n";
import { displayLang } from "@/shared/constants.js";
import { eventBus } from "@/shared/eventBus.js";
import AmigaIcon from "@/shared/components/AmigaIcon.vue";
import { useTargetLangStore, TARGET_LANG_CHANGED } from "@/stores/targetLang.js";
import {
  getPendingFriendRequests,
  getSocialConfig,
  getSocialFriendships,
  getSocialStats,
  getSocialUserId,
} from "./socialService.js";

const router = useRouter();
const { t, locale } = useI18n();
const targetLangStore = useTargetLangStore();
const sessions = ref([]);
const friends = ref([]);
const socialPendingCount = ref(0);
const socialUserCount = ref(0);
let unsubscribe = null;

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

const socialSummary = computed(() => {
  if (!socialUserCount.value && !socialPendingCount.value) {
    return t("chat.socialSummaryEmpty");
  }
  return t("chat.socialSummary", {
    users: socialUserCount.value,
    pending: socialPendingCount.value,
  });
});

const aiContacts = computed(() => {
  const targetLabel = displayLang(targetLangStore.code, locale.value);
  return [
    {
      id: "public-group",
      name: t("chat.publicGroup"),
      avatar: "#",
      contactType: "social-public",
      desc: socialSummary.value,
      lastTime: socialPendingCount.value > 0 ? `${socialPendingCount.value}` : "",
    },
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

const friendContacts = computed(() => friends.value.map((friend) => ({
  id: `friend-${friend.friendUserId}`,
  name: friend.friendUserId,
  avatar: "👤",
  contactType: "social-direct",
  peerId: friend.friendUserId,
  desc: t("chat.friendSince", { date: new Date(friend.updatedAt).toLocaleDateString() }),
  lastTime: formatTime(friend.updatedAt),
})));

const combinedContacts = computed(() => [
  ...contactsWithSessions.value,
  ...friendContacts.value,
]);

async function refreshSessions() {
  const lang = targetLangStore.code || (await targetLangStore.load());
  try {
    sessions.value = await getChatSessions(lang);
  } catch {
    sessions.value = [];
  }
}

async function refreshSocialSummary() {
  try {
    const config = await getSocialConfig();
    const userId = await getSocialUserId();
    const [stats, pending, friendships] = await Promise.all([
      getSocialStats(config),
      getPendingFriendRequests(config, userId),
      getSocialFriendships(config, userId),
    ]);
    socialUserCount.value = stats?.userCount || 0;
    socialPendingCount.value = pending?.items?.length || 0;
    friends.value = friendships?.items || [];
  } catch {
    socialPendingCount.value = 0;
    socialUserCount.value = 0;
    friends.value = [];
  }
}

function openSocialHub() {
  router.push({ name: "social-hub" });
}

async function openAiChat(contact) {
  let session = sessions.value.find((item) => item.contact_type === contact.contactType);
  if (!session) {
    try {
      const user = await getCurrentUser();
      const uid = user?.id || "default";
      const lang = targetLangStore.code || (await targetLangStore.load());
      const sid = await createChatSession(uid, contact.name, contact.contactType, lang);
      session = { id: sid, contact_type: contact.contactType };
    } catch {
      return;
    }
  }
  router.push(`/chat/${session.id}`);
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
  unsubscribe?.();
});

onMounted(async () => {
  await refreshSessions();
  await refreshSocialSummary();
  unsubscribe = eventBus.on(TARGET_LANG_CHANGED, () => {
    refreshSessions();
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
  background: var(--green-bg);
  color: var(--green);
  font-size: 24px;
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

.contact-item-public {
  background: linear-gradient(135deg, #0f6b44 0%, #3f9b67 100%);
  box-shadow: 0 12px 24px rgba(15, 107, 68, 0.18);
}

.contact-item-public:hover {
  background: linear-gradient(135deg, #0f6b44 0%, #3f9b67 100%);
}

.contact-item-public .contact-name,
.contact-item-public .contact-desc,
.contact-item-public .contact-time,
.contact-item-public .contact-avatar {
  color: #fff;
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
