<template>
  <div class="learn-hub" :class="{ 'tv-content-pane tv-learn-hub': isTvMode }">
    <header class="page-header">
      <h1 class="page-title">{{ t("learn.title") }}</h1>
      <div class="header-days">
        {{ t("learn.learnedPrefix") }}<span class="days-num">{{ learningDays }}</span>{{ t("learn.learnedSuffix") }}
      </div>
    </header>

    <section class="status-section">
      <div class="status-card">
        <button class="stat-cell stat-cell-link" type="button" @click="openVocab">
          <div class="stat-value">{{ vocabStats?.total_known || 0 }}</div>
          <div class="stat-label">{{ t("profile.words") }}</div>
        </button>
        <div class="stat-divider" />
        <div class="stat-cell">
          <div class="stat-value">{{ readArticleCount }}</div>
          <div class="stat-label">{{ t("profile.articles") }}</div>
        </div>
        <div class="stat-divider" />
        <div class="stat-cell">
          <div class="stat-value">{{ completedReadingCount }}</div>
          <div class="stat-label">{{ t("profile.reading") }}</div>
        </div>
        <div v-if="!isTvMode" class="stat-divider" />
        <div v-if="!isTvMode" class="stat-cell">
          <div class="stat-value">{{ completedSpeakingCount }}</div>
          <div class="stat-label">{{ t("learn.speakingCount") }}</div>
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
           <span class="path-progress-icon" v-html="pathModule.icon"></span>
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
         <span class="module-icon" v-html="mod.icon"></span>
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
import { openAiContact } from "@/shared/aiContact.js";
import { getLearningDays, getReadArticleCount } from "@/shared/backend/news.js";
import { getPathCurriculum } from "@/shared/backend/path.js";
import { getCompletedReadingCount } from "@/shared/backend/reading.js";
import { getCompletedSpeakingCount } from "@/shared/backend/speaking.js";
import { getUserVocabStats } from "@/shared/backend/vocabulary.js";
import { loadLearningContext } from "@/shared/learningContext.js";
import { isTvMode } from "@/shared/appMode.js";

const router = useRouter();
const { t } = useI18n();
const targetLangStore = useTargetLangStore();
const opening = ref(null);
const vocabStats = ref(null);
const readArticleCount = ref(0);
const learningDays = ref(0);
const completedReadingCount = ref(0);
const completedSpeakingCount = ref(0);
const pathCurriculum = ref(null);
const pathCefr = ref("A1");

const pathModule = { id: "path", labelKey: "learn.path", icon: '<svg viewBox="0 0 24 24" fill="none" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" width="1em" height="1em"><path d="M4 20l4-4" stroke="#58cc02"/><path d="M8 16l4-4" stroke="#1cb0f6"/><path d="M12 12l4-4" stroke="#58cc02"/><path d="M16 8l4-4" stroke="#1cb0f6"/></svg>', route: { name: "path" } };
const allModules = [
  { id: "news", labelKey: "learn.news", icon: '<svg viewBox="0 0 24 24" fill="none" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" width="1em" height="1em"><rect x="4" y="4" width="16" height="16" rx="2" stroke="#58cc02"/><path d="M4 12h16" stroke="#1cb0f6"/><path d="M12 4v16" stroke="#58cc02"/><path d="M8 8h8" stroke="#1cb0f6"/></svg>', route: { name: "news" } },
  { id: "reading", labelKey: "learn.reading", icon: '<svg viewBox="0 0 24 24" fill="none" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" width="1em" height="1em"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" stroke="#58cc02"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" stroke="#1cb0f6"/></svg>', route: { name: "reading" } },
  { id: "speaking", labelKey: "learn.speaking", icon: '<svg viewBox="0 0 24 24" fill="none" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" width="1em" height="1em"><path d="M7 8a3 3 0 1 1 0 6 3 3 0 0 1 0-6z" stroke="#58cc02"/><path d="M17 8a3 3 0 1 0 0 6 3 3 0 0 0 0-6z" stroke="#1cb0f6"/><path d="M6 16c0-2 2-3 3-3h4c1 0 2 1 2 3" stroke="#58cc02"/><path d="M14 16c0-2 2-3 3-3h4c1 0 2 1 2 3" stroke="#1cb0f6"/></svg>', route: { name: "speaking" } },
  { id: "translator", labelKey: "chat.translator", icon: '<svg viewBox="0 0 24 24" fill="none" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" width="1em" height="1em"><circle cx="12" cy="12" r="9" stroke="#58cc02"/><line x1="3" y1="12" x2="21" y2="12" stroke="#1cb0f6"/><path d="M12 3a9 9 0 0 1 3 9 9 9 0 0 1-3 9 9 9 0 0 1-3-9 9 9 0 0 1 3-9z" stroke="#58cc02"/></svg>', action: "translator" },
  // Multisexual five-color ring: pink / yellow / green / blue / purple.
  { id: "soulmate", labelKey: "learn.soulmate", icon: '<svg viewBox="0 0 24 24" fill="none" width="1em" height="1em"><path d="M12 4 A8 8 0 0 1 19.6 9.5" stroke="#FF4D9A" stroke-width="2.6" stroke-linecap="round"/><path d="M19.6 9.5 A8 8 0 0 1 16.5 18.3" stroke="#FFC94D" stroke-width="2.6" stroke-linecap="round"/><path d="M16.5 18.3 A8 8 0 0 1 7.5 18.3" stroke="#58cc02" stroke-width="2.6" stroke-linecap="round"/><path d="M7.5 18.3 A8 8 0 0 1 4.4 9.5" stroke="#1cb0f6" stroke-width="2.6" stroke-linecap="round"/><path d="M4.4 9.5 A8 8 0 0 1 12 4" stroke="#9B6DFF" stroke-width="2.6" stroke-linecap="round"/><circle cx="12" cy="12" r="2.9" fill="#FF4D9A"/><circle cx="12" cy="12" r="1.35" fill="#FFC94D"/></svg>', route: { name: "soulmate" } },
];

const tvExcludedModules = new Set(["speaking", "translator"]);
const modules = computed(() => (
  isTvMode ? allModules.filter((mod) => !tvExcludedModules.has(mod.id)) : allModules
));

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
      completedReadingCount.value = await getCompletedReadingCount(user.id);
      if (!isTvMode) completedSpeakingCount.value = await getCompletedSpeakingCount(user.id);
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

function openVocab() {
  router.push({ name: "vocab" });
}
</script>

<style scoped>
.learn-hub {
  min-height: 100%;
  background: var(--bg);
}

.page-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 16px 20px 12px;
  background: var(--white);
}

.page-title {
  margin: 0;
  font-size: 22px;
  font-weight: 700;
}

.header-days {
  flex-shrink: 0;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-light);
  white-space: nowrap;
}

.days-num {
  font-size: 22px;
  font-weight: 700;
  color: var(--green);
}

.status-section {
  padding: 0;
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

.stat-cell-link {
  align-self: stretch;
  border: 0;
  background: transparent;
  cursor: pointer;
  font-family: inherit;
  transition: background var(--transition);
}

.stat-cell-link:hover,
.stat-cell-link:focus-visible {
  background: var(--green-bg);
  outline: none;
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
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: var(--module-grid-row-gap) var(--module-grid-col-gap);
  padding: var(--module-grid-x) var(--module-grid-x) 14vw;
  box-sizing: border-box;
}

.path-progress-card {
  grid-column: 1 / -1;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  gap: 8px;
  width: 100%;
  min-width: 0;
  box-sizing: border-box;
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
  min-width: 0;
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
  font-size: clamp(34px, 9vw, 44px);
  line-height: 1;
}

.module-label {
  font-size: clamp(12px, 3.6vw, 16px);
  font-weight: 600;
  color: var(--text);
  text-align: center;
  line-height: 1.2;
}

/* TV shell chrome: global .tv-content-pane. No nested floating card shell. */
.tv-learn-hub .page-header {
  padding: 14px 18px 10px;
  background: var(--white);
  border-bottom: 0;
}

.tv-learn-hub .page-title {
  font-size: clamp(26px, 2.4vw, 34px);
}

.tv-learn-hub .header-days {
  font-size: 15px;
}

.tv-learn-hub .days-num {
  font-size: 22px;
}

.tv-learn-hub .status-section {
  padding: 0 18px;
  box-sizing: border-box;
}

.tv-learn-hub .status-card {
  border: 0;
  border-bottom: 1px solid var(--border);
  border-radius: 12px;
  box-shadow: none;
  background: var(--surface-variant, #f3f3f3);
}

.tv-learn-hub .stat-cell {
  padding: 12px 8px;
}

.tv-learn-hub .stat-value {
  font-size: 24px;
}

.tv-learn-hub .stat-label {
  font-size: 13px;
}

/* Path full-width + one row of three: 新闻 / 阅读 / 灵伴 */
.tv-learn-hub .module-grid {
  --module-grid-x: 0px;
  --module-grid-row-gap: 16px;
  --module-grid-col-gap: 16px;
  flex: 1 1 auto;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  align-content: start;
  width: 100%;
  padding: 16px 18px 18px;
  box-sizing: border-box;
}

.tv-learn-hub .path-progress-card {
  width: 100%;
  height: auto;
  min-height: 112px;
  max-height: 140px;
  padding: 16px 18px;
  gap: 8px;
}

.tv-learn-hub .path-progress-icon {
  font-size: 32px;
}

.tv-learn-hub .path-progress-title {
  font-size: 22px;
}

.tv-learn-hub .path-progress-sub {
  font-size: 14px;
}

.tv-learn-hub .path-progress-level {
  font-size: 13px;
  padding: 6px 11px;
}

.tv-learn-hub .path-progress-track {
  height: 10px;
}

.tv-learn-hub .path-progress-meta {
  font-size: 13px;
}

.tv-learn-hub .module-tile {
  aspect-ratio: auto;
  width: 100%;
  height: auto;
  min-height: 140px;
  max-height: 180px;
  flex-direction: column;
  justify-content: center;
  gap: 14px;
  padding: 22px 16px;
}

.tv-learn-hub .module-icon {
  font-size: 44px;
  flex-shrink: 0;
}

.tv-learn-hub .module-label {
  font-size: 20px;
  text-align: center;
}

/* TV focus: inset ring (no scale) so tiles are not clipped / shove neighbors. */
.tv-learn-hub .module-tile:focus-visible,
.tv-learn-hub .path-progress-card:focus-visible,
.tv-learn-hub .stat-cell-link:focus-visible {
  transform: none;
  outline: 4px solid #1cb0f6 !important;
  outline-offset: -4px;
  box-shadow:
    inset 0 0 0 2px rgba(28, 176, 246, 0.2),
    0 4px 16px rgba(28, 176, 246, 0.18) !important;
  background: var(--green-bg);
  z-index: 5;
}
</style>
