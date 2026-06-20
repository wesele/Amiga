<template>
  <div class="contact-list">
    <header class="list-header">
      <h2>{{ t('interaction.title') }}</h2>
    </header>
    <div class="contact-list-scroll">
      <div
        v-for="c in contactsWithSessions"
        :key="c.id"
        class="contact-item"
        @click="openChat(c)"
      >
        <div class="contact-avatar">{{ c.avatar }}</div>
        <div class="contact-info">
          <div class="contact-name">{{ c.name }}</div>
          <div class="contact-desc">{{ c.desc }}</div>
        </div>
        <div class="contact-time">{{ c.lastTime }}</div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from "vue";
import { useRouter } from "vue-router";
import { getCurrentUser, getChatSessions, createChatSession } from "@/shared/api.js";
import { useI18n } from "@/shared/i18n";

const router = useRouter();
const { t } = useI18n();
const sessions = ref([]);

const CONTACTS = computed(() => [
  { id: "amiga", name: t("interaction.amiga"), avatar: "🤖", contactType: "amiga", desc: t("interaction.amigaDesc") },
  { id: "translator", name: t("interaction.translator"), avatar: "🌐", contactType: "translator", desc: t("interaction.translatorDesc") },
]);

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

async function openChat(contact) {
  let session = sessions.value.find((s) => s.contact_type === contact.contactType);
  if (!session) {
    try {
      const user = await getCurrentUser();
      const uid = user?.id || "default";
      const sid = await createChatSession(uid, contact.name, contact.contactType);
      session = { id: sid, contact_type: contact.contactType };
    } catch {
      return;
    }
  }
  router.push(`/interaction/chat/${session.id}`);
}

onMounted(async () => {
  try {
    sessions.value = await getChatSessions();
  } catch { /* empty */ }
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
