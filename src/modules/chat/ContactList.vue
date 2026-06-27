<template>
  <div class="contact-list">
    <header class="list-header">
      <h2>{{ t('chat.title') }}</h2>
    </header>
    <div class="contact-list-scroll">
      <section class="section-block">
        <div class="section-title">{{ t("chat.socialSection") }}</div>
        <div class="social-entry" @click="openSocialHub">
          <div class="social-entry-icon">#</div>
          <div class="contact-info">
            <div class="contact-name">{{ t("chat.socialHub") }}</div>
            <div class="contact-desc">{{ socialSummary }}</div>
          </div>
          <div class="social-count">{{ socialPendingCount }}</div>
        </div>
      </section>

      <section class="section-block">
        <div class="section-title">{{ t("chat.aiSection") }}</div>
      <div
        v-for="c in contactsWithSessions"
        :key="c.id"
        class="contact-item"
        @click="openChat(c)"
      >
        <div class="contact-avatar">
          <component v-if="c.component" :is="c.component" :size="40" />
          <span v-else>{{ c.avatar }}</span>
        </div>
        <div class="contact-info">
          <div class="contact-name">{{ c.name }}</div>
          <div class="contact-desc">{{ c.desc }}</div>
        </div>
        <div class="contact-time">{{ c.lastTime }}</div>
      </div>
      </section>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, markRaw } from "vue";
import { useRouter } from "vue-router";
import { getCurrentUser, getChatSessions, createChatSession } from "@/shared/api.js";
import { useI18n } from "@/shared/i18n";
import { useTargetLangStore, TARGET_LANG_CHANGED } from "@/stores/targetLang.js";
import { eventBus } from "@/shared/eventBus.js";
import { displayLang } from "@/shared/constants.js";
import AmigaIcon from "@/shared/components/AmigaIcon.vue";
import {
  getPendingFriendRequests,
  getSocialConfig,
  getSocialStats,
  getSocialUserId,
} from "./socialService.js";

const router = useRouter();
const { t, locale } = useI18n();
const targetLangStore = useTargetLangStore();
const sessions = ref([]);
const socialPendingCount = ref(0);
const socialUserCount = ref(0);
let unsubscribe = null;

const CONTACTS = computed(() => {
  const targetLabel = displayLang(targetLangStore.code, locale.value);
  return [
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

function formatTime(dateStr) {
  if (!dateStr) return "";
  const d = new Date(dateStr + "Z");
  const now = new Date();
  const diff = (now - d) / 1000;
  if (diff < 60) return t("time.justNow");
  if (diff < 3600) return t("time.minutesAgo", { n: Math.floor(diff / 60) });
  if (diff < 86400) return t("time.hoursAgo", { n: Math.floor(diff / 3600) });
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

const contactsWithSessions = computed(() => {
  return CONTACTS.value.map((c) => {
    const session = sessions.value.find((s) => s.contact_type === c.contactType);
    return {
      ...c,
      lastTime: session ? formatTime(session.updated_at) : "",
      desc: session && session.last_message ? session.last_message : c.desc,
    };
  });
});
const socialSummary = computed(() => {
  if (!socialUserCount.value && !socialPendingCount.value) {
    return t("chat.socialSummaryEmpty");
  }
  return t("chat.socialSummary", {
    users: socialUserCount.value,
    pending: socialPendingCount.value,
  });
});

async function refreshSessions() {
  const lang = targetLangStore.code || (await targetLangStore.load());
  try {
    sessions.value = await getChatSessions(lang);
  } catch { /* empty */ }
}

async function refreshSocialSummary() {
  try {
    const config = await getSocialConfig();
    if (!config.apiBaseUrl || !config.wsBaseUrl) {
      socialPendingCount.value = 0;
      socialUserCount.value = 0;
      return;
    }
    const userId = await getSocialUserId();
    const [stats, pending] = await Promise.all([
      getSocialStats(config),
      getPendingFriendRequests(config, userId),
    ]);
    socialUserCount.value = stats?.userCount || 0;
    socialPendingCount.value = pending?.items?.length || 0;
  } catch {
    socialPendingCount.value = 0;
    socialUserCount.value = 0;
  }
}

function openSocialHub() {
  router.push({ name: "social-hub" });
}

async function openChat(contact) {
  let session = sessions.value.find((s) => s.contact_type === contact.contactType);
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

onUnmounted(() => {
  if (unsubscribe) unsubscribe();
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
}
.list-header h2 {
  margin: 0;
  font-size: 22px;
  font-weight: 700;
}
.contact-list-scroll {
  flex: 1;
  overflow-y: auto;
}
.section-block + .section-block {
  margin-top: 14px;
}
.section-title {
  padding: 14px 20px 8px;
  font-size: 12px;
  font-weight: 700;
  color: var(--text-lighter);
  text-transform: uppercase;
  letter-spacing: 0.08em;
}
.social-entry {
  margin: 0 16px;
  padding: 14px;
  border-radius: 20px;
  background: linear-gradient(135deg, #0f6b44 0%, #3f9b67 100%);
  color: #fff;
  display: flex;
  align-items: center;
  gap: 12px;
  cursor: pointer;
  box-shadow: 0 12px 24px rgba(15, 107, 68, 0.18);
}
.social-entry-icon {
  width: 46px;
  height: 46px;
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.16);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 24px;
  font-weight: 700;
}
.social-entry .contact-name,
.social-entry .contact-desc,
.social-count {
  color: #fff;
}
.social-count {
  min-width: 28px;
  height: 28px;
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.18);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 13px;
  font-weight: 700;
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
