<template>
  <div class="achievements-page">
    <header class="page-header">
      <div>
        <h1 class="page-title">{{ t("achievements.title") }}</h1>
        <p class="page-subtitle">{{ t("achievements.subtitle") }}</p>
      </div>
      <div class="range-label">{{ rangeLabel }}</div>
    </header>

    <section class="matrix-section" :aria-label="t('achievements.matrixLabel')">
      <div class="matrix-layout">
        <div class="weekday-labels" aria-hidden="true">
          <span v-for="label in weekdayLabels" :key="label">{{ label }}</span>
        </div>
        <div class="weeks-grid">
          <div v-for="week in matrix.weeks" :key="week.start" class="week-column">
            <div
              v-for="day in week.days"
              :key="day.date"
              class="day-cell"
              :class="{ future: day.isFuture }"
              :aria-label="dayAriaLabel(day)"
              :title="dayAriaLabel(day)"
            >
              <span class="mini-cell" :class="`level-${readingLevel(day.readingAm)}`" />
              <span class="mini-cell" :class="`level-${newsLevel(day.newsCount)}`" />
              <span class="mini-cell" :class="`level-${readingLevel(day.readingPm)}`" />
              <span class="mini-cell" :class="`level-${speakingLevel(day.speakingCount)}`" />
            </div>
          </div>
        </div>
      </div>
    </section>

    <section class="achievement-groups" :aria-label="t('achievements.badgesLabel')">
      <article v-for="group in achievementGroups" :key="group.key" class="achievement-group">
        <div class="group-heading">
          <div>
            <h2>{{ group.title }}</h2>
            <p>{{ group.description }}</p>
          </div>
          <span class="group-progress">{{ group.progress }}</span>
        </div>
        <div class="badge-grid">
          <div
            v-for="badge in group.badges"
            :key="badge.days"
            class="achievement-badge"
            :class="{ unlocked: badge.unlocked }"
          >
            <span class="badge-icon" aria-hidden="true">{{ badge.unlocked ? "✓" : group.icon }}</span>
            <span class="badge-name">{{ badge.label }}</span>
            <span class="badge-state">
              {{ badge.unlocked ? t("achievements.unlocked") : `${Math.min(group.value, badge.days)}/${badge.days}` }}
            </span>
          </div>
        </div>
      </article>
    </section>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from "vue";
import { useI18n } from "@/shared/i18n";
import { getCurrentUser } from "@/shared/backend/user.js";
import {
  getAchievementDays,
  getAchievementProgress,
  recordAppOpen,
} from "@/shared/backend/achievements.js";
import {
  createAchievementMatrix,
  newsLevel,
  readingLevel,
  speakingLevel,
} from "./achievementMatrix.js";

const { t, locale } = useI18n();
const records = ref([]);
const progress = ref({
  check_in_current: 0,
  check_in_best: 0,
  full_learning_current: 0,
  full_learning_best: 0,
  learning_total: 0,
});
const today = new Date();
const emptyMatrix = createAchievementMatrix([], today);
const matrix = computed(() => createAchievementMatrix(records.value, today));
const weekdayLabels = computed(() => [
  t("weekday.mon"), t("weekday.tue"), t("weekday.wed"), t("weekday.thu"),
  t("weekday.fri"), t("weekday.sat"), t("weekday.sun"),
]);
const rangeLabel = computed(() => {
  const start = new Date(`${matrix.value.startDate}T00:00:00`);
  const end = new Date(`${matrix.value.endDate}T00:00:00`);
  const options = { month: "short", day: "numeric" };
  return `${start.toLocaleDateString(locale.value, options)} – ${end.toLocaleDateString(locale.value, options)}`;
});
const achievementGroups = computed(() => [
  createGroup("checkIn", "◆", progress.value.check_in_best, [7, 30, 90, 365],
    t("achievements.streakProgress", {
      current: progress.value.check_in_current,
      best: progress.value.check_in_best,
    })),
  createGroup("fullLearning", "★", progress.value.full_learning_best, [3, 7, 30, 90],
    t("achievements.streakProgress", {
      current: progress.value.full_learning_current,
      best: progress.value.full_learning_best,
    })),
  createGroup("totalLearning", "●", progress.value.learning_total, [30, 90, 365, 1095],
    t("achievements.totalProgress", { total: progress.value.learning_total })),
]);

function createGroup(key, icon, value, thresholds, progressText) {
  return {
    key,
    icon,
    value,
    title: t(`achievements.groups.${key}.title`),
    description: t(`achievements.groups.${key}.description`),
    progress: progressText,
    badges: thresholds.map((days, index) => ({
      days,
      label: t(`achievements.groups.${key}.milestones.${index}`),
      unlocked: value >= days,
    })),
  };
}

function dayAriaLabel(day) {
  return t("achievements.daySummary", {
    date: day.date,
    am: day.readingAm,
    pm: day.readingPm,
    news: day.newsCount,
    speaking: day.speakingCount,
  });
}

onMounted(async () => {
  try {
    await recordAppOpen();
    const user = await getCurrentUser();
    if (user?.id) {
      const [days, achievementProgress] = await Promise.all([
        getAchievementDays(user.id, emptyMatrix.startDate, emptyMatrix.endDate),
        getAchievementProgress(user.id),
      ]);
      records.value = days;
      progress.value = achievementProgress;
    }
  } catch (error) {
    console.error("Failed to load achievement activity:", error);
  }
});
</script>

<style scoped>
.achievements-page {
  display: grid;
  grid-template-rows: auto auto minmax(0, 1fr);
  height: 100%;
  min-height: 0;
  overflow: hidden;
  background: var(--bg);
}

.page-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 16px 10px;
  background: var(--white);
}

.page-title {
  margin: 0;
  color: var(--text);
  font-size: 22px;
  font-weight: 800;
}

.page-subtitle {
  margin: 2px 0 0;
  color: var(--text-lighter);
  font-size: 12px;
}

.range-label {
  flex-shrink: 0;
  margin-top: 4px;
  color: var(--text-light);
  font-size: 12px;
  font-weight: 700;
}

.matrix-section {
  margin-top: 6px;
  padding: 10px 14px;
  background: var(--white);
  border-top: 1px solid var(--border);
  border-bottom: 1px solid var(--border);
}

.achievement-groups {
  display: grid;
  grid-template-rows: repeat(3, minmax(0, 1fr));
  min-height: 0;
  gap: 14px;
  padding: 14px 14px 20px;
}

.achievement-group {
  display: flex;
  min-height: 0;
  flex-direction: column;
  padding: 9px 10px;
  border: 1px solid var(--border);
  border-radius: 12px;
  background: var(--white);
}

.group-heading {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 7px;
}

.group-heading h2 {
  margin: 0;
  color: var(--text);
  font-size: 14px;
  font-weight: 800;
}

.group-heading p {
  margin: 1px 0 0;
  color: var(--text-lighter);
  font-size: 10px;
}

.group-progress {
  flex-shrink: 0;
  color: var(--text-light);
  font-size: 10px;
  font-weight: 700;
}

.badge-grid {
  display: grid;
  flex: 1;
  min-height: 0;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 6px;
}

.achievement-badge {
  display: flex;
  min-width: 0;
  min-height: 0;
  align-items: center;
  justify-content: center;
  flex-direction: column;
  padding: 5px 3px 4px;
  border: 1px solid var(--border);
  border-radius: 9px;
  background: var(--surface-variant);
  color: var(--text-lighter);
  text-align: center;
}

.achievement-badge.unlocked {
  border-color: #b7e88d;
  background: #f1fae9;
  color: #3c8500;
}

.badge-icon {
  display: grid;
  width: 21px;
  height: 21px;
  place-items: center;
  margin-bottom: 3px;
  border-radius: 50%;
  background: #d9dee5;
  color: #8c96a3;
  font-size: 12px;
  font-weight: 900;
}

.unlocked .badge-icon {
  background: #58cc02;
  color: white;
}

.badge-name {
  min-height: 24px;
  font-size: 10px;
  font-weight: 800;
  line-height: 1.35;
}

.badge-state {
  margin-top: 1px;
  font-size: 9px;
  font-weight: 700;
}

.matrix-layout {
  display: grid;
  grid-template-columns: 32px minmax(0, 1fr);
  gap: clamp(3px, 1vw, 8px);
  width: 100%;
}

.weekday-labels,
.week-column {
  display: grid;
  grid-template-rows: repeat(7, minmax(0, 1fr));
  gap: clamp(1px, 0.45vw, 3px);
}

.weekday-labels span {
  display: flex;
  align-items: center;
  color: var(--text-lighter);
  font-size: 9px;
  font-weight: 600;
}

.weeks-grid {
  display: grid;
  grid-template-columns: repeat(12, minmax(0, 1fr));
  gap: clamp(2px, 0.55vw, 4px);
  width: 100%;
}

.day-cell {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  grid-template-rows: repeat(2, 1fr);
  gap: clamp(1px, 0.25vw, 3px);
  width: 100%;
  /* 1.45 / 1.3 keeps the matrix cells 1.3x taller than the compact layout. */
  aspect-ratio: 1.12 / 1;
  padding: clamp(1px, 0.35vw, 3px);
  box-sizing: border-box;
  border-radius: 4px;
  background: var(--surface-variant);
}

.day-cell.future {
  opacity: 0.38;
}

.mini-cell {
  display: block;
  border-radius: 2px;
}

.level-empty { background: #d9dee5; }
.level-active { background: #1cb0f6; }
.level-complete { background: #58cc02; }

@media (min-width: 620px) {
  .matrix-section {
    padding-right: 20px;
    padding-left: 20px;
  }

  .achievement-groups {
    padding-right: 20px;
    padding-left: 20px;
  }

}

@media (max-height: 760px) {
  .group-heading p {
    display: none;
  }

  .group-heading {
    align-items: center;
    margin-bottom: 4px;
  }

  .badge-icon {
    width: 18px;
    height: 18px;
    margin-bottom: 2px;
  }
}
</style>
