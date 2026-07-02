<template>
  <div class="learn-hub">
    <header class="page-header">
      <h1 class="page-title">{{ t("learn.title") }}</h1>
    </header>

    <button
      v-if="resumeTarget"
      type="button"
      class="continue-card"
      @click="continueLearning"
    >
      <span class="continue-icon" aria-hidden="true">{{ resumeIcon }}</span>
      <div class="continue-copy">
        <p class="continue-eyebrow">{{ t("learn.continueLearning") }}</p>
        <p class="continue-title">{{ resumeTarget.section.title_native }}</p>
        <p class="continue-sub">
          {{ t("learn.continueUnit", { unit: resumeTarget.unit.title_native }) }}
          · {{ t(resumeKindKey) }}
        </p>
      </div>
      <span class="continue-action">{{ t("learn.continueAction") }}</span>
    </button>

    <button
      v-if="showVocabReview"
      type="button"
      class="vocab-review-card"
      @click="goToVocabReview"
    >
      <span class="vocab-review-icon" aria-hidden="true">📚</span>
      <div class="vocab-review-copy">
        <p class="vocab-review-title">{{ t("learn.vocabReview") }}</p>
        <p class="vocab-review-sub">
          {{ t("learn.vocabReviewHint", { n: vocabReviewTotal }) }}
          <template v-if="vocabReviewPreviewText">
            · {{ vocabReviewPreviewText }}<template v-if="vocabReviewTruncated">…</template>
          </template>
        </p>
      </div>
      <span class="vocab-review-action">{{ t("learn.vocabReviewAction") }}</span>
    </button>

    <button
      v-if="showLessonMilestone"
      type="button"
      class="milestone-card"
      @click="goToPath"
    >
      <div class="milestone-ring" aria-hidden="true">
        <svg viewBox="0 0 44 44" class="milestone-ring-svg">
          <circle class="milestone-ring-track" cx="22" cy="22" r="18" />
          <circle
            class="milestone-ring-fill"
            cx="22"
            cy="22"
            r="18"
            :style="{ strokeDashoffset: milestoneRingOffset }"
          />
        </svg>
        <span class="milestone-ring-label">🏆</span>
      </div>
      <div class="milestone-copy">
        <p class="milestone-title">{{ t("learn.lessonMilestone") }}</p>
        <p class="milestone-sub">
          {{ t("learn.lessonMilestoneNext", { n: lessonMilestone.next_milestone }) }}
          ·
          {{
            t("learn.lessonMilestoneProgress", {
              done: lessonMilestone.completed,
              total: lessonMilestone.next_milestone,
            })
          }}
        </p>
        <p class="milestone-hint">
          {{ t("learn.lessonMilestoneHint", { done: lessonMilestone.completed }) }}
        </p>
      </div>
      <span class="milestone-chevron" aria-hidden="true">›</span>
    </button>

    <button
      v-if="streakAtRisk"
      type="button"
      class="streak-risk-banner"
      @click="goToPath"
    >
      <span class="streak-risk-icon" aria-hidden="true">🔥</span>
      <div class="streak-risk-copy">
        <p class="streak-risk-title">
          {{ t("learn.streakAtRisk", { n: dailyGoal.streak_current }) }}
        </p>
        <p class="streak-risk-sub">{{ t("learn.streakAtRiskHint") }}</p>
      </div>
      <span class="streak-risk-action">{{ t("learn.streakAtRiskAction") }}</span>
    </button>

    <button
      v-if="dailyGoal"
      type="button"
      class="daily-goal-card"
      :class="{ 'is-complete': dailyGoal.goal_met }"
      @click="goToPath"
    >
      <div class="goal-ring" aria-hidden="true">
        <svg viewBox="0 0 44 44" class="goal-ring-svg">
          <circle class="goal-ring-track" cx="22" cy="22" r="18" />
          <circle
            class="goal-ring-fill"
            cx="22"
            cy="22"
            r="18"
            :style="{ strokeDashoffset: ringOffset }"
          />
        </svg>
        <span class="goal-ring-label">
          {{ dailyGoal.goal_met ? "✓" : t("learn.dailyGoalProgress", {
            done: dailyGoal.lessons_today,
            total: dailyGoal.target_lessons,
          }) }}
        </span>
      </div>
      <div class="goal-copy">
        <div class="goal-title-row">
          <span class="goal-title">{{ t("learn.dailyGoal") }}</span>
          <span v-if="dailyGoal.streak_current > 0" class="goal-streak">
            🔥 {{ t("learn.streakDays", { n: dailyGoal.streak_current }) }}
          </span>
        </div>
        <p class="goal-sub">
          {{
            dailyGoal.goal_met
              ? t("learn.dailyGoalMet")
              : dailyGoal.lessons_today > 0
                ? t("learn.dailyGoalLessons", { n: dailyGoal.target_lessons })
                : t("learn.dailyGoalStart")
          }}
        </p>
        <div
          v-if="showWeeklyActivity"
          class="week-strip"
          role="img"
          :aria-label="t('learn.weeklyActivitySummary', { done: weeklyActivity.active_days })"
        >
          <p class="week-strip-label">{{ t("learn.weeklyActivity") }}</p>
          <div class="week-days">
            <div
              v-for="day in weeklyActivity.days"
              :key="day.date"
              class="week-day"
              :class="{ 'is-today': day.is_today }"
            >
              <span
                class="week-dot"
                :class="{ 'is-active': day.active, 'is-today': day.is_today }"
                :aria-label="weekdayLabel(day.weekday, t)"
              >
                <span v-if="day.active" class="week-dot-icon" aria-hidden="true">🔥</span>
              </span>
              <span class="week-day-label">{{ weekdayLabel(day.weekday, t) }}</span>
            </div>
          </div>
          <p class="week-strip-summary">
            {{ t("learn.weeklyActivitySummary", { done: weeklyActivity.active_days }) }}
          </p>
        </div>
      </div>
      <span class="goal-chevron" aria-hidden="true">›</span>
    </button>

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
import { computed, onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import { useI18n } from "@/shared/i18n";
import {
  getDailyGoalProgress,
  getLessonMilestoneProgress,
  getPathCurriculum,
  getUnknownWords,
  getWeeklyActivity,
} from "@/shared/api.js";
import { loadLearningContext } from "@/shared/learningContext.js";
import { useTargetLangStore } from "@/stores/targetLang.js";
import { openAiContact } from "@/modules/ai-chat/openAiContact.js";
import {
  canResumeSection,
  findCurrentSection,
  pathSectionRoute,
  sectionKindIcon,
  sectionKindKey,
} from "./pathResume.js";
import {
  VOCAB_REVIEW_LIMIT,
  shouldShowVocabReview,
  vocabReviewCount,
  vocabReviewHasMore,
  vocabReviewPreview,
} from "./vocabReviewCard.js";
import { hasWeeklyActivity, weekdayLabel } from "./weeklyActivity.js";
import {
  lessonMilestoneRingOffset,
  shouldShowLessonMilestone,
} from "./lessonMilestones.js";

const router = useRouter();
const { t } = useI18n();
const targetLangStore = useTargetLangStore();
const opening = ref(null);
const dailyGoal = ref(null);
const weeklyActivity = ref(null);
const resumeTarget = ref(null);
const vocabReviewWords = ref([]);
const lessonMilestone = ref(null);

const RING_CIRCUMFERENCE = 2 * Math.PI * 18;
const MILESTONE_RING_CIRCUMFERENCE = 2 * Math.PI * 18;

const ringOffset = computed(() => {
  if (!dailyGoal.value) return RING_CIRCUMFERENCE;
  const pct = dailyGoal.value.progress_pct / 100;
  return RING_CIRCUMFERENCE * (1 - pct);
});

const streakAtRisk = computed(
  () =>
    dailyGoal.value &&
    dailyGoal.value.streak_current > 0 &&
    !dailyGoal.value.practiced_today,
);

const resumeIcon = computed(() =>
  resumeTarget.value ? sectionKindIcon(resumeTarget.value.section.kind) : "",
);

const resumeKindKey = computed(() =>
  resumeTarget.value ? sectionKindKey(resumeTarget.value.section.kind) : "",
);

const showVocabReview = computed(() => shouldShowVocabReview(vocabReviewWords.value));

const vocabReviewTotal = computed(() => vocabReviewCount(vocabReviewWords.value));

const vocabReviewPreviewText = computed(() => vocabReviewPreview(vocabReviewWords.value));

const vocabReviewTruncated = computed(() => vocabReviewHasMore(vocabReviewWords.value));

const showWeeklyActivity = computed(() => hasWeeklyActivity(weeklyActivity.value));

const showLessonMilestone = computed(() => shouldShowLessonMilestone(lessonMilestone.value));

const milestoneRingOffset = computed(() =>
  lessonMilestoneRingOffset(lessonMilestone.value, MILESTONE_RING_CIRCUMFERENCE),
);

const modules = [
  { id: "path", labelKey: "learn.path", icon: "🛤️", route: { name: "path" } },
  { id: "news", labelKey: "learn.news", icon: "📰", route: { name: "news" } },
  { id: "translator", labelKey: "chat.translator", icon: "🌐", action: "translator" },
];

async function loadDailyGoal(userId, lang) {
  try {
    dailyGoal.value = await getDailyGoalProgress(userId, lang);
  } catch {
    dailyGoal.value = null;
  }
}

async function loadWeeklyActivity(userId) {
  try {
    weeklyActivity.value = await getWeeklyActivity(userId);
  } catch {
    weeklyActivity.value = null;
  }
}

async function loadResumeSection(nativeLang, targetLang, cefr) {
  try {
    const curriculum = await getPathCurriculum(nativeLang, targetLang, cefr);
    const hit = findCurrentSection(curriculum);
    resumeTarget.value =
      hit && canResumeSection(hit.section) ? hit : null;
  } catch {
    resumeTarget.value = null;
  }
}

async function loadVocabReview(userId, targetLang, cefr) {
  try {
    vocabReviewWords.value = await getUnknownWords(
      userId,
      cefr,
      VOCAB_REVIEW_LIMIT,
      targetLang,
    );
  } catch {
    vocabReviewWords.value = [];
  }
}

async function loadLessonMilestone(nativeLang, targetLang) {
  try {
    lessonMilestone.value = await getLessonMilestoneProgress(nativeLang, targetLang);
  } catch {
    lessonMilestone.value = null;
  }
}

async function loadHubData() {
  try {
    const { user, targetLang, nativeLang, cefr } = await loadLearningContext({
      targetLangStore,
    });
    await Promise.all([
      loadDailyGoal(user.id, targetLang),
      loadWeeklyActivity(user.id),
      loadResumeSection(nativeLang, targetLang, cefr),
      loadVocabReview(user.id, targetLang, cefr),
      loadLessonMilestone(nativeLang, targetLang),
    ]);
  } catch {
    dailyGoal.value = null;
    weeklyActivity.value = null;
    resumeTarget.value = null;
    vocabReviewWords.value = [];
    lessonMilestone.value = null;
  }
}

function goToPath() {
  router.push({ name: "path" });
}

function goToVocabReview() {
  router.push({ name: "vocab-review" });
}

function continueLearning() {
  if (!resumeTarget.value) return;
  router.push(pathSectionRoute(resumeTarget.value.section));
}

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

onMounted(loadHubData);
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

.continue-card {
  display: flex;
  align-items: center;
  gap: 12px;
  width: calc(100% - 32px);
  margin: 12px 16px 0;
  padding: 14px 16px;
  background: linear-gradient(135deg, #e8f8ef 0%, #d4f5e0 100%);
  border: 1px solid var(--green);
  border-radius: var(--radius-md);
  cursor: pointer;
  font-family: inherit;
  text-align: left;
  transition: box-shadow var(--transition), transform var(--transition);
}

.continue-card:hover {
  box-shadow: 0 2px 10px rgba(88, 204, 2, 0.22);
  transform: translateY(-1px);
}

.continue-icon {
  font-size: 32px;
  line-height: 1;
  flex-shrink: 0;
}

.continue-copy {
  flex: 1;
  min-width: 0;
}

.continue-eyebrow {
  margin: 0;
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--green-hover);
  line-height: 1.2;
}

.continue-title {
  margin: 2px 0 0;
  font-size: 15px;
  font-weight: 700;
  color: var(--text);
  line-height: 1.3;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.continue-sub {
  margin: 2px 0 0;
  font-size: 12px;
  color: var(--text-light);
  line-height: 1.35;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.continue-action {
  flex-shrink: 0;
  font-size: 12px;
  font-weight: 700;
  color: #fff;
  background: var(--green-hover);
  padding: 8px 12px;
  border-radius: 999px;
}

.vocab-review-card {
  display: flex;
  align-items: center;
  gap: 12px;
  width: calc(100% - 32px);
  margin: 12px 16px 0;
  padding: 14px 16px;
  background: linear-gradient(135deg, #eef4ff 0%, #dce8ff 100%);
  border: 1px solid #7ba7f7;
  border-radius: var(--radius-md);
  cursor: pointer;
  font-family: inherit;
  text-align: left;
  transition: box-shadow var(--transition), transform var(--transition);
}

.vocab-review-card:hover {
  box-shadow: 0 2px 10px rgba(66, 133, 244, 0.22);
  transform: translateY(-1px);
}

.vocab-review-icon {
  font-size: 32px;
  line-height: 1;
  flex-shrink: 0;
}

.vocab-review-copy {
  flex: 1;
  min-width: 0;
}

.vocab-review-title {
  margin: 0;
  font-size: 15px;
  font-weight: 700;
  color: #1a4f9c;
  line-height: 1.3;
}

.vocab-review-sub {
  margin: 2px 0 0;
  font-size: 12px;
  color: #3d6db5;
  line-height: 1.35;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.vocab-review-action {
  flex-shrink: 0;
  font-size: 12px;
  font-weight: 700;
  color: #fff;
  background: #4285f4;
  padding: 8px 12px;
  border-radius: 999px;
}

.milestone-card {
  display: flex;
  align-items: center;
  gap: 14px;
  width: calc(100% - 32px);
  margin: 12px 16px 0;
  padding: 14px 16px;
  background: linear-gradient(135deg, #fff8e6 0%, #ffefcc 100%);
  border: 1px solid #e6b84d;
  border-radius: var(--radius-md);
  cursor: pointer;
  font-family: inherit;
  text-align: left;
  transition: box-shadow var(--transition), transform var(--transition);
}

.milestone-card:hover {
  box-shadow: 0 2px 10px rgba(230, 184, 77, 0.28);
  transform: translateY(-1px);
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

.milestone-copy {
  flex: 1;
  min-width: 0;
}

.milestone-title {
  margin: 0;
  font-size: 15px;
  font-weight: 700;
  color: #8a6200;
  line-height: 1.3;
}

.milestone-sub {
  margin: 2px 0 0;
  font-size: 12px;
  color: #a67c00;
  line-height: 1.35;
}

.milestone-hint {
  margin: 4px 0 0;
  font-size: 11px;
  color: #b8922e;
  line-height: 1.3;
}

.milestone-chevron {
  flex-shrink: 0;
  font-size: 20px;
  color: #c9a030;
  font-weight: 700;
}

.streak-risk-banner {
  display: flex;
  align-items: center;
  gap: 12px;
  width: calc(100% - 32px);
  margin: 12px 16px 0;
  padding: 12px 14px;
  background: linear-gradient(135deg, #fff4e6 0%, #ffe8cc 100%);
  border: 1px solid #f5a623;
  border-radius: var(--radius-md);
  cursor: pointer;
  font-family: inherit;
  text-align: left;
  transition: box-shadow var(--transition), transform var(--transition);
  animation: streak-risk-pulse 2.4s ease-in-out infinite;
}

.streak-risk-banner:hover {
  box-shadow: 0 2px 8px rgba(245, 166, 35, 0.25);
}

.streak-risk-icon {
  font-size: 28px;
  line-height: 1;
  flex-shrink: 0;
}

.streak-risk-copy {
  flex: 1;
  min-width: 0;
}

.streak-risk-title {
  margin: 0;
  font-size: 14px;
  font-weight: 700;
  color: #b34700;
  line-height: 1.3;
}

.streak-risk-sub {
  margin: 2px 0 0;
  font-size: 12px;
  color: #c45c00;
  line-height: 1.35;
}

.streak-risk-action {
  flex-shrink: 0;
  font-size: 12px;
  font-weight: 700;
  color: #fff;
  background: #e65a00;
  padding: 6px 10px;
  border-radius: 999px;
}

@keyframes streak-risk-pulse {
  0%,
  100% {
    box-shadow: 0 0 0 0 rgba(245, 166, 35, 0);
  }
  50% {
    box-shadow: 0 0 0 4px rgba(245, 166, 35, 0.18);
  }
}

.daily-goal-card {
  display: flex;
  align-items: center;
  gap: 14px;
  width: calc(100% - 32px);
  margin: 12px 16px 0;
  padding: 14px 16px;
  background: var(--white);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
  cursor: pointer;
  font-family: inherit;
  text-align: left;
  transition: background var(--transition), box-shadow var(--transition);
}

.daily-goal-card:hover {
  background: var(--green-bg);
}

.daily-goal-card.is-complete {
  border-color: var(--green);
  background: var(--green-bg);
}

.goal-ring {
  position: relative;
  width: 52px;
  height: 52px;
  flex-shrink: 0;
}

.goal-ring-svg {
  width: 100%;
  height: 100%;
  transform: rotate(-90deg);
}

.goal-ring-track {
  fill: none;
  stroke: var(--border);
  stroke-width: 4;
}

.goal-ring-fill {
  fill: none;
  stroke: var(--green);
  stroke-width: 4;
  stroke-linecap: round;
  stroke-dasharray: 113.1;
  transition: stroke-dashoffset 0.4s ease;
}

.is-complete .goal-ring-fill {
  stroke: var(--green-hover);
}

.goal-ring-label {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  font-weight: 700;
  color: var(--text);
}

.is-complete .goal-ring-label {
  font-size: 18px;
  color: var(--green-hover);
}

.goal-copy {
  flex: 1;
  min-width: 0;
}

.goal-title-row {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.goal-title {
  font-size: 15px;
  font-weight: 700;
  color: var(--text);
}

.goal-streak {
  font-size: 12px;
  font-weight: 600;
  color: #e65a00;
  background: #fff4e6;
  padding: 2px 8px;
  border-radius: 999px;
}

.goal-sub {
  margin: 4px 0 0;
  font-size: 13px;
  color: var(--text-light);
  line-height: 1.35;
}

.goal-chevron {
  font-size: 22px;
  color: var(--text-light);
  flex-shrink: 0;
  align-self: center;
}

.week-strip {
  margin-top: 10px;
  padding-top: 10px;
  border-top: 1px solid var(--border);
}

.week-strip-label {
  margin: 0 0 8px;
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--text-light);
}

.week-days {
  display: flex;
  justify-content: space-between;
  gap: 2px;
}

.week-day {
  display: flex;
  flex: 1;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  min-width: 0;
}

.week-dot {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: #f0f2f5;
  border: 2px solid transparent;
  transition: background var(--transition), border-color var(--transition);
}

.week-dot.is-active {
  background: #fff4e6;
  border-color: #f5a623;
}

.week-dot.is-today {
  border-color: var(--green);
}

.week-dot.is-active.is-today {
  border-color: #e65a00;
  box-shadow: 0 0 0 2px rgba(230, 90, 0, 0.15);
}

.week-dot-icon {
  font-size: 14px;
  line-height: 1;
}

.week-day-label {
  font-size: 10px;
  font-weight: 600;
  color: var(--text-light);
}

.week-day.is-today .week-day-label {
  color: var(--green-hover);
  font-weight: 700;
}

.week-strip-summary {
  margin: 8px 0 0;
  font-size: 12px;
  color: var(--text-light);
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