<template>
  <div class="learn-hub">
    <header class="page-header">
      <h1 class="page-title">{{ t("learn.title") }}</h1>
    </header>

    <section class="status-section">
      <div class="status-card">
        <div class="stat-cell">
          <div class="stat-value">{{ vocabStats?.total_known || 0 }}</div>
          <div class="stat-label">{{ t("profile.words") }}</div>
        </div>
        <div class="stat-divider" />
        <div class="stat-cell">
          <div class="stat-value">{{ readArticleCount }}</div>
          <div class="stat-label">{{ t("profile.articles") }}</div>
        </div>
        <div class="stat-divider" />
        <div class="stat-cell">
          <div class="stat-value">{{ learningDays }}</div>
          <div class="stat-label">{{ t("learn.days") }}</div>
        </div>
      </div>
    </section>

    <div class="module-grid">
      <button
        v-for="mod in modules"
        :key="mod.id"
        class="module-tile"
        :disabled="opening === mod.id"
        @click="openModule(mod)"
      >
        <span class="module-icon">{{ mod.icon }}</span>
        <span class="module-label">{{ t(mod.labelKey) }}</span>
      </button>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from "vue";
import { useRouter } from "vue-router";
import { useI18n } from "@/shared/i18n";
import { useTargetLangStore } from "@/stores/targetLang.js";
import { openAiContact } from "@/modules/ai-chat/openAiContact.js";
import {
  getUserVocabStats,
  getReadArticleCount,
  getLearningDays,
} from "@/shared/api.js";
import { loadLearningContext } from "@/shared/learningContext.js";

const router = useRouter();
const { t } = useI18n();
const targetLangStore = useTargetLangStore();
const opening = ref(null);
const vocabStats = ref(null);
const readArticleCount = ref(0);
const learningDays = ref(0);

const modules = [
  { id: "path", labelKey: "learn.path", icon: "🛤️", route: { name: "path" } },
  { id: "news", labelKey: "learn.news", icon: "📰", route: { name: "news" } },
  { id: "translator", labelKey: "chat.translator", icon: "🌐", action: "translator" },
];

onMounted(async () => {
  try {
    const ctx = await loadLearningContext({
      targetLangStore,
      fallbackToFirstGoal: true,
    });
    const user = ctx.user;
    const lang = ctx.targetLang || targetLangStore.code || "";
    if (user?.id) {
      vocabStats.value = await getUserVocabStats(user.id, lang);
      readArticleCount.value = await getReadArticleCount(user.id);
      learningDays.value = await getLearningDays(user.id);
    }
  } catch (e) {
    console.error("Failed to load learn hub stats:", e);
  }
});

async function openModule(mod) {
  if (mod.route) {
    router.push(mod.route);
    return;
  }
  if (mod.action === "translator") {
    opening.value = mod.id;
    try {
      const lang = targetLangStore.code || (await targetLangStore.load());
      await openAiContact(
        router,
        { name: t("chat.translator"), contactType: "translator" },
        { routeName: "learn-translator", targetLang: lang },
      );
    } finally {
      opening.value = null;
    }
  }
}
</script>

<style scoped>
.learn-hub {
  min-height: 100%;
  background: var(--bg);
}

.page-header {
  padding: 16px 20px 12px;
  background: var(--white);
}

.page-title {
  margin: 0;
  font-size: 22px;
  font-weight: 700;
}

.status-section {
  padding: 0 16px 4px;
}

.status-card {
  display: flex;
  align-items: center;
  background: var(--white);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
  overflow: hidden;
}

.stat-cell {
  flex: 1;
  text-align: center;
  padding: 12px 4px;
}

.stat-value {
  font-size: 20px;
  font-weight: 700;
  color: var(--green);
  line-height: 1.2;
}

.stat-label {
  font-size: 11px;
  color: var(--text-lighter);
  margin-top: 2px;
}

.stat-divider {
  width: 1px;
  height: 32px;
  background: var(--border);
  flex-shrink: 0;
}

.module-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 6vw;
  padding: 10vw 8vw 14vw;
  box-sizing: border-box;
}

.module-tile {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.6em;
  width: 100%;
  aspect-ratio: 1;
  padding: 0;
  background: var(--white);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  cursor: pointer;
  font-family: inherit;
  transition: background var(--transition), box-shadow var(--transition);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
}

.module-tile:hover:not(:disabled) {
  background: var(--green-bg);
}

.module-tile:disabled {
  opacity: 0.6;
  cursor: wait;
}

.module-icon {
  font-size: 12vw;
  line-height: 1;
}

.module-label {
  font-size: clamp(14px, 5vw, 18px);
  font-weight: 600;
  color: var(--text);
  text-align: center;
  line-height: 1.2;
}
</style>