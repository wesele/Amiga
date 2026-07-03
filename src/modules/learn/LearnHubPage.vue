<template>
  <div class="learn-hub">
    <header class="page-header">
      <h1 class="page-title">{{ t("learn.title") }}</h1>
    </header>

    <div v-if="readingSummary" class="reading-summary-banner">
      <p class="reading-summary-text">
        {{ t("news.readingSummary", { n: readingSummary.unknownCount }) }}
      </p>
      <button type="button" class="reading-summary-action" @click="goToVocabReview">
        {{ t("news.readingSummaryAction") }}
      </button>
    </div>

    <div v-else-if="pendingVocabBanner" class="reading-summary-banner">
      <p class="reading-summary-text">
        {{ t("news.pendingVocabBanner", { n: pendingVocabBanner.entries.length }) }}
      </p>
      <button type="button" class="reading-summary-action" @click="goToPendingVocabReview">
        {{ t("news.pendingVocabAction") }}
      </button>
    </div>

    <section v-if="hubFocus" class="focus-hero-card">
      <div
        v-if="showStreakUrgency"
        class="focus-urgency-strip"
      >
        <span class="streak-risk-icon" aria-hidden="true">🔥</span>
        <div class="streak-risk-copy">
          <p class="streak-risk-title">
            {{ t("learn.streakAtRisk", { n: dailyGoal?.streak_current ?? 0 }) }}
          </p>
          <p class="streak-risk-sub">{{ t("learn.streakAtRiskHint") }}</p>
        </div>
      </div>
      <div class="focus-hero-body">
        <p class="focus-eyebrow">{{ t("learn.todayFocus") }}</p>
        <div class="focus-hero-main">
          <span class="focus-hero-icon" aria-hidden="true">{{ hubFocus.icon }}</span>
          <div class="focus-hero-copy">
            <p class="focus-hero-title">{{ focusHeroTitle }}</p>
            <p class="focus-hero-sub">{{ focusHeroSub }}</p>
            <div v-if="focusHeroGraduation" class="focus-graduation-strip">
              <div class="graduation-bar mini" aria-hidden="true">
                <div
                  class="graduation-bar-fill"
                  :style="{ width: focusHeroGraduation.progressPct + '%' }"
                />
              </div>
              <p class="focus-graduation-hint">
                {{ t("learn.focusAreaGraduationHint", { n: focusHeroGraduation.remainingPct }) }}
              </p>
            </div>
          </div>
        </div>
        <button type="button" class="focus-hero-action" @click="goToFocus">
          {{ focusHeroAction }}
        </button>
        <button
          v-if="showStreakNewsChip"
          type="button"
          class="focus-hero-secondary-chip"
          @click="goToNews"
        >
          {{ t("learn.streakAtRiskReadNewsAlt", { n: newsUnreadCount }) }}
        </button>
      </div>
    </section>

    <div
      v-if="dailyGoal"
      class="daily-goal-card"
      :class="{ 'is-complete': dailyGoal.goal_met, 'has-resume': resumeTarget }"
    >
      <button
        v-if="resumeTarget"
        type="button"
        class="goal-continue-btn"
        @click="continueLearning"
      >
        {{ t("learn.continueLearning") }}
      </button>
      <button
        type="button"
        class="daily-goal-main"
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
            done: dailyGoalRingDone,
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
          {{ t(dailyGoalSubI18nKey, dailyGoalSubI18nParams) }}
        </p>
        <div
          v-if="todayActivityItems.length"
          class="today-activity-strip"
          role="list"
        >
          <span
            v-for="item in todayActivityItems"
            :key="item.kind"
            class="today-activity-chip"
            role="listitem"
          >
            <span aria-hidden="true">{{ item.icon }}</span>
            {{ t(item.labelKey, item.params) }}
          </span>
        </div>
        <p v-else-if="!dailyGoal.practiced_today" class="today-activity-empty">
          {{ t("learn.todayActivityEmpty") }}
        </p>
        <div
          v-if="showWeeklyGoal"
          class="week-strip"
          :class="{ 'is-goal-met': weeklyGoal.goal_met }"
          role="img"
          :aria-label="weeklyGoalAriaLabel"
        >
          <div class="week-strip-header">
            <p class="week-strip-label">{{ t("learn.weeklyGoal") }}</p>
            <span class="week-goal-badge">
              {{ t("learn.weeklyGoalSummary", {
                done: weeklyGoal.active_days,
                total: weeklyGoal.target_days,
              }) }}
            </span>
          </div>
          <div class="week-goal-bar" aria-hidden="true">
            <div
              class="week-goal-bar-fill"
              :style="{ width: weeklyGoal.progress_pct + '%' }"
            />
          </div>
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
            {{
              weeklyGoal.goal_met
                ? t("learn.weeklyGoalMet")
                : t("learn.weeklyGoalRemaining", { n: weeklyGoal.days_remaining })
            }}
          </p>
        </div>
      </div>
      <span class="goal-chevron" aria-hidden="true">›</span>
      </button>
    </div>

    <details v-if="secondarySuggestions.length" class="hub-more-suggestions">
      <summary class="hub-more-summary">
        {{ t("learn.moreSuggestions", { n: secondarySuggestions.length }) }}
      </summary>
      <div class="hub-more-list">
        <button
          v-for="item in secondarySuggestions"
          :key="item.type"
          type="button"
          :class="secondaryCardClass(item.type)"
          @click="onSecondarySuggestion(item.type, item)"
        >
          <template v-if="item.type === 'continueReading'">
            <span class="hub-secondary-icon" aria-hidden="true">📰</span>
            <div class="hub-secondary-copy">
              <p class="hub-secondary-title">
                {{ t("learn.continueReading", { title: item.title }) }}
              </p>
              <p class="hub-secondary-sub">
                {{ t("learn.continueReadingSub", { remainingPct: item.remainingPct }) }}
              </p>
            </div>
            <span class="hub-secondary-action">{{ t("learn.continueReadingAction") }}</span>
          </template>

          <template v-else-if="item.type === 'mistakeReview'">
            <span class="mistake-review-icon" aria-hidden="true">🔁</span>
            <div class="mistake-review-copy">
              <p class="mistake-review-title">{{ t("learn.mistakeReview") }}</p>
              <p class="mistake-review-sub">
                {{ t("learn.mistakeReviewHint", { n: mistakeReviewTotal }) }}<template v-if="mistakeReviewPreviewText">{{ t("learn.mistakeReviewPreviewSep") }}{{ mistakeReviewPreviewText }}</template>
              </p>
            </div>
            <span class="mistake-review-action">{{ t("learn.mistakeReviewAction") }}</span>
          </template>

          <template v-else-if="item.type === 'vocabReview'">
            <span class="vocab-review-icon" aria-hidden="true">📚</span>
            <div class="vocab-review-copy">
              <p class="vocab-review-title">{{ t("learn.vocabReview") }}</p>
              <p class="vocab-review-sub">{{ vocabReviewSubText }}</p>
            </div>
            <span class="vocab-review-action">{{ t("learn.vocabReviewAction") }}</span>
          </template>

          <template v-else-if="item.type === 'focusArea'">
            <span class="focus-area-icon" aria-hidden="true">🎯</span>
            <div class="focus-area-copy">
              <p class="focus-area-title">{{ t("learn.focusArea") }}</p>
              <p class="focus-area-sub">
                {{ t(focusAreaTypeKey(focusArea.typeId)) }}
                · {{ t("learn.focusAreaAccuracy", { pct: focusArea.accuracyPct }) }}
              </p>
              <div v-if="focusAreaGraduation" class="focus-graduation-strip">
                <div class="graduation-bar mini" aria-hidden="true">
                  <div
                    class="graduation-bar-fill"
                    :style="{ width: focusAreaGraduation.progressPct + '%' }"
                  />
                </div>
                <p class="focus-graduation-hint">
                  {{ t("learn.focusAreaGraduationHint", { n: focusAreaGraduation.remainingPct }) }}
                </p>
              </div>
              <p class="focus-area-hint">{{ t(focusAreaTipKey(focusArea.typeId)) }}</p>
            </div>
            <span class="focus-area-action">{{ t("learn.focusAreaAction") }}</span>
          </template>

          <template v-else-if="item.type === 'accuracy'">
            <div class="milestone-ring" aria-hidden="true">
              <svg viewBox="0 0 44 44" class="milestone-ring-svg">
                <circle class="accuracy-milestone-ring-track" cx="22" cy="22" r="18" />
                <circle
                  class="accuracy-milestone-ring-fill"
                  cx="22"
                  cy="22"
                  r="18"
                  :style="{ strokeDashoffset: accuracyMilestoneRingOffsetValue }"
                />
              </svg>
              <span class="milestone-ring-label">🎯</span>
            </div>
            <div class="milestone-copy">
              <p class="accuracy-milestone-title">{{ t("learn.accuracyMilestone") }}</p>
              <p class="accuracy-milestone-sub">
                {{ t("learn.accuracyMilestoneNext", { n: accuracyMilestone.next_milestone }) }}
                ·
                {{
                  t("learn.accuracyMilestoneProgress", {
                    done: accuracyMilestone.best,
                    total: accuracyMilestone.next_milestone,
                  })
                }}
              </p>
            </div>
            <span class="milestone-chevron" aria-hidden="true">›</span>
          </template>

          <template v-else-if="item.type === 'combo'">
            <div class="milestone-ring" aria-hidden="true">
              <svg viewBox="0 0 44 44" class="milestone-ring-svg">
                <circle class="combo-milestone-ring-track" cx="22" cy="22" r="18" />
                <circle
                  class="combo-milestone-ring-fill"
                  cx="22"
                  cy="22"
                  r="18"
                  :style="{ strokeDashoffset: comboMilestoneRingOffsetValue }"
                />
              </svg>
              <span class="milestone-ring-label">🔥</span>
            </div>
            <div class="milestone-copy">
              <p class="combo-milestone-title">{{ t("learn.comboMilestone") }}</p>
              <p class="combo-milestone-sub">
                {{ t("learn.comboMilestoneNext", { n: comboMilestone.next_milestone }) }}
                ·
                {{
                  t("learn.comboMilestoneProgress", {
                    done: comboMilestone.best,
                    total: comboMilestone.next_milestone,
                  })
                }}
              </p>
            </div>
            <span class="milestone-chevron" aria-hidden="true">›</span>
          </template>

          <template v-else-if="item.type === 'perfect'">
            <div class="milestone-ring" aria-hidden="true">
              <svg viewBox="0 0 44 44" class="milestone-ring-svg">
                <circle class="perfect-milestone-ring-track" cx="22" cy="22" r="18" />
                <circle
                  class="perfect-milestone-ring-fill"
                  cx="22"
                  cy="22"
                  r="18"
                  :style="{ strokeDashoffset: perfectMilestoneRingOffsetValue }"
                />
              </svg>
              <span class="milestone-ring-label">✨</span>
            </div>
            <div class="milestone-copy">
              <p class="perfect-milestone-title">{{ t("learn.perfectMilestone") }}</p>
              <p class="perfect-milestone-sub">
                {{ t("learn.perfectMilestoneNext", { n: perfectMilestone.next_milestone }) }}
                ·
                {{
                  t("learn.perfectMilestoneProgress", {
                    done: perfectMilestone.best,
                    total: perfectMilestone.next_milestone,
                  })
                }}
              </p>
            </div>
            <span class="milestone-chevron" aria-hidden="true">›</span>
          </template>

          <template v-else-if="item.type === 'perfectStreak'">
            <span class="perfect-streak-icon" aria-hidden="true">✨</span>
            <div class="perfect-streak-copy">
              <p class="perfect-streak-title">
                {{ t("learn.perfectStreak", { n: perfectStreak.current }) }}
              </p>
              <p class="perfect-streak-sub">
                {{
                  perfectStreak.best > perfectStreak.current
                    ? t("learn.perfectStreakBest", { n: perfectStreak.best })
                    : t("learn.perfectStreakHint")
                }}
              </p>
            </div>
            <span class="perfect-streak-chevron" aria-hidden="true">›</span>
          </template>
        </button>
      </div>
    </details>

    <div class="module-grid">
      <button
        v-for="mod in modules"
        :key="mod.id"
        class="module-tile"
        :disabled="opening === mod.id"
        @click="openModule(mod)"
      >
        <span v-if="mod.id === 'news' && newsUnreadCount > 0" class="module-badge">
          {{ t("learn.newsUnreadBadge", { n: newsUnreadCount }) }}
        </span>
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
  getArticles,
  getArticlesReadingStatus,
  getDailyGoalProgress,
  getPathCurriculum,
  getPerfectLessonStreak,
  getUnknownWords,
  getWeeklyActivity,
} from "@/shared/api.js";
import {
  buildStatusMap,
  countUnreadArticles,
} from "@/modules/news/newsReadingStatus.js";
import { findContinueReadingCandidate } from "@/modules/news/readingProgress.js";
import { loadLearningContext } from "@/shared/learningContext.js";
import { useTargetLangStore } from "@/stores/targetLang.js";
import { openAiContact } from "@/modules/ai-chat/openAiContact.js";
import {
  canResumeSection,
  findCurrentSection,
  pathSectionRoute,
} from "./pathResume.js";
import { weekdayLabel } from "./weeklyActivity.js";
import {
  buildWeeklyGoalProgress,
  shouldShowWeeklyGoal,
} from "./weeklyGoal.js";

import { shouldShowPerfectStreakCard } from "@/modules/path/perfectLessonStreak.js";
import {
  buildFocusArea,
  focusAreaTipKey,
  focusAreaTypeKey,
  loadQuestionTypeStats,
  pairStatsKey,
  shouldShowFocusArea,
} from "./questionTypeStats.js";
import { focusPracticeRoute } from "@/modules/path/focusPracticeRoute.js";
import { weakAreaGraduationProgress } from "@/modules/path/focusPracticeProgress.js";
import {
  FOCUS_IDS,
  pickLearningHubFocus,
  pickSecondarySuggestions,
} from "./learningHubFocus.js";
import {
  mistakeReviewCount,
  mistakeReviewPreview,
} from "./mistakeReviewCard.js";
import {
  VOCAB_REVIEW_LIMIT,
  vocabReviewCount,
  vocabReviewFromNewsCount,
  vocabReviewHasMore,
  vocabReviewPreview,
} from "./vocabReviewCard.js";
import { consumeReadingSessionSummary } from "@/modules/news/readingSession.js";
import {
  peekPendingReadingVocab,
  seedReadingSessionFromPending,
  shouldShowPendingVocabBanner,
} from "@/modules/news/pendingReadingVocab.js";
import { accuracyMilestoneRingOffset } from "@/modules/profile/accuracyMilestones.js";
import {
  buildAccuracyMilestoneCard,
  shouldShowAccuracyMilestoneCard,
} from "./accuracyMilestoneCard.js";
import {
  buildComboMilestoneCard,
  shouldShowComboMilestoneCard,
} from "./comboMilestoneCard.js";
import { comboMilestoneRingOffset } from "./comboMilestones.js";
import {
  buildPerfectMilestoneCard,
  shouldShowPerfectMilestoneCard,
} from "./perfectMilestoneCard.js";
import { perfectMilestoneRingOffset } from "./perfectMilestones.js";
import { loadDueMistakes } from "@/modules/path/mistakeReviewStore.js";
import {
  dailyGoalRingDone as ringDone,
  dailyGoalRemainingLessons,
} from "./dailyGoalDisplay.js";
import {
  buildTodayActivityItems,
  dailyGoalSubKeyWithActivity,
  dailyGoalSubParamsWithActivity,
} from "./todayActivityDisplay.js";

const router = useRouter();
const { t } = useI18n();
const targetLangStore = useTargetLangStore();
const opening = ref(null);
const dailyGoal = ref(null);
const weeklyActivity = ref(null);
const resumeTarget = ref(null);
const accuracyMilestone = ref(null);
const comboMilestone = ref(null);
const perfectMilestone = ref(null);
const perfectStreak = ref(null);
const focusArea = ref(null);
const dueMistakeEntries = ref([]);
const dueVocabWords = ref([]);
const readingSummary = ref(null);
const pendingVocabBanner = ref(null);
const newsUnreadCount = ref(0);
const continueReadingArticle = ref(null);
const localHour = ref(new Date().getHours());

const RING_CIRCUMFERENCE = 2 * Math.PI * 18;
const MILESTONE_RING_CIRCUMFERENCE = 2 * Math.PI * 18;

const ringOffset = computed(() => {
  if (!dailyGoal.value) return RING_CIRCUMFERENCE;
  const pct = dailyGoal.value.progress_pct / 100;
  return RING_CIRCUMFERENCE * (1 - pct);
});

const dailyGoalRingDone = computed(() => ringDone(dailyGoal.value));

const dailyGoalSubI18nKey = computed(() => dailyGoalSubKeyWithActivity(dailyGoal.value));

const dailyGoalSubI18nParams = computed(() =>
  dailyGoalSubParamsWithActivity(dailyGoal.value),
);

const todayActivityItems = computed(() => buildTodayActivityItems(dailyGoal.value));

const weeklyGoal = computed(() => {
  if (!weeklyActivity.value || !dailyGoal.value) return null;
  return buildWeeklyGoalProgress(
    weeklyActivity.value,
    dailyGoal.value.target_lessons,
  );
});

const showWeeklyGoal = computed(() =>
  shouldShowWeeklyGoal(weeklyActivity.value, dailyGoal.value?.target_lessons ?? 0),
);

const weeklyGoalAriaLabel = computed(() => {
  if (!weeklyGoal.value) return "";
  if (weeklyGoal.value.goal_met) return t("learn.weeklyGoalMet");
  return `${t("learn.weeklyGoalSummary", {
    done: weeklyGoal.value.active_days,
    total: weeklyGoal.value.target_days,
  })} · ${t("learn.weeklyGoalRemaining", { n: weeklyGoal.value.days_remaining })}`;
});

const showPerfectMilestone = computed(() =>
  shouldShowPerfectMilestoneCard(perfectMilestone.value),
);

const showPerfectStreak = computed(() => shouldShowPerfectStreakCard(perfectStreak.value?.current));

const showFocusArea = computed(() => shouldShowFocusArea(focusArea.value));

const focusAreaGraduation = computed(() => {
  if (!focusArea.value) return null;
  const progress = weakAreaGraduationProgress(focusArea.value.accuracyPct);
  return progress.graduated ? null : progress;
});

const focusHeroGraduation = computed(() => {
  const focus = hubFocus.value;
  if (!focus || focus.id !== FOCUS_IDS.FOCUS_PRACTICE) return null;
  const progress = weakAreaGraduationProgress(focus.accuracyPct);
  return progress.graduated ? null : progress;
});

const mistakeReviewTotal = computed(() => mistakeReviewCount(dueMistakeEntries.value.length));

const mistakeReviewPreviewText = computed(() =>
  mistakeReviewPreview(dueMistakeEntries.value, t),
);

const vocabReviewTotal = computed(() => vocabReviewCount(dueVocabWords.value));

const vocabReviewPreviewText = computed(() =>
  vocabReviewPreview(dueVocabWords.value),
);

const vocabReviewHasMoreWords = computed(() =>
  vocabReviewHasMore(dueVocabWords.value),
);

const vocabReviewSubText = computed(() => formatVocabSub(
  vocabReviewTotal.value,
  vocabReviewPreviewText.value,
));

const hubFocus = computed(() =>
  pickLearningHubFocus({
    dailyGoal: dailyGoal.value,
    resumeTarget: resumeTarget.value,
    dueMistakes: dueMistakeEntries.value.length,
    dueVocabWords: dueVocabWords.value,
    focusArea: focusArea.value,
    localHour: localHour.value,
    mistakePreview: mistakeReviewPreviewText.value,
    vocabPreview: vocabReviewPreviewText.value,
    newsUnreadCount: newsUnreadCount.value,
  }),
);

const showStreakNewsChip = computed(() => {
  const focus = hubFocus.value;
  return (
    focus?.id === FOCUS_IDS.STREAK_AT_RISK
    && focus.actionId === FOCUS_IDS.CONTINUE_SECTION
    && newsUnreadCount.value > 0
  );
});

const showStreakUrgency = computed(() => hubFocus.value?.id === FOCUS_IDS.STREAK_AT_RISK);

const secondarySuggestions = computed(() =>
  pickSecondarySuggestions(
    {
      dueMistakes: dueMistakeEntries.value.length,
      dueVocabWords: dueVocabWords.value,
      focusArea: focusArea.value,
      continueReadingArticle: continueReadingArticle.value,
      showFocusArea: showFocusArea.value,
      showAccuracy: showAccuracyMilestone.value,
      showCombo: showComboMilestone.value,
      showPerfect: showPerfectMilestone.value,
      showPerfectStreak: showPerfectStreak.value,
    },
    hubFocus.value,
  ),
);

const focusHeroTitle = computed(() => {
  const focus = hubFocus.value;
  if (!focus) return "";
  if (focus.id === FOCUS_IDS.STREAK_AT_RISK) {
    if (focus.actionId === FOCUS_IDS.MISTAKE_REVIEW) {
      return t("learn.mistakeReview");
    }
    if (focus.actionId === FOCUS_IDS.VOCAB_REVIEW) {
      return t("learn.vocabReview");
    }
    if (focus.actionId === FOCUS_IDS.CONTINUE_SECTION) {
      return resumeTarget.value?.section?.title_native || t("learn.continueLearning");
    }
    if (focus.actionId === FOCUS_IDS.READ_NEWS) {
      return t("learn.streakAtRiskReadNews");
    }
    return t("learn.dailyGoal");
  }
  if (focus.id === FOCUS_IDS.CONTINUE_SECTION) {
    return focus.sectionTitle || t("learn.continueLearning");
  }
  if (focus.id === FOCUS_IDS.MISTAKE_REVIEW) {
    return t("learn.mistakeReview");
  }
  if (focus.id === FOCUS_IDS.VOCAB_REVIEW) {
    return t("learn.vocabReview");
  }
  if (focus.id === FOCUS_IDS.FOCUS_PRACTICE) {
    return t("learn.focusArea");
  }
  if (focus.id === FOCUS_IDS.DAILY_GOAL) {
    return t("learn.dailyGoal");
  }
  return t("learn.focusExploreTitle");
});

const focusHeroSub = computed(() => {
  const focus = hubFocus.value;
  if (!focus) return "";
  if (focus.id === FOCUS_IDS.STREAK_AT_RISK) {
    if (focus.actionId === FOCUS_IDS.MISTAKE_REVIEW) {
      return formatMistakeSub(focus.dueMistakes, focus.mistakePreview);
    }
    if (focus.actionId === FOCUS_IDS.VOCAB_REVIEW) {
      return formatVocabSub(focus.vocabCount, vocabReviewPreviewText.value);
    }
    if (focus.actionId === FOCUS_IDS.CONTINUE_SECTION) {
      return t("learn.focusContinueSub");
    }
    if (focus.actionId === FOCUS_IDS.READ_NEWS) {
      return t("learn.streakAtRiskReadNewsSub", { n: focus.newsUnreadCount });
    }
    return t("learn.focusDailyGoalSub", {
      remaining: dailyGoalRemainingLessons(dailyGoal.value),
    });
  }
  if (focus.id === FOCUS_IDS.CONTINUE_SECTION) {
    return t("learn.focusContinueSub");
  }
  if (focus.id === FOCUS_IDS.MISTAKE_REVIEW) {
    return formatMistakeSub(focus.dueMistakes, focus.mistakePreview);
  }
  if (focus.id === FOCUS_IDS.VOCAB_REVIEW) {
    return formatVocabSub(focus.vocabCount, vocabReviewPreviewText.value);
  }
  if (focus.id === FOCUS_IDS.FOCUS_PRACTICE) {
    return `${t(focusAreaTypeKey(focus.typeId))} · ${t("learn.focusAreaAccuracy", { pct: focus.accuracyPct })}`;
  }
  if (focus.id === FOCUS_IDS.DAILY_GOAL) {
    return t("learn.focusDailyGoalSub", { remaining: focus.remaining });
  }
  return t("learn.focusExploreSub");
});

const focusHeroAction = computed(() => {
  const focus = hubFocus.value;
  if (!focus) return "";
  if (focus.id === FOCUS_IDS.STREAK_AT_RISK) {
    if (focus.actionId === FOCUS_IDS.READ_NEWS) {
      return t("learn.streakAtRiskReadNewsAction");
    }
    return t("learn.streakAtRiskAction");
  }
  if (focus.id === FOCUS_IDS.CONTINUE_SECTION) {
    return t("learn.focusContinueAction");
  }
  if (focus.id === FOCUS_IDS.MISTAKE_REVIEW) {
    return t("learn.mistakeReviewAction");
  }
  if (focus.id === FOCUS_IDS.VOCAB_REVIEW) {
    return t("learn.vocabReviewAction");
  }
  if (focus.id === FOCUS_IDS.FOCUS_PRACTICE) {
    return t("learn.focusAreaAction");
  }
  if (focus.id === FOCUS_IDS.DAILY_GOAL) {
    return t("learn.focusDailyGoalAction");
  }
  return t("learn.focusExploreAction");
});

const showAccuracyMilestone = computed(() =>
  shouldShowAccuracyMilestoneCard(accuracyMilestone.value),
);

const showComboMilestone = computed(() =>
  shouldShowComboMilestoneCard(comboMilestone.value),
);

const accuracyMilestoneRingOffsetValue = computed(() =>
  accuracyMilestoneRingOffset(accuracyMilestone.value, MILESTONE_RING_CIRCUMFERENCE),
);

const comboMilestoneRingOffsetValue = computed(() =>
  comboMilestoneRingOffset(comboMilestone.value, MILESTONE_RING_CIRCUMFERENCE),
);

const perfectMilestoneRingOffsetValue = computed(() =>
  perfectMilestoneRingOffset(perfectMilestone.value, MILESTONE_RING_CIRCUMFERENCE),
);

const modules = [
  { id: "path", labelKey: "learn.path", icon: "🛤️", route: { name: "path" } },
  { id: "news", labelKey: "learn.news", icon: "📰", route: { name: "news" } },
  { id: "vocab", labelKey: "nav.vocab", icon: "📚", route: { name: "vocab" } },
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

async function loadPerfectStreak() {
  try {
    perfectStreak.value = await getPerfectLessonStreak();
    perfectMilestone.value = buildPerfectMilestoneCard(perfectStreak.value);
  } catch {
    perfectStreak.value = null;
    perfectMilestone.value = null;
  }
}

function loadFocusArea(nativeLang, targetLang) {
  const stats = loadQuestionTypeStats(pairStatsKey(nativeLang, targetLang));
  focusArea.value = buildFocusArea(stats);
}

function loadMistakeReview(nativeLang, targetLang) {
  dueMistakeEntries.value = loadDueMistakes(pairStatsKey(nativeLang, targetLang));
}

async function loadVocabReview(userId, cefr, targetLang) {
  try {
    const words = await getUnknownWords(userId, cefr, VOCAB_REVIEW_LIMIT, targetLang);
    dueVocabWords.value = Array.isArray(words) ? words : [];
  } catch {
    dueVocabWords.value = [];
  }
}

function formatMistakeSub(count, preview) {
  const base = t("learn.mistakeReviewHint", { n: count });
  return preview ? `${base}${t("learn.mistakeReviewPreviewSep")}${preview}` : base;
}

function formatVocabSub(count, preview) {
  const fromNews = vocabReviewFromNewsCount(dueVocabWords.value);
  let base = t("learn.vocabReviewHint", { n: count });
  if (fromNews > 0) {
    base += ` · ${t("learn.vocabReviewFromNews", { n: fromNews })}`;
  }
  if (!preview) return base;
  const more = vocabReviewHasMore(dueVocabWords.value) ? t("learn.vocabReviewMore") : "";
  return `${base}${t("learn.vocabReviewPreviewSep")}${preview}${more}`;
}

function loadAccuracyMilestone(nativeLang, targetLang) {
  accuracyMilestone.value = buildAccuracyMilestoneCard(pairStatsKey(nativeLang, targetLang));
}

function loadComboMilestone(nativeLang, targetLang) {
  comboMilestone.value = buildComboMilestoneCard(pairStatsKey(nativeLang, targetLang));
}

function regionForLang(lang) {
  switch (lang) {
    case "zh":
      return "CN";
    case "en":
      return "US";
    case "es":
      return "ES";
    default:
      return "CN";
  }
}

async function loadNewsUnread(userId, targetLang) {
  try {
    const articles = await getArticles(regionForLang(targetLang));
    if (!articles.length) {
      newsUnreadCount.value = 0;
      continueReadingArticle.value = null;
      return;
    }
    const ids = articles.map((article) => article.id).filter((id) => id != null);
    const rows = await getArticlesReadingStatus(userId, ids);
    const map = buildStatusMap(rows);
    newsUnreadCount.value = countUnreadArticles(map, articles);
    continueReadingArticle.value = findContinueReadingCandidate(articles, map);
  } catch {
    newsUnreadCount.value = 0;
    continueReadingArticle.value = null;
  }
}

async function loadHubData() {
  readingSummary.value = consumeReadingSessionSummary();
  const pendingVocab = peekPendingReadingVocab();
  pendingVocabBanner.value = readingSummary.value
    ? null
    : shouldShowPendingVocabBanner(pendingVocab)
      ? pendingVocab
      : null;
  try {
    const { user, targetLang, nativeLang, cefr } = await loadLearningContext({
      targetLangStore,
    });
    loadFocusArea(nativeLang, targetLang);
    loadMistakeReview(nativeLang, targetLang);
    loadAccuracyMilestone(nativeLang, targetLang);
    loadComboMilestone(nativeLang, targetLang);
    localHour.value = new Date().getHours();
    await Promise.all([
      loadDailyGoal(user.id, targetLang),
      loadWeeklyActivity(user.id),
      loadResumeSection(nativeLang, targetLang, cefr),
      loadPerfectStreak(),
      loadVocabReview(user.id, cefr, targetLang),
      loadNewsUnread(user.id, targetLang),
    ]);
  } catch {
    dailyGoal.value = null;
    weeklyActivity.value = null;
    resumeTarget.value = null;
    perfectStreak.value = null;
    perfectMilestone.value = null;
    focusArea.value = null;
    dueMistakeEntries.value = [];
    dueVocabWords.value = [];
    accuracyMilestone.value = null;
    comboMilestone.value = null;
    newsUnreadCount.value = 0;
    continueReadingArticle.value = null;
  }
}

function goToPath() {
  router.push({ name: "path" });
}

function goToNews() {
  router.push({ name: "news" });
}

function continueLearning() {
  if (!resumeTarget.value) return;
  router.push(pathSectionRoute(resumeTarget.value.section));
}

function goToFocusPractice() {
  const typeId = focusArea.value?.typeId;
  if (!typeId) { goToPath(); return; }
  router.push(focusPracticeRoute(typeId));
}

function goToMistakeReview() {
  router.push({ name: "path-mistake-review" });
}

function goToVocabReview() {
  readingSummary.value = null;
  router.push({ name: "vocab-review", query: { from: "reading" } });
}

function goToPendingVocabReview() {
  const pending = pendingVocabBanner.value;
  if (!pending) return;
  seedReadingSessionFromPending(pending);
  pendingVocabBanner.value = null;
  const query = { from: "reading" };
  if (pending.articleId != null) {
    query.articleId = String(pending.articleId);
  }
  router.push({ name: "vocab-review", query });
}

function goToFocus() {
  const route = hubFocus.value?.route;
  if (route) router.push(route);
}

function secondaryCardClass(type) {
  if (type === "continueReading") return "hub-secondary-card continue-reading-card";
  if (type === "mistakeReview") return "mistake-review-card";
  if (type === "vocabReview") return "vocab-review-card";
  if (type === "focusArea") return "focus-area-card";
  if (type === "accuracy") return "accuracy-milestone-card";
  if (type === "combo") return "combo-milestone-card";
  if (type === "perfect") return "perfect-milestone-card";
  if (type === "perfectStreak") return "perfect-streak-card";
  return "hub-secondary-card";
}

function onSecondarySuggestion(type, item) {
  if (type === "continueReading" && item?.articleId) {
    router.push({ name: "reader", params: { id: item.articleId } });
    return;
  }
  if (type === "mistakeReview") {
    goToMistakeReview();
    return;
  }
  if (type === "vocabReview") {
    goToVocabReview();
    return;
  }
  if (type === "focusArea") {
    goToFocusPractice();
    return;
  }
  goToPath();
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

.reading-summary-banner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin: 0 16px 8px;
  padding: 10px 14px;
  border-radius: var(--radius-md);
  background: var(--purple-bg);
  border: 1px solid rgba(124, 58, 237, 0.2);
}

.reading-summary-text {
  margin: 0;
  font-size: 13px;
  font-weight: 600;
  color: var(--purple);
  line-height: 1.35;
  flex: 1;
}

.reading-summary-action {
  flex-shrink: 0;
  border: none;
  border-radius: 999px;
  padding: 6px 12px;
  background: var(--purple);
  color: #fff;
  font-size: 12px;
  font-weight: 700;
  font-family: inherit;
  cursor: pointer;
}

.page-title {
  margin: 0;
  font-size: 22px;
  font-weight: 700;
}

.focus-hero-card {
  width: calc(100% - 32px);
  margin: 12px 16px 0;
  background: linear-gradient(135deg, #e8f8ef 0%, #d4f5e0 100%);
  border: 1px solid var(--green);
  border-radius: var(--radius-md);
  overflow: hidden;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
}

.focus-urgency-strip {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 14px;
  background: linear-gradient(135deg, #fff4e6 0%, #ffe8cc 100%);
  border-bottom: 1px solid #f5a623;
  animation: streak-risk-pulse 2.4s ease-in-out infinite;
}

.focus-hero-body {
  padding: 14px 16px 16px;
}

.focus-eyebrow {
  margin: 0;
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--green-hover);
}

.focus-hero-main {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  margin-top: 8px;
}

.focus-hero-icon {
  font-size: 30px;
  line-height: 1;
  flex-shrink: 0;
}

.focus-hero-copy {
  flex: 1;
  min-width: 0;
}

.focus-hero-title {
  margin: 0;
  font-size: 17px;
  font-weight: 700;
  color: var(--text);
  line-height: 1.3;
}

.focus-hero-sub {
  margin: 4px 0 0;
  font-size: 13px;
  color: var(--text-light);
  line-height: 1.4;
}

.focus-hero-action {
  width: 100%;
  margin-top: 14px;
  padding: 12px 16px;
  border: none;
  border-radius: var(--radius-md);
  background: var(--green-hover);
  color: #fff;
  font-size: 15px;
  font-weight: 700;
  font-family: inherit;
  cursor: pointer;
  transition: background var(--transition), transform var(--transition);
}

.focus-hero-action:hover {
  background: var(--green);
  transform: translateY(-1px);
}

.focus-hero-secondary-chip {
  width: 100%;
  margin-top: 8px;
  padding: 10px 14px;
  border: 1.5px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--surface);
  color: var(--text-light);
  font-size: 13px;
  font-weight: 600;
  font-family: inherit;
  cursor: pointer;
  transition: background var(--transition), border-color var(--transition);
}

.focus-hero-secondary-chip:hover {
  background: var(--surface-variant);
  border-color: var(--green);
  color: var(--text);
}

.hub-more-suggestions {
  width: calc(100% - 32px);
  margin: 12px 16px 0;
}

.hub-more-summary {
  padding: 12px 14px;
  background: var(--white);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  font-size: 14px;
  font-weight: 700;
  color: var(--text);
  cursor: pointer;
  list-style: none;
}

.hub-more-summary::-webkit-details-marker {
  display: none;
}

.hub-more-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-top: 10px;
}

.hub-more-list .mistake-review-card,
.hub-more-list .vocab-review-card,
.hub-more-list .focus-area-card,
.hub-more-list .accuracy-milestone-card,
.hub-more-list .combo-milestone-card,
.hub-more-list .perfect-milestone-card,
.hub-more-list .perfect-streak-card {
  width: 100%;
  margin: 0;
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

.mistake-review-card {
  display: flex;
  align-items: center;
  gap: 12px;
  width: calc(100% - 32px);
  margin: 12px 16px 0;
  padding: 14px 16px;
  background: linear-gradient(135deg, #fff4ec 0%, #ffe8d6 100%);
  border: 1px solid #e6a060;
  border-radius: var(--radius-md);
  cursor: pointer;
  font-family: inherit;
  text-align: left;
  transition: box-shadow var(--transition), transform var(--transition);
}

.mistake-review-card:hover {
  box-shadow: 0 2px 10px rgba(230, 126, 34, 0.22);
  transform: translateY(-1px);
}

.mistake-review-icon {
  font-size: 32px;
  line-height: 1;
  flex-shrink: 0;
}

.mistake-review-copy {
  flex: 1;
  min-width: 0;
}

.mistake-review-title {
  margin: 0;
  font-size: 15px;
  font-weight: 700;
  color: #8a4a12;
  line-height: 1.3;
}

.mistake-review-sub {
  margin: 2px 0 0;
  font-size: 12px;
  color: #a65c1a;
  line-height: 1.35;
}

.mistake-review-action {
  flex-shrink: 0;
  font-size: 12px;
  font-weight: 700;
  color: #fff;
  background: #e67e22;
  padding: 8px 12px;
  border-radius: 999px;
}

.focus-area-card {
  display: flex;
  align-items: center;
  gap: 12px;
  width: calc(100% - 32px);
  margin: 12px 16px 0;
  padding: 14px 16px;
  background: linear-gradient(135deg, #fff8ed 0%, #ffefd6 100%);
  border: 1px solid #e8a84a;
  border-radius: var(--radius-md);
  cursor: pointer;
  font-family: inherit;
  text-align: left;
  transition: box-shadow var(--transition), transform var(--transition);
}

.focus-area-card:hover {
  box-shadow: 0 2px 10px rgba(232, 168, 74, 0.28);
  transform: translateY(-1px);
}

.focus-area-icon {
  font-size: 28px;
  line-height: 1;
  flex-shrink: 0;
}

.focus-area-copy {
  flex: 1;
  min-width: 0;
}

.focus-area-title {
  margin: 0;
  font-size: 15px;
  font-weight: 700;
  color: #8a5a12;
  line-height: 1.3;
}

.focus-area-sub {
  margin: 2px 0 0;
  font-size: 12px;
  color: #a66f1f;
  line-height: 1.35;
}

.focus-graduation-strip {
  margin-top: 6px;
}

.graduation-bar.mini {
  height: 6px;
  background: rgba(166, 111, 31, 0.18);
  border-radius: 999px;
  overflow: hidden;
}

.graduation-bar.mini .graduation-bar-fill {
  height: 100%;
  background: #c47d00;
  border-radius: 999px;
}

.focus-graduation-hint {
  margin: 4px 0 0;
  font-size: 11px;
  color: #b8842e;
  line-height: 1.35;
}

.focus-area-hint {
  margin: 4px 0 0;
  font-size: 11px;
  color: #b8842e;
  line-height: 1.35;
}

.focus-area-action {
  flex-shrink: 0;
  font-size: 12px;
  font-weight: 700;
  color: #fff;
  background: #e8a84a;
  padding: 8px 12px;
  border-radius: 999px;
}

.perfect-milestone-card {
  display: flex;
  align-items: center;
  gap: 14px;
  width: calc(100% - 32px);
  margin: 12px 16px 0;
  padding: 14px 16px;
  background: linear-gradient(135deg, #faf5ff 0%, #ede4ff 100%);
  border: 1px solid #a78bfa;
  border-radius: var(--radius-md);
  cursor: pointer;
  font-family: inherit;
  text-align: left;
  transition: box-shadow var(--transition), transform var(--transition);
}

.perfect-milestone-card:hover {
  box-shadow: 0 2px 10px rgba(139, 92, 246, 0.28);
  transform: translateY(-1px);
}

.perfect-milestone-ring-track {
  fill: none;
  stroke: #ddd6fe;
  stroke-width: 4;
}

.perfect-milestone-ring-fill {
  fill: none;
  stroke: #7c3aed;
  stroke-width: 4;
  stroke-linecap: round;
  stroke-dasharray: 113.1;
  transition: stroke-dashoffset 0.4s ease;
}

.perfect-milestone-title {
  margin: 0;
  font-size: 15px;
  font-weight: 700;
  color: #5b21b6;
  line-height: 1.3;
}

.perfect-milestone-sub {
  margin: 2px 0 0;
  font-size: 12px;
  color: #6d28d9;
  line-height: 1.35;
}

.perfect-milestone-hint {
  margin: 4px 0 0;
  font-size: 11px;
  color: #7c3aed;
  line-height: 1.35;
}

.perfect-streak-card {
  display: flex;
  align-items: center;
  gap: 12px;
  width: calc(100% - 32px);
  margin: 12px 16px 0;
  padding: 14px 16px;
  background: linear-gradient(135deg, #f3f0ff 0%, #e8e0ff 100%);
  border: 1px solid #9b7fe8;
  border-radius: var(--radius-md);
  cursor: pointer;
  font-family: inherit;
  text-align: left;
  transition: box-shadow var(--transition), transform var(--transition);
}

.perfect-streak-card:hover {
  box-shadow: 0 2px 10px rgba(139, 111, 224, 0.28);
  transform: translateY(-1px);
}

.perfect-streak-icon {
  font-size: 28px;
  line-height: 1;
  flex-shrink: 0;
}

.perfect-streak-copy {
  flex: 1;
  min-width: 0;
}

.perfect-streak-title {
  margin: 0;
  font-size: 14px;
  font-weight: 700;
  color: #5b3db8;
  line-height: 1.3;
}

.perfect-streak-sub {
  margin: 2px 0 0;
  font-size: 12px;
  color: #6b4fc4;
  line-height: 1.35;
}

.perfect-streak-chevron {
  flex-shrink: 0;
  font-size: 20px;
  color: #8b6fe0;
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

.vocab-milestone-card {
  display: flex;
  align-items: center;
  gap: 14px;
  width: calc(100% - 32px);
  margin: 12px 16px 0;
  padding: 14px 16px;
  background: linear-gradient(135deg, #eefaf3 0%, #d9f2e4 100%);
  border: 1px solid #5cb88a;
  border-radius: var(--radius-md);
  cursor: pointer;
  font-family: inherit;
  text-align: left;
  transition: box-shadow var(--transition), transform var(--transition);
}

.vocab-milestone-card:hover {
  box-shadow: 0 2px 10px rgba(92, 184, 138, 0.28);
  transform: translateY(-1px);
}

.vocab-milestone-ring-track {
  fill: none;
  stroke: #b8e6cc;
  stroke-width: 4;
}

.vocab-milestone-ring-fill {
  fill: none;
  stroke: #2e9e6a;
  stroke-width: 4;
  stroke-linecap: round;
  stroke-dasharray: 113.1;
  transition: stroke-dashoffset 0.4s ease;
}

.vocab-milestone-title {
  margin: 0;
  font-size: 15px;
  font-weight: 700;
  color: #1f6b47;
  line-height: 1.3;
}

.vocab-milestone-sub {
  margin: 2px 0 0;
  font-size: 12px;
  color: #2d7a52;
  line-height: 1.35;
}

.vocab-milestone-hint {
  margin: 4px 0 0;
  font-size: 11px;
  color: #3d8f62;
  line-height: 1.35;
}

.mistake-milestone-card {
  display: flex;
  align-items: center;
  gap: 14px;
  width: calc(100% - 32px);
  margin: 12px 16px 0;
  padding: 14px 16px;
  background: linear-gradient(135deg, #fff3ee 0%, #ffe4d9 100%);
  border: 1px solid #e6785a;
  border-radius: var(--radius-md);
  cursor: pointer;
  font-family: inherit;
  text-align: left;
  transition: box-shadow var(--transition), transform var(--transition);
}

.mistake-milestone-card:hover {
  box-shadow: 0 2px 10px rgba(230, 120, 90, 0.28);
  transform: translateY(-1px);
}

.mistake-milestone-ring-track {
  fill: none;
  stroke: #f5c4b4;
  stroke-width: 4;
}

.mistake-milestone-ring-fill {
  fill: none;
  stroke: #c45a3a;
  stroke-width: 4;
  stroke-linecap: round;
  stroke-dasharray: 113.1;
  transition: stroke-dashoffset 0.4s ease;
}

.mistake-milestone-title {
  margin: 0;
  font-size: 15px;
  font-weight: 700;
  color: #9a3f28;
  line-height: 1.3;
}

.mistake-milestone-sub {
  margin: 2px 0 0;
  font-size: 12px;
  color: #b04d32;
  line-height: 1.35;
}

.mistake-milestone-hint {
  margin: 4px 0 0;
  font-size: 11px;
  color: #c45a3a;
  line-height: 1.35;
}

.accuracy-milestone-card {
  display: flex;
  align-items: center;
  gap: 14px;
  width: calc(100% - 32px);
  margin: 12px 16px 0;
  padding: 14px 16px;
  background: linear-gradient(135deg, #eef4ff 0%, #d9e6ff 100%);
  border: 1px solid #5a8fd4;
  border-radius: var(--radius-md);
  cursor: pointer;
  font-family: inherit;
  text-align: left;
  transition: box-shadow var(--transition), transform var(--transition);
}

.accuracy-milestone-card:hover {
  box-shadow: 0 2px 10px rgba(90, 143, 212, 0.28);
  transform: translateY(-1px);
}

.accuracy-milestone-ring-track {
  fill: none;
  stroke: #b8d4f5;
  stroke-width: 4;
}

.accuracy-milestone-ring-fill {
  fill: none;
  stroke: #2e6eb8;
  stroke-width: 4;
  stroke-linecap: round;
  stroke-dasharray: 113.1;
  transition: stroke-dashoffset 0.4s ease;
}

.accuracy-milestone-title {
  margin: 0;
  font-size: 15px;
  font-weight: 700;
  color: #1f4f8a;
  line-height: 1.3;
}

.accuracy-milestone-sub {
  margin: 2px 0 0;
  font-size: 12px;
  color: #2d5f9e;
  line-height: 1.35;
}

.accuracy-milestone-hint {
  margin: 4px 0 0;
  font-size: 11px;
  color: #3d72ad;
  line-height: 1.35;
}

.combo-milestone-card {
  display: flex;
  align-items: center;
  gap: 14px;
  width: calc(100% - 32px);
  margin: 12px 16px 0;
  padding: 14px 16px;
  background: linear-gradient(135deg, #fff4e8 0%, #ffe4c7 100%);
  border: 1px solid #e89a4a;
  border-radius: var(--radius-md);
  cursor: pointer;
  font-family: inherit;
  text-align: left;
  transition: box-shadow var(--transition), transform var(--transition);
}

.combo-milestone-card:hover {
  box-shadow: 0 2px 10px rgba(232, 120, 50, 0.28);
  transform: translateY(-1px);
}

.combo-milestone-ring-track {
  fill: none;
  stroke: #f5c9a0;
  stroke-width: 4;
}

.combo-milestone-ring-fill {
  fill: none;
  stroke: #d96b1a;
  stroke-width: 4;
  stroke-linecap: round;
  stroke-dasharray: 113.1;
  transition: stroke-dashoffset 0.4s ease;
}

.combo-milestone-title {
  margin: 0;
  font-size: 15px;
  font-weight: 700;
  color: #9a4510;
  line-height: 1.3;
}

.combo-milestone-sub {
  margin: 2px 0 0;
  font-size: 12px;
  color: #b85a18;
  line-height: 1.35;
}

.combo-milestone-hint {
  margin: 4px 0 0;
  font-size: 11px;
  color: #c46a28;
  line-height: 1.35;
}

.streak-milestone-card {
  display: flex;
  align-items: center;
  gap: 14px;
  width: calc(100% - 32px);
  margin: 12px 16px 0;
  padding: 14px 16px;
  background: linear-gradient(135deg, #fff0e6 0%, #ffd9c2 100%);
  border: 1px solid #e87830;
  border-radius: var(--radius-md);
  cursor: pointer;
  font-family: inherit;
  text-align: left;
  transition: box-shadow var(--transition), transform var(--transition);
}

.streak-milestone-card:hover {
  box-shadow: 0 2px 10px rgba(230, 90, 30, 0.28);
  transform: translateY(-1px);
}

.streak-milestone-ring-track {
  fill: none;
  stroke: #f5b896;
  stroke-width: 4;
}

.streak-milestone-ring-fill {
  fill: none;
  stroke: #e65100;
  stroke-width: 4;
  stroke-linecap: round;
  stroke-dasharray: 113.1;
  transition: stroke-dashoffset 0.4s ease;
}

.streak-milestone-title {
  margin: 0;
  font-size: 15px;
  font-weight: 700;
  color: #bf360c;
  line-height: 1.3;
}

.streak-milestone-sub {
  margin: 2px 0 0;
  font-size: 12px;
  color: #d84315;
  line-height: 1.35;
}

.streak-milestone-hint {
  margin: 4px 0 0;
  font-size: 11px;
  color: #e64a19;
  line-height: 1.35;
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
  position: relative;
  width: calc(100% - 32px);
  margin: 12px 16px 0;
}

.daily-goal-main {
  display: flex;
  align-items: center;
  gap: 14px;
  width: 100%;
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

.daily-goal-card.has-resume .daily-goal-main {
  padding-top: 38px;
}

.daily-goal-main:hover {
  background: var(--green-bg);
}

.daily-goal-card.is-complete .daily-goal-main {
  border-color: var(--green);
  background: var(--green-bg);
}

.goal-continue-btn {
  position: absolute;
  top: 10px;
  right: 12px;
  z-index: 1;
  padding: 5px 10px;
  border: none;
  border-radius: 999px;
  background: var(--green-hover);
  color: #fff;
  font-size: 11px;
  font-weight: 700;
  font-family: inherit;
  cursor: pointer;
  transition: background var(--transition), transform var(--transition);
}

.goal-continue-btn:hover {
  background: var(--green);
  transform: translateY(-1px);
}

.daily-goal-card.is-complete .goal-continue-btn {
  background: var(--green);
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

.today-activity-strip {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 8px;
}

.today-activity-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3px 8px;
  font-size: 12px;
  font-weight: 600;
  color: var(--text);
  background: var(--surface-2);
  border-radius: var(--radius-sm);
  border: 1px solid transparent;
}

.daily-goal-card.is-complete .today-activity-chip {
  border-color: #b8e6c8;
}

.today-activity-empty {
  margin: 8px 0 0;
  font-size: 12px;
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

.week-strip-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 8px;
}

.week-strip-label {
  margin: 0;
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--text-light);
}

.week-goal-badge {
  font-size: 11px;
  font-weight: 700;
  color: var(--text);
  background: #f0f2f5;
  padding: 2px 8px;
  border-radius: 999px;
}

.week-strip.is-goal-met .week-goal-badge {
  color: var(--green-hover);
  background: #e8f5e9;
}

.week-goal-bar {
  height: 4px;
  border-radius: 999px;
  background: #f0f2f5;
  overflow: hidden;
  margin-bottom: 10px;
}

.week-goal-bar-fill {
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(90deg, #f5a623, #e65a00);
  transition: width 0.4s ease;
}

.week-strip.is-goal-met .week-goal-bar-fill {
  background: var(--green);
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

.week-strip.is-goal-met .week-strip-summary {
  color: var(--green-hover);
  font-weight: 600;
}

.module-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 10px;
  padding: 12px 16px 20px;
  box-sizing: border-box;
}

.module-tile {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  width: 100%;
  min-height: 88px;
  padding: 12px 8px;
  background: var(--white);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  cursor: pointer;
  font-family: inherit;
  transition: background var(--transition), box-shadow var(--transition);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
}

.module-badge {
  position: absolute;
  top: 8px;
  right: 8px;
  min-width: 18px;
  padding: 2px 6px;
  border-radius: 999px;
  background: var(--purple);
  color: #fff;
  font-size: 10px;
  font-weight: 700;
  line-height: 1.2;
}

.module-tile:hover:not(:disabled) {
  background: var(--green-bg);
}

.module-tile:disabled {
  opacity: 0.6;
  cursor: wait;
}

.module-icon {
  font-size: clamp(24px, 8vw, 32px);
  line-height: 1;
}

.module-label {
  font-size: 14px;
  font-weight: 600;
  color: var(--text);
  text-align: center;
  line-height: 1.2;
}
</style>