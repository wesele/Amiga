<template>
  <div class="contact-list">
    <header class="list-header">
      <h2>互动</h2>
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

const router = useRouter();
const sessions = ref([]);

const CONTACTS = [
  { id: "amiga", name: "Amiga", avatar: "🤖", contactType: "amiga", desc: "你的 AI 语言学习伙伴" },
  { id: "translator", name: "AI 翻译", avatar: "🌐", contactType: "translator", desc: "翻译、解释、例句" },
];

function formatTime(dateStr) {
  if (!dateStr) return "";
  const d = new Date(dateStr + "Z");
  const now = new Date();
  const diff = (now - d) / 1000;
  if (diff < 60) return "刚刚";
  if (diff < 3600) return `${Math.floor(diff / 60)}分钟前`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}小时前`;
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

const contactsWithSessions = computed(() => {
  return CONTACTS.map((c) => {
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
