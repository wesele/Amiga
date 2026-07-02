<template>
  <div class="lesson-page">
    <header class="lesson-header">
      <button class="close-btn" :aria-label="t('common.back')" @click="exitLesson">
        ✕
      </button>
      <div class="progress-track">
        <div class="progress-fill" :style="{ width: progressPct + '%' }" />
      </div>
      <span
        v-if="comboBadgeVisible"
        class="combo-badge"
        :class="{ 'is-milestone': comboToast }"
        aria-live="polite"
      >
        🔥 {{ t("path.comboActive", { n: comboCount }) }}
      </span>
    </header>

    <div v-if="loading" class="center-state">{{ t("path.loading") }}</div>
    <div v-else-if="error" class="center-state">
      <p>{{ error }}</p>
      <button class="action-btn secondary" @click="load">{{ t("common.retry") }}</button>
    </div>

    <template v-else-if="finished">
      <div class="summary">
        <div class="summary-emoji">{{ summaryEmoji }}</div>
        <h2>{{ result?.passed ? t("path.lessonPassed") : t("path.lessonFailed") }}</h2>
        <p class="summary-score">
          {{ t("path.score", { correct: correctCount, total: questions.length }) }}
        </p>
        <div v-if="result?.passed" class="summary-stars">
          {{ "⭐".repeat(result.stars) }}
        </div>
        <p v-if="perfectLesson" class="perfect-lesson-banner">
          {{ t("path.perfectLesson") }}
        </p>
        <p
          v-if="result?.perfect_lesson_milestone_reached"
          class="perfect-streak-banner"
        >
          {{
            t(perfectLessonMilestoneKey(result.perfect_lesson_milestone_reached), {
              n: result.perfect_lesson_milestone_reached,
            })
          }}
        </p>
        <p
          v-else-if="result?.passed && result?.perfect_lesson_streak > 1 && perfectLesson"
          class="perfect-streak-banner"
        >
          {{ t("path.perfectLessonStreakActive", { n: result.perfect_lesson_streak }) }}
        </p>
        <p v-if="streakMilestone" class="streak-milestone-banner">
          {{ t(streakMilestoneKey(streakMilestone), { n: streakMilestone }) }}
        </p>
        <p
          v-else-if="result?.passed && result?.streak_extended"
          class="streak-banner"
        >
          {{ t("path.streakExtended", { n: result.streak_current }) }}
        </p>
        <p v-if="result?.passed && result?.daily_goal_just_met" class="daily-goal-banner">
          {{
            t("path.dailyGoalMetCelebration", {
              done: result.daily_goal_lessons_today,
              total: result.daily_goal_target,
            })
          }}
        </p>
        <p v-else-if="showDailyGoalNudge" class="daily-goal-banner is-nudge">
          {{
            t("path.dailyGoalRemaining", {
              remaining: dailyGoalRemaining,
              done: result.daily_goal_lessons_today,
              total: result.daily_goal_target,
            })
          }}
        </p>
        <p v-if="result?.passed && result?.weekly_goal_just_met" class="weekly-goal-banner">
          {{
            t("path.weeklyGoalMetCelebration", {
              done: result.weekly_goal_active_days,
              total: result.weekly_goal_target_days,
            })
          }}
        </p>
        <p v-else-if="showWeeklyGoalNudge" class="weekly-goal-banner is-nudge">
          {{
            t("path.weeklyGoalRemainingNudge", {
              remaining: weeklyGoalRemaining,
              done: result.weekly_goal_active_days,
              total: result.weekly_goal_target_days,
            })
          }}
        </p>
        <p v-if="showMistakeReviewNudge" class="mistake-review-nudge-banner">
          {{
            t("path.mistakeReviewRemainingNudge", {
              n: mistakeReviewNudgeTotal,
            })
          }}
        </p>
        <p v-if="showVocabReviewNudge" class="vocab-review-nudge-banner">
          {{
            t("path.vocabReviewRemainingNudge", {
              n: vocabReviewNudgeTotal,
            })
          }}
        </p>
        <p v-if="showFocusAreaNudge" class="focus-area-nudge-banner">
          {{
            t("path.focusAreaRemainingNudge", {
              type: t(focusAreaTypeKey(focusAreaAtStart.typeId)),
              pct: focusAreaAtStart.accuracyPct,
            })
          }}
        </p>
        <p v-if="result?.passed && result?.lesson_milestone_reached" class="lesson-milestone-banner">
          {{ t("path.lessonMilestoneReached", { n: result.lesson_milestone_reached }) }}
        </p>
        <p v-if="result?.level_upgraded" class="level-up-banner">
          🎓 {{ t("path.levelUp", { level: result.new_cefr_level }) }}
        </p>
        <p v-if="!result?.passed" class="retry-hint">{{ t("path.unlimitedRetry") }}</p>
        <section v-if="mistakes.length" class="mistake-review">
          <h3 class="mistake-review-title">{{ t("path.reviewMistakes") }}</h3>
          <p class="mistake-review-hint">{{ t("path.reviewMistakesHint") }}</p>
          <ul class="mistake-list">
            <li v-for="(item, idx) in mistakes" :key="item.question.id || idx" class="mistake-item">
              <span class="mistake-index">{{ idx + 1 }}</span>
              <div class="mistake-body">
                <p class="mistake-prompt">{{ formatQuestionPrompt(item.question, t) }}</p>
                <p
                  v-if="formatUserAnswer(item.question, item.answer)"
                  class="mistake-wrong"
                >
                  {{
                    t("path.mistakeReviewPreviousAnswer", {
                      answer: formatUserAnswer(item.question, item.answer),
                    })
                  }}
                </p>
                <p class="mistake-answer">
                  {{ t("path.correctAnswer", { answer: formatCorrectAnswer(item.question) }) }}
                </p>
              </div>
            </li>
          </ul>
        </section>
        <button
          v-if="showLessonShare"
          type="button"
          class="share-lesson-btn"
          :disabled="sharingLesson"
          @click="onShareLesson"
        >
          📤 {{ t("path.shareLesson") }}
        </button>
        <p v-if="shareStatus" class="share-status" role="status">{{ shareStatus }}</p>
        <div class="summary-actions">
          <button class="action-btn secondary" @click="retryLesson">{{ t("path.retry") }}</button>
          <button class="action-btn primary" @click="finishLesson">
            {{
              result?.passed
                ? showDailyGoalNudge
                  ? t("path.dailyGoalContinue", { remaining: dailyGoalRemaining })
                  : showMistakeReviewNudge
                    ? t("path.mistakeReviewContinue")
                    : showVocabReviewNudge
                      ? t("path.vocabReviewContinue")
                      : showFocusAreaNudge
                        ? t("path.focusAreaContinue")
                        : canContinueToNextLesson
                          ? t("path.continueNextLesson")
                          : t("path.continuePath")
                : t("path.backToPath")
            }}
          </button>
        </div>
      </div>
    </template>

    <template v-else-if="currentQuestion">
      <div class="lesson-body">
        <p v-if="inReinforcement" class="reinforcement-banner">
          {{
            t("path.reinforceMistakes", {
              current: reinforcementLabel.current,
              total: reinforcementLabel.total,
            })
          }}
        </p>
        <p v-if="inReinforcement" class="reinforcement-hint">{{ t("path.reinforceMistakesHint") }}</p>
        <p v-else class="section-label">{{ lesson?.section_title_native }}</p>
        <QuestionRenderer
          :question="currentQuestion"
          v-model:answer="currentAnswer"
          :show-result="showResult"
          :is-correct="lastCorrect"
        />
      </div>

      <footer class="lesson-footer">
        <button
          v-if="!showResult && hintAvailable"
          type="button"
          class="hint-btn"
          :disabled="hintShown"
          @click="revealHint"
        >
          💡 {{ t("path.getHint") }}
        </button>
        <p v-if="hintText" class="hint-text" :class="{ 'is-auto': hintAutoRevealed }">
          <span v-if="hintAutoRevealed" class="hint-auto-label">{{ t("path.hintAutoRevealed") }}</span>
          {{ hintText }}
        </p>
        <p v-if="showResult" class="feedback" :class="lastCorrect ? 'ok' : 'bad'">
          {{ lastCorrect ? t("path.correct") : t("path.incorrect") }}
        </p>
        <p v-if="comboToast" class="combo-toast">{{ comboToast }}</p>
        <p v-if="comboPersonalBestToast" class="combo-personal-best">{{ comboPersonalBestToast }}</p>
        <p v-if="commonMistakeFeedback" class="common-mistake-tip">
          {{ commonMistakeFeedback }}
        </p>
        <p
          v-if="showResult && !lastCorrect && correctAnswerText"
          class="answer-reveal"
        >
          {{ t("path.correctAnswer", { answer: correctAnswerText }) }}
        </p>
        <button
          class="action-btn primary"
          :disabled="!canCheck"
          @click="onPrimaryAction"
        >
          {{ primaryLabel }}
        </button>
      </footer>
    </template>
  </div>
</template>

<script setup>
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useI18n } from "@/shared/i18n";
import {
  completeSection,
  getSectionLesson,
  shareText as nativeShareText,
} from "@/shared/api.js";
import { useTargetLangStore } from "@/stores/targetLang.js";
import { loadLearningContext } from "@/shared/learningContext.js";
import QuestionRenderer from "./components/QuestionRenderer.vue";
import {
  checkAnswer,
  formatCorrectAnswer,
  formatQuestionPrompt,
  formatUserAnswer,
} from "./checkAnswer.js";
import { getQuestionHint, hasQuestionHint } from "./questionHint.js";
import { HINT_IDLE_MS, shouldScheduleAutoHint } from "./questionHintTimer.js";
import {
  LESSON_PHASE_MAIN,
  LESSON_PHASE_REINFORCEMENT,
  buildReinforcementQueue,
  isLastReinforcementQuestion,
  reinforcementLabel as formatReinforcementLabel,
  shouldStartReinforcement,
} from "./lessonReinforcement.js";
import { getStreakMilestone, streakMilestoneKey } from "./streakMilestone.js";
import {
  comboMilestoneKey,
  getComboMilestone,
  nextComboCount,
  showComboBadge,
} from "./lessonCombo.js";
import { isPerfectLesson } from "./lessonPerfect.js";
import { perfectLessonMilestoneKey } from "./perfectLessonStreak.js";
import { getCommonMistakeFeedback } from "./commonMistakeFeedback.js";
import { playAnswerFeedback } from "@/shared/lessonFeedback.js";
import {
  buildFocusArea,
  focusAreaTypeKey,
  loadQuestionTypeStats,
  pairStatsKey,
  recordAnswer,
} from "@/modules/learn/questionTypeStats.js";
import { recordAccuracyPeak } from "@/modules/profile/accuracyPeakStats.js";
import { recordComboAttempt } from "./lessonComboStats.js";
import { countDueForPair, recordLessonMistake } from "./mistakeReviewStore.js";
import { VOCAB_REVIEW_LIMIT } from "@/modules/learn/vocabReviewCard.js";
import { getUnknownWords } from "@/shared/api.js";
import { shareLessonResult, shouldShowLessonShare } from "./lessonShare.js";
import {
  dailyGoalLessonsRemaining,
  shouldShowDailyGoalNudge,
} from "./dailyGoalNudge.js";
import {
  weeklyGoalDaysRemaining,
  shouldShowWeeklyGoalNudge,
} from "./weeklyGoalNudge.js";
import {
  mistakeReviewNudgeCount,
  shouldShowMistakeReviewNudge,
} from "./mistakeReviewNudge.js";
import {
  shouldShowVocabReviewNudge,
  vocabReviewNudgeCount,
} from "./vocabReviewNudge.js";
import { shouldShowFocusAreaNudge } from "./focusAreaNudge.js";
import { focusPracticeRoute } from "./focusPracticeRoute.js";
import {
  continueRouteAfterLesson,
  shouldContinueToNextLesson,
} from "./lessonContinue.js";
import {
  isChoiceAnswer,
  shouldAutoSubmitOnChoice,
} from "./choiceAutoSubmit.js";
import { correctAutoAdvanceDelayMs } from "./practiceFlowTiming.js";

const route = useRoute();
const router = useRouter();
const { t } = useI18n();
const targetLangStore = useTargetLangStore();

const loading = ref(true);
const error = ref("");
const lesson = ref(null);
const questions = ref([]);
const index = ref(0);
const currentAnswer = ref(null);
const showResult = ref(false);
const lastCorrect = ref(false);
const correctCount = ref(0);
const finished = ref(false);
const result = ref(null);
const mistakes = ref([]);
const phase = ref(LESSON_PHASE_MAIN);
const reinforcementQueue = ref([]);
const reinforcementIndex = ref(0);
const hintText = ref("");
const hintShown = ref(false);
const hintAutoRevealed = ref(false);
let hintIdleTimer = null;
let autoAdvanceTimer = null;
const comboCount = ref(0);
const comboToast = ref("");
const comboPersonalBestToast = ref("");
const sharingLesson = ref(false);
const shareStatus = ref("");
let shareStatusTimer = null;
const dueMistakesAtStart = ref(0);
const dueVocabAtStart = ref(0);
const focusAreaAtStart = ref(null);

const userMeta = ref({ nativeLang: "zh", targetLang: "es", cefr: "A1" });

const inReinforcement = computed(() => phase.value === LESSON_PHASE_REINFORCEMENT);

const currentQuestion = computed(() => {
  if (inReinforcement.value) {
    return reinforcementQueue.value[reinforcementIndex.value] || null;
  }
  return questions.value[index.value] || null;
});

const reinforcementLabel = computed(() =>
  formatReinforcementLabel(
    reinforcementIndex.value,
    reinforcementQueue.value.length,
  ),
);

const progressPct = computed(() => {
  if (finished.value) return 100;
  if (inReinforcement.value) {
    const total = reinforcementQueue.value.length;
    if (!total) return 100;
    const done = reinforcementIndex.value + (showResult.value ? 1 : 0);
    return Math.round((done / total) * 100);
  }
  if (!questions.value.length) return 0;
  return Math.round((index.value / questions.value.length) * 100);
});

const canCheck = computed(() => {
  if (showResult.value) return true;
  const q = currentQuestion.value;
  if (!q) return false;
  if (["T01", "T02", "T05", "T07", "T08", "T12"].includes(q.type)) {
    return currentAnswer.value != null;
  }
  if (q.type === "T03") {
    return (currentAnswer.value || []).length === (q.pairs || []).length;
  }
  if (q.type === "T06") {
    return (currentAnswer.value || []).length > 0;
  }
  if (q.type === "T09" || q.type === "T10") {
    return String(currentAnswer.value || "").trim().length > 0;
  }
  return false;
});

const correctAnswerText = computed(() =>
  showResult.value && !lastCorrect.value
    ? formatCorrectAnswer(currentQuestion.value)
    : "",
);

const commonMistakeFeedback = computed(() => {
  if (!showResult.value || lastCorrect.value || !currentQuestion.value) return "";
  return (
    getCommonMistakeFeedback(
      currentQuestion.value,
      currentAnswer.value,
      t,
    ) || ""
  );
});

const primaryLabel = computed(() => {
  if (showResult.value) {
    const isLast = inReinforcement.value
      ? isLastReinforcementQuestion(
          reinforcementIndex.value,
          reinforcementQueue.value.length,
        )
      : index.value >= questions.value.length - 1;
    return isLast ? t("path.finish") : t("path.next");
  }
  return t("path.check");
});

const hintAvailable = computed(() => hasQuestionHint(currentQuestion.value));

const comboBadgeVisible = computed(
  () => !finished.value && !inReinforcement.value && showComboBadge(comboCount.value),
);

const streakMilestone = computed(() => {
  if (!result.value?.passed) return null;
  return getStreakMilestone(
    result.value.streak_current,
    result.value.streak_extended,
  );
});

const perfectLesson = computed(() =>
  isPerfectLesson({
    mistakeCount: mistakes.value.length,
    correctCount: correctCount.value,
    totalQuestions: questions.value.length,
    passed: Boolean(result.value?.passed),
  }),
);

const showLessonShare = computed(() => shouldShowLessonShare(result.value));

const showDailyGoalNudge = computed(() => shouldShowDailyGoalNudge(result.value));

const dailyGoalRemaining = computed(() => dailyGoalLessonsRemaining(result.value));

const showWeeklyGoalNudge = computed(() =>
  shouldShowWeeklyGoalNudge(result.value, {
    dailyGoalNudgeActive: showDailyGoalNudge.value,
  }),
);

const weeklyGoalRemaining = computed(() => weeklyGoalDaysRemaining(result.value));

const showMistakeReviewNudge = computed(() =>
  shouldShowMistakeReviewNudge(result.value, {
    dueAtStart: dueMistakesAtStart.value,
    dailyGoalNudgeActive: showDailyGoalNudge.value,
  }),
);

const mistakeReviewNudgeTotal = computed(() =>
  mistakeReviewNudgeCount(dueMistakesAtStart.value),
);

const showVocabReviewNudge = computed(() =>
  shouldShowVocabReviewNudge(result.value, {
    dueAtStart: dueVocabAtStart.value,
    dailyGoalNudgeActive: showDailyGoalNudge.value,
    mistakeReviewNudgeActive: showMistakeReviewNudge.value,
  }),
);

const vocabReviewNudgeTotal = computed(() => vocabReviewNudgeCount(dueVocabAtStart.value));

const showFocusAreaNudge = computed(() =>
  shouldShowFocusAreaNudge(result.value, {
    focusArea: focusAreaAtStart.value,
    dailyGoalNudgeActive: showDailyGoalNudge.value,
    mistakeReviewNudgeActive: showMistakeReviewNudge.value,
    vocabReviewNudgeActive: showVocabReviewNudge.value,
  }),
);

const canContinueToNextLesson = computed(() =>
  shouldContinueToNextLesson(result.value),
);

const summaryEmoji = computed(() => {
  if (!result.value?.passed) return "💪";
  return perfectLesson.value ? "✨" : "🎉";
});

function clearHintIdleTimer() {
  if (hintIdleTimer != null) {
    clearTimeout(hintIdleTimer);
    hintIdleTimer = null;
  }
}

function revealHint({ auto = false } = {}) {
  if (hintShown.value || !currentQuestion.value) return;
  const hint = getQuestionHint(currentQuestion.value, t);
  if (!hint) return;
  clearHintIdleTimer();
  hintText.value = hint;
  hintShown.value = true;
  hintAutoRevealed.value = auto;
}

function resetHint() {
  clearHintIdleTimer();
  hintText.value = "";
  hintShown.value = false;
  hintAutoRevealed.value = false;
}

function scheduleAutoHint() {
  clearHintIdleTimer();
  if (
    !shouldScheduleAutoHint({
      hintAvailable: hintAvailable.value,
      hintShown: hintShown.value,
      showResult: showResult.value,
      finished: finished.value,
      inReinforcement: inReinforcement.value,
    })
  ) {
    return;
  }
  hintIdleTimer = setTimeout(() => revealHint({ auto: true }), HINT_IDLE_MS);
}

function resetCombo() {
  comboCount.value = 0;
  comboToast.value = "";
  comboPersonalBestToast.value = "";
}

function updateCombo(isCorrect) {
  if (inReinforcement.value) return;
  comboCount.value = nextComboCount(comboCount.value, isCorrect);
  const milestone = getComboMilestone(comboCount.value);
  comboToast.value = milestone ? t(comboMilestoneKey(milestone)) : "";
  comboPersonalBestToast.value = "";
  if (isCorrect && comboCount.value > 0) {
    const pairKey = pairStatsKey(userMeta.value.nativeLang, userMeta.value.targetLang);
    const { isNewBest, best } = recordComboAttempt(pairKey, comboCount.value);
    if (isNewBest) {
      comboPersonalBestToast.value = t("path.comboPersonalBest", { n: best });
    }
  }
}

watch(
  [
    currentQuestion,
    hintShown,
    showResult,
    finished,
    inReinforcement,
    currentAnswer,
  ],
  () => {
    scheduleAutoHint();
  },
);

function clearAutoAdvanceTimer() {
  if (autoAdvanceTimer != null) {
    clearTimeout(autoAdvanceTimer);
    autoAdvanceTimer = null;
  }
}

function scheduleAutoAdvance() {
  clearAutoAdvanceTimer();
  const delay = correctAutoAdvanceDelayMs({
    comboToast: comboToast.value,
    comboPersonalBestToast: comboPersonalBestToast.value,
  });
  autoAdvanceTimer = setTimeout(() => {
    if (showResult.value && lastCorrect.value) {
      advanceAfterResult();
    }
  }, delay);
}

onUnmounted(() => {
  clearHintIdleTimer();
  clearAutoAdvanceTimer();
  if (shareStatusTimer) clearTimeout(shareStatusTimer);
});

async function load() {
  loading.value = true;
  error.value = "";
  try {
    const { user, targetLang, cefr } = await loadLearningContext({ targetLangStore });
    userMeta.value = {
      nativeLang: user.native_language,
      targetLang,
      cefr,
    };
    const pairKey = pairStatsKey(user.native_language, targetLang);
    dueMistakesAtStart.value = countDueForPair(pairKey);
    focusAreaAtStart.value = buildFocusArea(loadQuestionTypeStats(pairKey));
    try {
      const words = await getUnknownWords(
        user.id,
        cefr,
        VOCAB_REVIEW_LIMIT,
        targetLang,
      );
      dueVocabAtStart.value = Array.isArray(words) ? words.length : 0;
    } catch {
      dueVocabAtStart.value = 0;
    }
    const data = await getSectionLesson(
      user.native_language,
      targetLang,
      cefr,
      route.params.sectionId,
    );
    lesson.value = data;
    questions.value = data.questions || [];
    resetSession();
  } catch (e) {
    error.value = e?.message || String(e);
  } finally {
    loading.value = false;
  }
}

function resetSession() {
  index.value = 0;
  currentAnswer.value = null;
  showResult.value = false;
  lastCorrect.value = false;
  correctCount.value = 0;
  finished.value = false;
  result.value = null;
  mistakes.value = [];
  phase.value = LESSON_PHASE_MAIN;
  reinforcementQueue.value = [];
  reinforcementIndex.value = 0;
  resetHint();
  resetCombo();
}

function startReinforcement() {
  phase.value = LESSON_PHASE_REINFORCEMENT;
  reinforcementQueue.value = buildReinforcementQueue(mistakes.value);
  reinforcementIndex.value = 0;
  currentAnswer.value = null;
  showResult.value = false;
  lastCorrect.value = false;
  resetHint();
  resetCombo();
}

function advanceQuestion() {
  clearAutoAdvanceTimer();
  currentAnswer.value = null;
  showResult.value = false;
  lastCorrect.value = false;
  resetHint();
  comboToast.value = "";
  comboPersonalBestToast.value = "";
}

function advanceReinforcement() {
  if (reinforcementIndex.value < reinforcementQueue.value.length - 1) {
    reinforcementIndex.value += 1;
    advanceQuestion();
    return false;
  }
  return true;
}

function retryLesson() {
  resetSession();
}

function exitLesson() {
  router.replace({ name: "path" });
}

async function finishLesson() {
  if (showMistakeReviewNudge.value) {
    router.replace({ name: "path-mistake-review" });
    return;
  }
  if (showVocabReviewNudge.value) {
    router.replace({ name: "vocab-review" });
    return;
  }
  if (showFocusAreaNudge.value) {
    const typeId = focusAreaAtStart.value?.typeId;
    if (typeId) { router.replace(focusPracticeRoute(typeId)); return; }
    router.replace({ name: "path" });
    return;
  }
  const nextRoute = continueRouteAfterLesson(result.value);
  if (nextRoute) {
    router.replace(nextRoute);
    return;
  }
  router.replace({ name: "path" });
}

function showShareStatus(message) {
  shareStatus.value = message;
  if (shareStatusTimer) clearTimeout(shareStatusTimer);
  shareStatusTimer = setTimeout(() => {
    shareStatus.value = "";
  }, 2500);
}

async function onShareLesson() {
  if (sharingLesson.value || !result.value?.passed) return;
  sharingLesson.value = true;
  try {
    await shareLessonResult({
      sectionTitle: lesson.value?.section_title_native,
      correct: correctCount.value,
      total: questions.value.length,
      stars: result.value.stars ?? 0,
      result: result.value,
      perfectLesson: perfectLesson.value,
      t,
      nativeShareText,
      showShareStatus,
    });
  } finally {
    sharingLesson.value = false;
  }
}

function checkCurrentAnswer() {
  if (showResult.value || !currentQuestion.value) return;

  lastCorrect.value = checkAnswer(currentQuestion.value, currentAnswer.value);
  playAnswerFeedback(lastCorrect.value);
  if (!inReinforcement.value && currentQuestion.value?.type) {
    const pairKey = pairStatsKey(userMeta.value.nativeLang, userMeta.value.targetLang);
    recordAnswer(pairKey, currentQuestion.value.type, lastCorrect.value);
    recordAccuracyPeak(pairKey);
  }
  updateCombo(lastCorrect.value);
  if (lastCorrect.value) {
    correctCount.value += 1;
  } else if (!inReinforcement.value) {
    mistakes.value.push({
      question: currentQuestion.value,
      answer: currentAnswer.value,
    });
    recordLessonMistake(
      pairStatsKey(userMeta.value.nativeLang, userMeta.value.targetLang),
      currentQuestion.value,
      currentAnswer.value,
    );
  }
  showResult.value = true;
  if (lastCorrect.value) {
    scheduleAutoAdvance();
  }
}

function advanceAfterResult() {
  clearAutoAdvanceTimer();

  if (inReinforcement.value) {
    if (!advanceReinforcement()) return;
    submitLesson();
    return;
  }

  if (index.value < questions.value.length - 1) {
    index.value += 1;
    advanceQuestion();
    return;
  }

  if (shouldStartReinforcement(mistakes.value, phase.value)) {
    startReinforcement();
    return;
  }

  submitLesson();
}

function onPrimaryAction() {
  if (!showResult.value) {
    checkCurrentAnswer();
    return;
  }

  advanceAfterResult();
}

watch(currentAnswer, (answer) => {
  if (!isChoiceAnswer(answer) || showResult.value) return;
  const question = currentQuestion.value;
  if (!shouldAutoSubmitOnChoice(question)) return;
  checkCurrentAnswer();
});

async function submitLesson() {
  try {
    const wasPerfect = isPerfectLesson({
      mistakeCount: mistakes.value.length,
      correctCount: correctCount.value,
      totalQuestions: questions.value.length,
      passed: true,
    });
    const res = await completeSection(
      userMeta.value.nativeLang,
      userMeta.value.targetLang,
      userMeta.value.cefr,
      route.params.sectionId,
      correctCount.value,
      questions.value.length,
      wasPerfect,
    );
    result.value = res;
    finished.value = true;
  } catch (e) {
    error.value = e?.message || String(e);
  }
}

onMounted(load);
</script>

<style scoped>
.lesson-page {
  min-height: 100%;
  display: flex;
  flex-direction: column;
  background: var(--bg);
}

.lesson-header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  background: var(--white);
  border-bottom: 1px solid var(--border);
}

.close-btn {
  width: 36px;
  height: 36px;
  border: none;
  border-radius: 50%;
  background: var(--gray-light);
  font-size: 18px;
  cursor: pointer;
}

.progress-track {
  flex: 1;
  height: 14px;
  background: var(--gray-light);
  border-radius: 999px;
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  background: var(--green);
  border-radius: 999px;
  transition: width 0.25s ease;
}

.combo-badge {
  flex-shrink: 0;
  padding: 4px 10px;
  background: var(--orange-bg);
  color: var(--orange-hover);
  border-radius: 999px;
  font-size: 13px;
  font-weight: 700;
  white-space: nowrap;
  transition: transform 0.2s ease;
}

.combo-badge.is-milestone {
  animation: combo-pop 0.45s ease;
}

@keyframes combo-pop {
  0% {
    transform: scale(1);
  }
  40% {
    transform: scale(1.12);
  }
  100% {
    transform: scale(1);
  }
}

.center-state,
.lesson-body,
.summary {
  flex: 1;
  padding: 24px 20px;
}

.center-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  color: var(--text-light);
}

.section-label {
  margin: 0 0 16px;
  font-size: 13px;
  color: var(--text-light);
  font-weight: 600;
}

.reinforcement-banner {
  margin: 0 0 6px;
  padding: 10px 12px;
  background: var(--orange-bg);
  color: var(--orange-hover);
  border-radius: var(--radius-sm);
  font-size: 14px;
  font-weight: 700;
  text-align: center;
}

.reinforcement-hint {
  margin: 0 0 16px;
  font-size: 13px;
  color: var(--text-light);
  text-align: center;
  line-height: 1.35;
}

.lesson-footer {
  padding: 16px 20px calc(16px + var(--safe-bottom));
  background: var(--white);
  border-top: 1px solid var(--border);
}

.hint-btn {
  width: 100%;
  margin-bottom: 10px;
  padding: 10px 14px;
  border: 2px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--white);
  color: var(--text);
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
}

.hint-btn:disabled {
  opacity: 0.55;
  cursor: default;
}

.hint-text.is-auto {
  border-color: rgba(255, 193, 7, 0.35);
  background: rgba(255, 193, 7, 0.08);
}

.hint-auto-label {
  display: block;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary, #888);
  margin-bottom: 4px;
}

.hint-text {
  margin: 0 0 10px;
  padding: 10px 12px;
  background: var(--orange-bg);
  border-radius: var(--radius-sm);
  color: var(--orange-hover);
  font-size: 14px;
  line-height: 1.45;
  text-align: center;
}

.feedback {
  margin: 0 0 10px;
  font-weight: 700;
  text-align: center;
}

.feedback.ok {
  color: var(--green-hover);
}

.feedback.bad {
  color: var(--red);
}

.combo-toast {
  margin: 0 0 10px;
  padding: 10px 12px;
  background: linear-gradient(135deg, #fff8e6 0%, #ffe4a8 100%);
  color: #8a5a00;
  border: 1.5px solid #e6a817;
  border-radius: var(--radius-sm);
  font-size: 15px;
  font-weight: 700;
  text-align: center;
  animation: combo-toast-pop 0.5s ease;
}

.combo-personal-best {
  margin: 0 0 10px;
  padding: 10px 12px;
  background: linear-gradient(135deg, #f3ecff 0%, #e0d0ff 100%);
  color: #5a3d8a;
  border: 1.5px solid #9b7ad8;
  border-radius: var(--radius-sm);
  font-size: 15px;
  font-weight: 700;
  text-align: center;
  animation: combo-toast-pop 0.5s ease;
}

@keyframes combo-toast-pop {
  0% {
    opacity: 0;
    transform: scale(0.92);
  }
  60% {
    transform: scale(1.03);
  }
  100% {
    opacity: 1;
    transform: scale(1);
  }
}

.common-mistake-tip {
  margin: 0 0 10px;
  padding: 10px 12px;
  background: #fff4e6;
  border: 1.5px solid #f0b429;
  border-radius: var(--radius-sm);
  color: #7a4b00;
  font-size: 14px;
  line-height: 1.45;
  text-align: center;
}

.answer-reveal {
  margin: 0 0 10px;
  padding: 10px 12px;
  background: var(--green-bg);
  border-radius: var(--radius-sm);
  color: var(--text);
  font-size: 14px;
  line-height: 1.45;
  text-align: center;
}

.action-btn {
  width: 100%;
  padding: 14px;
  border: none;
  border-radius: var(--radius-md);
  font-size: 16px;
  font-weight: 700;
  cursor: pointer;
}

.action-btn.primary {
  background: var(--green);
  color: var(--white);
  box-shadow: 0 4px 0 var(--green-hover);
}

.action-btn.primary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  box-shadow: none;
}

.action-btn.secondary {
  background: var(--white);
  color: var(--text);
  border: 2px solid var(--border);
}

.summary {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  gap: 10px;
}

.summary-emoji {
  font-size: 56px;
}

.summary-score {
  margin: 0;
  color: var(--text-light);
}

.summary-stars {
  font-size: 28px;
}

.streak-banner {
  margin: 8px 0 0;
  padding: 12px 16px;
  background: var(--orange-bg);
  color: var(--orange-hover);
  border-radius: var(--radius-md);
  font-weight: 700;
}

.streak-milestone-banner {
  margin: 8px 0 0;
  padding: 14px 16px;
  background: linear-gradient(135deg, #fff8e6 0%, #ffe4a8 100%);
  color: #8a5a00;
  border: 1.5px solid #e6a817;
  border-radius: var(--radius-md);
  font-weight: 700;
  font-size: 15px;
  line-height: 1.4;
  text-align: center;
  animation: milestone-pop 0.6s ease;
}

@keyframes milestone-pop {
  0% {
    opacity: 0;
    transform: scale(0.92);
  }
  60% {
    transform: scale(1.03);
  }
  100% {
    opacity: 1;
    transform: scale(1);
  }
}

.daily-goal-banner {
  margin: 8px 0 0;
  padding: 12px 16px;
  background: var(--green-bg);
  color: var(--green-hover);
  border-radius: var(--radius-md);
  font-weight: 700;
  animation: goal-pop 0.5s ease;
}

.daily-goal-banner.is-nudge {
  background: linear-gradient(135deg, #fff8e6 0%, #ffefcc 100%);
  color: #8a6200;
  border: 1px solid #e6b84d;
}

.weekly-goal-banner {
  margin: 8px 0 0;
  padding: 12px 16px;
  background: var(--blue-bg);
  color: var(--blue-hover);
  border-radius: var(--radius-md);
  font-weight: 700;
  animation: goal-pop 0.5s ease;
}

.weekly-goal-banner.is-nudge {
  background: linear-gradient(135deg, #eef6ff 0%, #d9ebff 100%);
  color: #1a5a9e;
  border: 1px solid #7eb8e8;
}

.mistake-review-nudge-banner {
  margin: 8px 0 0;
  padding: 12px 16px;
  background: linear-gradient(135deg, #fff0f3 0%, #ffe0e8 100%);
  color: #9e1a3a;
  border: 1px solid #e87e9a;
  border-radius: var(--radius-md);
  font-weight: 700;
  animation: goal-pop 0.5s ease;
}

.vocab-review-nudge-banner {
  margin: 8px 0 0;
  padding: 12px 16px;
  background: linear-gradient(135deg, #eef4ff 0%, #dce8ff 100%);
  color: #1a4f9c;
  border: 1px solid #7ba7f7;
  border-radius: var(--radius-md);
  font-weight: 700;
  animation: goal-pop 0.5s ease;
}

.focus-area-nudge-banner {
  margin: 8px 0 0;
  padding: 12px 16px;
  background: linear-gradient(135deg, #fff8ef 0%, #ffe8d4 100%);
  color: #8a4a00;
  border: 1px solid #e6a85c;
  border-radius: var(--radius-md);
  font-weight: 700;
  animation: goal-pop 0.5s ease;
}

@keyframes goal-pop {
  0% {
    opacity: 0;
    transform: scale(0.92);
  }
  60% {
    transform: scale(1.03);
  }
  100% {
    opacity: 1;
    transform: scale(1);
  }
}

.lesson-milestone-banner {
  margin: 8px 0 0;
  padding: 12px 16px;
  background: linear-gradient(135deg, #fff8e6 0%, #ffefcc 100%);
  color: #8a6200;
  border: 1px solid #e6b84d;
  border-radius: var(--radius-md);
  font-weight: 700;
  animation: goal-pop 0.5s ease;
}

.perfect-lesson-banner {
  margin: 8px 0 0;
  padding: 14px 16px;
  background: linear-gradient(135deg, #f3f0ff 0%, #e4dbff 100%);
  color: #5b3db8;
  border: 1.5px solid #9b7fe8;
  border-radius: var(--radius-md);
  font-weight: 700;
  font-size: 15px;
  line-height: 1.4;
  animation: perfect-pop 0.6s ease;
}

.perfect-streak-banner {
  margin: 8px 0 0;
  padding: 12px 16px;
  background: linear-gradient(135deg, #ede8ff 0%, #d9ceff 100%);
  color: #4a2f9e;
  border: 1.5px solid #8b6fe0;
  border-radius: var(--radius-md);
  font-weight: 700;
  font-size: 14px;
  line-height: 1.4;
  animation: perfect-pop 0.6s ease;
}

@keyframes perfect-pop {
  0% {
    opacity: 0;
    transform: scale(0.9) translateY(6px);
  }
  60% {
    transform: scale(1.04) translateY(0);
  }
  100% {
    opacity: 1;
    transform: scale(1) translateY(0);
  }
}

.level-up-banner {
  margin: 8px 0 0;
  padding: 12px 16px;
  background: var(--orange-bg);
  color: var(--orange-hover);
  border-radius: var(--radius-md);
  font-weight: 700;
}

.retry-hint {
  margin: 0;
  font-size: 14px;
  color: var(--text-light);
}

.mistake-review {
  width: 100%;
  max-width: 360px;
  margin-top: 8px;
  padding: 14px 16px;
  background: var(--white);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  text-align: left;
}

.mistake-review-title {
  margin: 0 0 4px;
  font-size: 16px;
  font-weight: 700;
}

.mistake-review-hint {
  margin: 0 0 12px;
  font-size: 13px;
  color: var(--text-light);
  line-height: 1.4;
}

.mistake-list {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.mistake-item {
  display: flex;
  gap: 10px;
  padding: 10px 12px;
  background: var(--green-bg);
  border-radius: var(--radius-sm);
}

.mistake-index {
  flex-shrink: 0;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  background: var(--orange-bg);
  color: var(--orange-hover);
  font-size: 12px;
  font-weight: 700;
  line-height: 22px;
  text-align: center;
}

.mistake-body {
  flex: 1;
  min-width: 0;
}

.mistake-prompt {
  margin: 0 0 4px;
  font-size: 14px;
  font-weight: 600;
  line-height: 1.4;
}

.mistake-wrong {
  margin: 0 0 4px;
  font-size: 13px;
  color: var(--red);
  line-height: 1.4;
}

.mistake-answer {
  margin: 0;
  font-size: 13px;
  color: var(--green-hover);
  line-height: 1.4;
}

.share-lesson-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  width: 100%;
  max-width: 320px;
  margin-top: 12px;
  padding: 12px 16px;
  border: 1.5px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--white);
  color: var(--text);
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
}

.share-lesson-btn:hover:not(:disabled) {
  background: var(--green-bg);
  border-color: var(--green);
  color: var(--green-hover);
}

.share-lesson-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.share-status {
  margin: 8px 0 0;
  font-size: 12px;
  color: var(--text-lighter);
  text-align: center;
}

.summary-actions {
  display: flex;
  flex-direction: column;
  gap: 10px;
  width: 100%;
  max-width: 320px;
  margin-top: 16px;
}
</style>