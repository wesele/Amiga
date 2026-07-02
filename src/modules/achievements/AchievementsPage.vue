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
      <div class="achievements-card">
        <div class="achievements-grid" role="list">
          <div
            v-for="badge in achievements.items"
            :key="badge.id"
            class="achievement-badge"
            :class="{ unlocked: badge.unlocked }"
            role="listitem"
            :aria-label="t(badge.labelKey, badge.labelParams)"
          >
            <span class="achievement-icon" aria-hidden="true">{{ badge.icon }}</span>
            <span class="achievement-label">{{ t(badge.labelKey, badge.labelParams) }}</span>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from "vue";
import {
  getLearningStreak,
  getLessonMilestoneProgress,
  getPerfectLessonStreak,
  getUserVocabStats,
} from "@/shared/api.js";
import { useI18n } from "@/shared/i18n";
import { loadLearningContext } from "@/shared/learningContext.js";
import { useTargetLangStore } from "@/stores/targetLang.js";
import { pairStatsKey } from "@/modules/learn/questionTypeStats.js";
import { mistakeMilestoneProgress } from "@/modules/learn/mistakeMilestones.js";
import { loadMistakeMasteryStats } from "@/modules/path/mistakeMasteryStats.js";
import { loadBestCombo } from "@/modules/path/lessonComboStats.js";
import { loadBestAccuracy } from "@/modules/profile/accuracyPeakStats.js";
import { buildAchievements, shouldShowAchievements } from "./achievements.js";

const { t } = useI18n();
const targetLangStore = useTargetLangStore();

const lessonMilestone = ref(null);
const perfectLessonStreak = ref(null);
const learningStreak = ref(null);
const vocabStats = ref(null);
const mistakeMastery = ref(null);
const comboBest = ref(0);
const accuracyBest = ref(0);

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

async function loadProgress(nativeLang, targetLang, userId) {
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
}

onMounted(async () => {
  try {
    const { user, targetLang, nativeLang } = await loadLearningContext({
      targetLangStore,
      fallbackToFirstGoal: true,
    });
    await loadProgress(nativeLang, targetLang, user.id);
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

.achievements-card {
  margin: 0 16px;
  background: var(--surface);
  border-radius: var(--radius-md);
  padding: 12px;
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
  border-radius: var(--radius-sm);
  background: var(--surface-variant);
  opacity: 0.45;
  filter: grayscale(1);
  transition: opacity var(--transition), filter var(--transition);
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
</style>