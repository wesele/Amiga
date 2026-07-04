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
        class="path-progress-card"
        :disabled="opening === pathModule.id"
        @click="openModule(pathModule)"
      >
        <div class="path-progress-main">
          <span class="path-progress-icon">{{ pathModule.icon }}</span>
          <span class="path-progress-title">{{ t(pathModule.labelKey) }}</span>
          <span class="path-progress-level">{{ pathCefr }}</span>
        </div>
        <div class="path-progress-sub">{{ pathProgressLabel }}</div>
        <div class="path-progress-track" aria-hidden="true">
          <div class="path-progress-fill" :style="{ width: pathProgressPercent + '%' }" />
        </div>
        <div class="path-progress-meta">
          <span>{{ pathProgressDone }}/{{ pathProgressTotal }}</span>
          <span>★ {{ pathProgressStars }}</span>
        </div>
      </button>

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
import { computed, ref, onMounted } from "vue";
import { useRouter } from "vue-router";
import { useI18n } from "@/shared/i18n";
import { useTargetLangStore } from "@/stores/targetLang.js";
import { openAiContact } from "@/modules/ai-chat/openAiContact.js";
import {
  getUserVocabStats,
  getReadArticleCount,
  getLearningDays,
  getPathCurriculum,
} from "@/shared/api.js";
import { loadLearningContext } from "@/shared/learningContext.js";

const router = useRouter();
const { t } = useI18n();
const targetLangStore = useTargetLangStore();
const opening = ref(null);
const vocabStats = ref(null);
const readArticleCount = ref(0);
const learningDays = ref(0);
const pathCurriculum = ref(null);
const pathCefr = ref("A1");

const pathModule = { id: "path", labelKey: "learn.path", icon: "🛤️", route: { name: "path" } };
const modules = [
  { id: "news", labelKey: "learn.news", icon: "📰", route: { name: "news" } },
  { id: "translator", labelKey: "chat.translator", icon: "🌐", action: "translator" },
];

const pathProgressDone = computed(() => pathCurriculum.value?.completed_sections || 0);
const pathProgressTotal = computed(() => pathCurriculum.value?.total_sections || 0);
const pathProgressStars = computed(() => pathCurriculum.value?.total_stars || 0);
const pathProgressPercent = computed(() => {
  if (!pathProgressTotal.value) return 0;
  return Math.min(100, Math.round((pathProgressDone.value / pathProgressTotal.value) * 100));
});
const pathProgressLabel = computed(() => {
  const curriculum = pathCurriculum.value;
  if (!curriculum) return t("path.loading");
  if (curriculum.status === "unsupported") return t("path.unsupportedTitle");
  if (curriculum.status === "level_complete") {
    return t("path.levelCompleteTitle", { level: pathCefr.value });
  }
  return t("path.progress", {
    done: pathProgressDone.value,
    total: pathProgressTotal.value,
  });
});

onMounted(async () => {
  try {
    const ctx = await loadLearningContext({
      targetLangStore,
      fallbackToFirstGoal: true,
    });
    const user = ctx.user;
    const lang = ctx.targetLang || targetLangStore.code || "";
    pathCefr.value = ctx.cefr || pathCefr.value;
    if (user?.id) {
      vocabStats.value = await getUserVocabStats(user.id, lang);
      readArticleCount.value = await getReadArticleCount(user.id);
      learningDays.value = await getLearningDays(user.id);
      pathCurriculum.value = await getPathCurriculum(
        ctx.nativeLang || user.native_language,
        lang,
        pathCefr.value,
      );
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
  padding: 0 0 4px;
}

.status-card {
  display: flex;
  align-items: center;
  background: var(--white);
  border: 1px solid var(--border);
  border-right: 0;
  border-left: 0;
  border-radius: 0;
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
  --module-grid-x: 8vw;
  --module-grid-row-gap: 8vw;
  --module-grid-col-gap: 6vw;

  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--module-grid-row-gap) var(--module-grid-col-gap);
  padding: var(--module-grid-row-gap) var(--module-grid-x) 14vw;
  box-sizing: border-box;
}

.path-progress-card {
  grid-column: 1 / -1;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  gap: 8px;
  width: 100%;
  height: calc((100vw - (var(--module-grid-x) * 2) - var(--module-grid-col-gap)) / 2);
  padding: 14px 16px;
  background: linear-gradient(135deg, #ffffff 0%, #eef8f0 100%);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  cursor: pointer;
  font-family: inherit;
  text-align: left;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
  transition: background var(--transition), box-shadow var(--transition);
}

.path-progress-card:hover:not(:disabled) {
  background: var(--green-bg);
}

.path-progress-card:disabled {
  opacity: 0.6;
  cursor: wait;
}

.path-progress-main {
  display: grid;
  grid-template-columns: auto 1fr auto;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.path-progress-icon {
  font-size: 30px;
  line-height: 1;
}

.path-progress-title {
  font-size: 18px;
  font-weight: 800;
  color: var(--text);
  line-height: 1.2;
}

.path-progress-sub {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-light);
  line-height: 1.3;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.path-progress-level {
  padding: 5px 9px;
  border-radius: 999px;
  background: var(--green);
  color: var(--white);
  font-size: 12px;
  font-weight: 800;
  line-height: 1;
}

.path-progress-track {
  width: 100%;
  height: 9px;
  overflow: hidden;
  border-radius: 999px;
  background: rgba(88, 204, 2, 0.16);
}

.path-progress-fill {
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(90deg, var(--green) 0%, #1cb0f6 100%);
  transition: width var(--transition);
}

.path-progress-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 12px;
  font-weight: 800;
  color: var(--text-light);
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
