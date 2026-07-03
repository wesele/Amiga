<template>
  <div class="achievements-page">
    <header class="page-header">
      <h1 class="page-title">{{ t("achievements.title") }}</h1>
    </header>

    <section v-if="showAchievements" class="achievements-section">
      <p class="section-desc">
        {{ t("achievements.summary", {
          unlocked: achievements.unlockedCount,
          total: achievements.totalCount,
        }) }}
      </p>

      <section v-if="recentBadges.length" class="recent-strip">
        <p class="recent-title">{{ t("achievements.recentUnlocks") }}</p>
        <div class="recent-scroll" role="list">
          <button
            v-for="badge in recentBadges"
            :key="badge.id"
            type="button"
            class="recent-chip"
            role="listitem"
            @click="openBadge(badge)"
          >
            <span class="recent-icon" aria-hidden="true">{{ badge.icon }}</span>
            <span class="recent-label">{{ t(badge.labelKey, badge.labelParams) }}</span>
          </button>
        </div>
      </section>

      <section v-if="focus" class="focus-hero-card">
        <p class="focus-eyebrow">{{ t("achievements.nextBadge") }}</p>
        <div class="focus-hero-body">
          <div class="milestone-ring" aria-hidden="true">
            <svg viewBox="0 0 44 44" class="milestone-ring-svg">
              <circle class="milestone-ring-track" cx="22" cy="22" r="18" />
              <circle
                class="milestone-ring-fill"
                cx="22"
                cy="22"
                r="18"
                :style="{ strokeDashoffset: focus.ringOffset }"
              />
            </svg>
            <span class="milestone-ring-label">{{ focus.badge.icon }}</span>
          </div>
          <div class="focus-copy">
            <p class="focus-title">{{ t(focus.badge.labelKey, focus.badge.labelParams) }}</p>
            <p class="focus-sub">
              {{ t("achievements.nextBadgeProgress", { current: focus.current, target: focus.target }) }}
              · {{ t("achievements.nextBadgeRemaining", { remaining: focus.remaining }) }}
            </p>
          </div>
        </div>
        <button type="button" class="focus-action" @click="goToFocus">
          {{ t(focus.actionKey) }}
        </button>
      </section>

      <section v-else-if="showAchievements" class="all-unlocked-card">
        <p class="all-unlocked-title">{{ t("achievements.allUnlocked") }}</p>
        <button type="button" class="focus-action" @click="goToPath">
          {{ t("achievements.actionPath") }}
        </button>
      </section>

      <div
        v-for="group in achievementGroups"
        :key="group.category.id"
        class="category-block"
      >
        <div class="category-header">
          <span class="category-icon" aria-hidden="true">{{ group.category.icon }}</span>
          <h2 class="category-title">{{ t(group.category.labelKey) }}</h2>
          <span class="category-progress">
            {{ t("achievements.groupProgress", { unlocked: group.unlocked, total: group.total }) }}
          </span>
        </div>
        <div class="achievements-grid" role="list">
          <button
            v-for="badge in group.badges"
            :key="badge.id"
            type="button"
            class="achievement-badge"
            :class="{ unlocked: badge.unlocked }"
            role="listitem"
            :aria-label="t(badge.labelKey, badge.labelParams)"
            @click="openBadge(badge)"
          >
            <span class="achievement-icon" aria-hidden="true">{{ badge.icon }}</span>
            <span class="achievement-label">{{ t(badge.labelKey, badge.labelParams) }}</span>
          </button>
        </div>
      </div>
    </section>

    <Teleport to="body">
      <div v-if="sheetBadge" class="badge-overlay" @click.self="closeSheet">
        <div class="badge-sheet">
          <div class="badge-sheet-icon" aria-hidden="true">{{ sheetBadge.icon }}</div>
          <h3 class="badge-sheet-title">
            {{ t(sheetBadge.labelKey, sheetBadge.labelParams) }}
          </h3>
          <p class="badge-sheet-status">
            {{ sheetBadge.unlocked ? t("achievements.sheetUnlocked") : t("achievements.sheetLocked") }}
          </p>
          <p class="badge-sheet-hint">
            {{
              sheetBadge.unlocked
                ? t(sheetBadge.labelKey, sheetBadge.labelParams)
                : t(sheetHint.hintKey, sheetHint.hintParams)
            }}
          </p>
          <button
            v-if="!sheetBadge.unlocked"
            type="button"
            class="badge-sheet-action"
            @click="goToSheetAction"
          >
            {{ t(sheetHint.actionKey) }}
          </button>
          <button type="button" class="badge-sheet-close" @click="closeSheet">
            {{ t("app.cancel") }}
          </button>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import {
  getLearningStreak,
  getLessonMilestoneProgress,
  getPathCurriculum,
  getPerfectLessonStreak,
  getUserVocabStats,
} from "@/shared/api.js";
import { useI18n } from "@/shared/i18n";
import { loadLearningContext } from "@/shared/learningContext.js";
import { useTargetLangStore } from "@/stores/targetLang.js";
import { pairStatsKey } from "@/modules/learn/questionTypeStats.js";
import { mistakeMilestoneProgress } from "@/modules/learn/mistakeMilestones.js";
import { vocabMilestoneProgress } from "@/modules/learn/vocabMilestones.js";
import { perfectMilestoneProgress } from "@/modules/learn/perfectMilestones.js";
import { streakMilestoneProgress } from "@/modules/learn/streakMilestones.js";
import { comboMilestoneProgress } from "@/modules/learn/comboMilestones.js";
import { accuracyMilestoneProgress } from "@/modules/profile/accuracyMilestones.js";
import { findCurrentSection } from "@/modules/learn/pathResume.js";
import { loadMistakeMasteryStats } from "@/modules/path/mistakeMasteryStats.js";
import { loadBestCombo } from "@/modules/path/lessonComboStats.js";
import { loadBestAccuracy } from "@/modules/profile/accuracyPeakStats.js";
import { buildAchievements, shouldShowAchievements } from "./achievements.js";
import { pickNextAchievementFocus } from "./achievementFocus.js";
import { groupAchievements } from "./achievementGroups.js";
import {
  achievementCategoryCurrentValue,
  achievementUnlockHint,
} from "./achievementHints.js";
import { syncRecentUnlocks } from "./achievementRecent.js";
import {
  ACHIEVEMENT_ATTENTION_CHANGED,
  clearUnseenUnlocks,
} from "./achievementUnlockDetect.js";
import { eventBus } from "@/shared/eventBus.js";

const { t } = useI18n();
const router = useRouter();
const targetLangStore = useTargetLangStore();

const lessonMilestone = ref(null);
const perfectLessonStreak = ref(null);
const learningStreak = ref(null);
const vocabStats = ref(null);
const mistakeMastery = ref(null);
const comboBest = ref(0);
const accuracyBest = ref(0);
const resumeTarget = ref(null);
const recentUnlockIds = ref([]);
const sheetBadge = ref(null);

const achievements = computed(() =>
  buildAchievements({
    lessonProgress: lessonMilestone.value,
    perfectStreak: perfectLessonStreak.value,
    learningStreak: learningStreak.value,
    vocabStats: vocabStats.value,
    mistakeMastery: mistakeMastery.value,
    comboBest: comboBest.value,
    accuracyBest: accuracyBest.value,
  }),
);
const showAchievements = computed(() => shouldShowAchievements(achievements.value));

const progressCtx = computed(() => ({
  lesson: lessonMilestone.value,
  perfect: perfectMilestoneProgress(perfectLessonStreak.value?.best ?? 0),
  streak: streakMilestoneProgress(
    learningStreak.value?.current ?? 0,
    learningStreak.value?.longest ?? 0,
  ),
  vocab: vocabMilestoneProgress(vocabStats.value?.total_known ?? 0),
  mistake: mistakeMastery.value,
  combo: comboMilestoneProgress(comboBest.value),
  accuracy: accuracyMilestoneProgress(accuracyBest.value),
}));

const achievementGroups = computed(() => groupAchievements(achievements.value.items));

const focus = computed(() =>
  pickNextAchievementFocus(progressCtx.value, achievements.value.items, {
    resumeTarget: resumeTarget.value,
  }),
);

const recentBadges = computed(() => {
  const byId = new Map(achievements.value.items.map((item) => [item.id, item]));
  return recentUnlockIds.value
    .map((entry) => byId.get(entry.badgeId))
    .filter(Boolean);
});

const sheetHint = computed(() => {
  if (!sheetBadge.value || sheetBadge.value.unlocked) {
    return { hintKey: "", hintParams: {}, actionKey: "", route: null };
  }
  const current = achievementCategoryCurrentValue(sheetBadge.value.category, progressCtx.value);
  return achievementUnlockHint(sheetBadge.value, current, {
    resumeTarget: resumeTarget.value,
  });
});

function openBadge(badge) {
  sheetBadge.value = badge;
}

function closeSheet() {
  sheetBadge.value = null;
}

function goToFocus() {
  if (!focus.value?.route) return;
  router.push(focus.value.route);
}

function goToPath() {
  router.push({ name: "path" });
}

function goToSheetAction() {
  if (!sheetHint.value.route) return;
  router.push(sheetHint.value.route);
  closeSheet();
}

function trackRecentUnlocks() {
  const unlockedIds = achievements.value.items
    .filter((item) => item.unlocked)
    .map((item) => item.id);
  recentUnlockIds.value = syncRecentUnlocks(unlockedIds);
}

async function loadResumeTarget(nativeLang, targetLang, cefr) {
  resumeTarget.value = null;
  if (!nativeLang || !targetLang || !cefr) return;
  try {
    const curriculum = await getPathCurriculum(nativeLang, targetLang, cefr);
    const hit = findCurrentSection(curriculum);
    if (hit) resumeTarget.value = hit;
  } catch {
    resumeTarget.value = null;
  }
}

async function loadProgress(nativeLang, targetLang, userId, cefr) {
  lessonMilestone.value = null;
  perfectLessonStreak.value = null;
  mistakeMastery.value = null;
  comboBest.value = 0;
  accuracyBest.value = 0;

  if (!nativeLang || !targetLang) return;

  try {
    lessonMilestone.value = await getLessonMilestoneProgress(nativeLang, targetLang);
  } catch {
    lessonMilestone.value = null;
  }
  try {
    perfectLessonStreak.value = await getPerfectLessonStreak();
  } catch {
    perfectLessonStreak.value = null;
  }

  const pairKey = pairStatsKey(nativeLang, targetLang);
  const mastered = loadMistakeMasteryStats(pairKey);
  mistakeMastery.value = mistakeMilestoneProgress(mastered);
  comboBest.value = loadBestCombo(pairKey);
  accuracyBest.value = loadBestAccuracy(pairKey);

  try {
    vocabStats.value = await getUserVocabStats(userId, targetLang);
  } catch {
    vocabStats.value = null;
  }
  try {
    learningStreak.value = await getLearningStreak(userId);
  } catch {
    learningStreak.value = null;
  }

  await loadResumeTarget(nativeLang, targetLang, cefr);
  trackRecentUnlocks();
}

onMounted(async () => {
  clearUnseenUnlocks();
  eventBus.emit(ACHIEVEMENT_ATTENTION_CHANGED);
  try {
    const { user, targetLang, nativeLang, cefr } = await loadLearningContext({
      targetLangStore,
      fallbackToFirstGoal: true,
    });
    await loadProgress(nativeLang, targetLang, user.id, cefr);
  } catch (e) {
    console.error("Failed to load achievements:", e);
  }
});
</script>

<style scoped>
.achievements-page {
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

.achievements-section {
  padding: 12px 0 24px;
}

.section-desc {
  margin: 0 16px 10px;
  font-size: 13px;
  color: var(--text-lighter);
  line-height: 1.45;
}

.recent-strip {
  margin: 0 16px 12px;
}

.recent-title {
  margin: 0 0 8px;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-lighter);
}

.recent-scroll {
  display: flex;
  gap: 8px;
  overflow-x: auto;
  padding-bottom: 2px;
}

.recent-chip {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
  padding: 8px 12px;
  border: none;
  border-radius: 999px;
  background: var(--green-bg);
  color: var(--text);
  font-size: 12px;
  cursor: pointer;
}

.recent-icon {
  font-size: 16px;
  line-height: 1;
}

.focus-hero-card,
.all-unlocked-card {
  margin: 0 16px 16px;
  padding: 14px;
  border-radius: var(--radius-md);
  background: var(--surface);
}

.focus-eyebrow {
  margin: 0 0 10px;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-lighter);
}

.focus-hero-body {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
}

.milestone-ring {
  position: relative;
  width: 52px;
  height: 52px;
  flex-shrink: 0;
}

.milestone-ring-svg {
  width: 100%;
  height: 100%;
  transform: rotate(-90deg);
}

.milestone-ring-track {
  fill: none;
  stroke: #f0d9a0;
  stroke-width: 4;
}

.milestone-ring-fill {
  fill: none;
  stroke: #d4a017;
  stroke-width: 4;
  stroke-linecap: round;
  stroke-dasharray: 113.1;
  transition: stroke-dashoffset 0.4s ease;
}

.milestone-ring-label {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 20px;
}

.focus-copy {
  min-width: 0;
}

.focus-title {
  margin: 0;
  font-size: 16px;
  font-weight: 700;
}

.focus-sub {
  margin: 4px 0 0;
  font-size: 13px;
  color: var(--text-light);
  line-height: 1.4;
}

.focus-action {
  width: 100%;
  padding: 10px 14px;
  border: none;
  border-radius: var(--radius-sm);
  background: var(--green);
  color: var(--white);
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
}

.all-unlocked-title {
  margin: 0 0 12px;
  font-size: 15px;
  font-weight: 600;
  text-align: center;
}

.category-block {
  margin: 0 16px 14px;
  padding: 12px;
  border-radius: var(--radius-md);
  background: var(--surface);
}

.category-header {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 10px;
}

.category-icon {
  font-size: 16px;
  line-height: 1;
}

.category-title {
  margin: 0;
  flex: 1;
  font-size: 14px;
  font-weight: 700;
}

.category-progress {
  font-size: 11px;
  color: var(--text-lighter);
}

.achievements-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
}

.achievement-badge {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 10px 6px;
  border: none;
  border-radius: var(--radius-sm);
  background: var(--surface-variant);
  opacity: 0.45;
  filter: grayscale(1);
  transition: opacity var(--transition), filter var(--transition);
  cursor: pointer;
}

.achievement-badge.unlocked {
  opacity: 1;
  filter: none;
  background: var(--green-bg);
}

.achievement-icon {
  font-size: 22px;
  line-height: 1;
}

.achievement-label {
  font-size: 10px;
  font-weight: 500;
  color: var(--text-light);
  text-align: center;
  line-height: 1.2;
}

.achievement-badge.unlocked .achievement-label {
  color: var(--text);
}

.badge-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.45);
  display: flex;
  align-items: flex-end;
  justify-content: center;
  z-index: 1000;
  padding: 0 16px calc(16px + var(--safe-bottom));
}

.badge-sheet {
  width: 100%;
  max-width: 400px;
  background: var(--white);
  border-radius: 20px 20px 16px 16px;
  padding: 20px 20px 16px;
  text-align: center;
}

.badge-sheet-icon {
  font-size: 40px;
  line-height: 1;
  margin-bottom: 8px;
}

.badge-sheet-title {
  margin: 0 0 6px;
  font-size: 18px;
  font-weight: 700;
}

.badge-sheet-status {
  margin: 0 0 8px;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-lighter);
}

.badge-sheet-hint {
  margin: 0 0 16px;
  font-size: 14px;
  color: var(--text-light);
  line-height: 1.45;
}

.badge-sheet-action {
  width: 100%;
  margin-bottom: 8px;
  padding: 12px 14px;
  border: none;
  border-radius: var(--radius-sm);
  background: var(--green);
  color: var(--white);
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
}

.badge-sheet-close {
  width: 100%;
  padding: 10px 14px;
  border: none;
  border-radius: var(--radius-sm);
  background: var(--surface-variant);
  color: var(--text);
  font-size: 14px;
  cursor: pointer;
}
</style>