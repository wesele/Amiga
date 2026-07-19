<template>
  <div
    class="achievements-page"
    :class="{ 'tv-content-pane tv-content-pane--fixed tv-achievements': isTvMode }"
  >
    <header class="page-header">
      <div>
        <h1 class="page-title">{{ t("achievements.title") }}</h1>
        <p class="page-subtitle">{{ t("achievements.subtitle") }}</p>
      </div>
      <div class="range-label">{{ rangeLabel }}</div>
    </header>

    <div class="achievements-body">
      <section class="matrix-section" :aria-label="t('achievements.matrixLabel')">
        <!-- Phone: columns = weeks (GitHub-style). TV: each row = one week. -->
        <div class="matrix-layout" :class="{ 'tv-week-rows': isTvMode }">
          <template v-if="!isTvMode">
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
                  <span
                    v-for="track in visibleTracks"
                    :key="track"
                    class="mini-cell"
                    :class="`level-${trackLevel(track, day)}`"
                  />
                </div>
              </div>
            </div>
          </template>
          <template v-else>
            <div class="weekday-header-row" aria-hidden="true">
              <span v-for="label in weekdayLabels" :key="label">{{ label }}</span>
            </div>
            <div class="weeks-rows">
              <div v-for="week in matrix.weeks" :key="week.start" class="week-row">
                <div
                  v-for="day in week.days"
                  :key="day.date"
                  class="day-cell tv-day-cell"
                  :class="{ future: day.isFuture }"
                  :aria-label="dayAriaLabel(day)"
                  :title="dayAriaLabel(day)"
                >
                  <span
                    v-for="track in visibleTracks"
                    :key="track"
                    class="mini-cell"
                    :class="`level-${trackLevel(track, day)}`"
                  />
                </div>
              </div>
            </div>
          </template>
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
import { isTvMode } from "@/shared/appMode.js";
import { achievementTracksForMode } from "@/shared/tvPolicy.js";

const { t, locale } = useI18n();
const visibleTracks = achievementTracksForMode(isTvMode);

function trackLevel(track, day) {
  if (track === "readingAm") return readingLevel(day.readingAm);
  if (track === "readingPm") return readingLevel(day.readingPm);
  if (track === "news") return newsLevel(day.newsCount);
  if (track === "speaking") return speakingLevel(day.speakingCount);
  return "empty";
}
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
  if (isTvMode) {
    return t("achievements.daySummaryTv", {
      date: day.date,
      am: day.readingAm,
      pm: day.readingPm,
      news: day.newsCount,
    });
  }
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
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  overflow: hidden;
  background: var(--bg);
}

.achievements-body {
  display: flex;
  flex: 1 1 auto;
  min-height: 0;
  flex-direction: column;
  overflow: hidden;
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
  flex-shrink: 0;
  margin-top: 6px;
  padding: 10px 14px;
  background: var(--white);
  border-top: 1px solid var(--border);
  border-bottom: 1px solid var(--border);
}

.achievement-groups {
  display: grid;
  flex: 1 1 auto;
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

/* TV shell chrome comes from global .tv-content-pane; keep split layout here. */
.tv-achievements .page-header {
  flex: 0 0 auto;
  padding: 10px 18px 8px;
  border-bottom: 1px solid var(--border);
  background: var(--white);
}

.tv-achievements .page-title {
  font-size: 24px;
}

.tv-achievements .page-subtitle {
  font-size: 13px;
}

.tv-achievements .range-label {
  font-size: 13px;
  margin-top: 4px;
}

.tv-achievements .achievements-body {
  /* height:0 + flex:1 forces body into remaining viewport under the header */
  display: grid;
  grid-template-columns: 1fr 1fr;
  grid-template-rows: minmax(0, 1fr);
  flex: 1 1 0;
  height: 0;
  min-height: 0;
  align-items: stretch;
  overflow: hidden;
  background: var(--white);
}

.tv-achievements .matrix-section {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  grid-template-rows: minmax(0, 1fr);
  width: auto;
  max-width: 100%;
  min-width: 0;
  min-height: 0;
  margin-top: 0;
  padding: 14px 12px 14px 16px;
  border-top: none;
  border-bottom: none;
  border-right: 1px solid var(--border);
  overflow: hidden;
  background: var(--white);
}

/* TV matrix: each horizontal row = one week (Mon→Sun), 12 rows total. */
.tv-achievements .matrix-layout.tv-week-rows {
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
  gap: 6px;
}

.tv-achievements .weekday-header-row {
  flex: 0 0 auto;
  display: grid;
  grid-template-columns: repeat(7, minmax(0, 1fr));
  gap: 4px;
  min-width: 0;
}

.tv-achievements .weekday-header-row span {
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 0;
  color: var(--text-lighter);
  font-size: 12px;
  font-weight: 700;
  line-height: 1;
}

.tv-achievements .weeks-rows {
  flex: 1 1 0;
  min-height: 0;
  min-width: 0;
  display: grid;
  grid-template-rows: repeat(12, minmax(0, 1fr));
  gap: 4px;
}

.tv-achievements .week-row {
  display: grid;
  grid-template-columns: repeat(7, minmax(0, 1fr));
  gap: 4px;
  min-height: 0;
  min-width: 0;
}

.tv-achievements .day-cell,
.tv-achievements .day-cell.tv-day-cell {
  /* No aspect-ratio: 12 week-rows must fit the left pane height. */
  aspect-ratio: auto;
  box-sizing: border-box;
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
  padding: 2px;
  border-radius: 4px;
  gap: 1px;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  grid-template-rows: repeat(2, minmax(0, 1fr));
  overflow: hidden;
}

.tv-achievements .mini-cell {
  border-radius: 2px;
  min-height: 0;
  min-width: 0;
}

.tv-achievements .achievement-groups {
  width: auto;
  max-width: 100%;
  min-width: 0;
  min-height: 0;
  gap: 8px;
  padding: 12px 14px 12px 10px;
  overflow: hidden;
  background: var(--white);
}

.tv-achievements .achievement-group {
  min-height: 0;
  padding: 8px 10px;
  border-radius: 14px;
}

.tv-achievements .group-heading {
  margin-bottom: 6px;
}

.tv-achievements .group-heading h2 {
  font-size: 14px;
}

.tv-achievements .group-heading p {
  display: block;
  font-size: 11px;
  line-height: 1.25;
}

.tv-achievements .group-progress {
  font-size: 11px;
}

.tv-achievements .badge-grid {
  gap: 6px;
}

.tv-achievements .achievement-badge {
  padding: 6px 4px 5px;
  border-radius: 10px;
}

.tv-achievements .badge-icon {
  width: 22px;
  height: 22px;
  margin-bottom: 3px;
  font-size: 12px;
}

.tv-achievements .badge-name {
  min-height: 20px;
  font-size: 11px;
}

.tv-achievements .badge-state {
  font-size: 10px;
}
</style>
