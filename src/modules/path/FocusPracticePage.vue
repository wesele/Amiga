<template>
  <div class="focus-practice-page">
    <header class="review-header">
      <button type="button" class="close-btn" :aria-label="t('common.back')" @click="exitPractice">
        ✕
      </button>
      <div v-if="!finished && questions.length" class="progress-track">
        <div class="progress-fill" :style="{ width: progressPct + '%' }" />
      </div>
      <span v-if="!finished && questions.length" class="progress-label">
        {{ t("path.focusPracticeProgress", { current: progress.current, total: progress.total }) }}
      </span>
    </header>

    <div v-if="loading" class="center-state">{{ t("path.loading") }}</div>

    <div v-else-if="error" class="center-state">
      <p>{{ error }}</p>
      <button type="button" class="action-btn secondary" @click="load">{{ t("common.retry") }}</button>
    </div>

    <div v-else-if="!questions.length" class="center-state">
      <span class="empty-emoji" aria-hidden="true">✨</span>
      <p>{{ t("path.focusPracticeEmpty") }}</p>
      <button type="button" class="action-btn primary" @click="exitPractice">
        {{ t("path.focusPracticeBack") }}
      </button>
    </div>

    <div v-else-if="finished" class="summary">
      <div class="summary-emoji" aria-hidden="true">🎯</div>
      <h2>{{ t("path.focusPracticeComplete") }}</h2>
      <p class="summary-sub">
        {{ t("path.focusPracticeCompleteHint", { n: questions.length }) }}
      </p>
      <p class="summary-stat">
        {{ t("path.focusPracticeAccuracy", { pct: accuracyPct }) }}
      </p>
      <p v-if="streakCelebration" class="streak-banner">{{ streakCelebration }}</p>
      <p v-if="showContinuePractice" class="continue-hint">{{ t(FOCUS_CONTINUE_HINT_KEY) }}</p>
      <div class="summary-actions">
        <button
          v-if="showContinuePractice"
          type="button"
          class="action-btn primary"
          :disabled="continuing"
          @click="continuePractice"
        >
          {{ t(FOCUS_CONTINUE_LABEL_KEY) }}
        </button>
        <button
          type="button"
          class="action-btn"
          :class="showContinuePractice ? 'secondary' : 'primary'"
          @click="exitPractice"
        >
          {{ t("path.focusPracticeBack") }}
        </button>
      </div>
    </div>

    <template v-else-if="currentQuestion">
      <div class="review-body">
        <p class="review-badge">{{ t("path.focusPracticeBadge") }}</p>
        <p class="type-label">{{ t(focusAreaTypeKey(questionType)) }}</p>
        <PracticeQuestionTransition :question-key="questionTransitionKey">
          <QuestionRenderer
            :question="currentQuestion"
            v-model:answer="currentAnswer"
            :show-result="showResult"
            :is-correct="lastCorrect"
            @submit="onPrimaryAction"
          />
        </PracticeQuestionTransition>
      </div>

      <footer class="review-footer">
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
        <p v-if="nearMissFeedback" class="near-miss-tip">
          {{ nearMissFeedback }}
        </p>
        <p
          v-if="showResult && !lastCorrect && correctAnswerText"
          class="answer-reveal"
        >
          {{ t("path.correctAnswer", { answer: correctAnswerText }) }}
        </p>
        <button
          type="button"
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
import { getFocusPractice } from "@/shared/api.js";
import { loadLearningContext } from "@/shared/learningContext.js";
import { applyReviewStreak, reviewStreakCelebration } from "@/shared/reviewStreak.js";
import {
  focusAreaTypeKey,
  pairStatsKey,
  recordAnswer,
} from "@/modules/learn/questionTypeStats.js";
import { playAnswerFeedback } from "@/shared/lessonFeedback.js";
import { getQuestionHint, hasQuestionHint } from "./questionHint.js";
import { HINT_IDLE_MS, shouldScheduleAutoHint } from "./questionHintTimer.js";
import { isValidFocusType } from "./focusPracticeRoute.js";
import {
  FOCUS_CONTINUE_HINT_KEY,
  FOCUS_CONTINUE_LABEL_KEY,
  shouldOfferFocusContinuation,
} from "./focusPracticeContinuation.js";
import {
  sessionAccuracy,
  sessionProgress,
  sessionProgressPct,
} from "./focusPracticeSession.js";
import QuestionRenderer from "./components/QuestionRenderer.vue";
import PracticeQuestionTransition from "./components/PracticeQuestionTransition.vue";
import { practiceQuestionKey } from "./practiceQuestionKey.js";
import { checkAnswer, formatCorrectAnswer } from "./checkAnswer.js";
import { getNearMissFeedback } from "./nearMissAnswer.js";
import { shouldAutoCheckOnAnswerChange } from "./practiceAnswerAutoCheck.js";
import { correctAutoAdvanceDelayMs } from "./practiceFlowTiming.js";
import { usePracticeEnterKey } from "./usePracticeEnterKey.js";

const route = useRoute();
const router = useRouter();
const { t } = useI18n();

const loading = ref(true);
const error = ref("");
const questions = ref([]);
const questionType = ref("");
const index = ref(0);
const currentAnswer = ref(null);
const showResult = ref(false);
const lastCorrect = ref(false);
const finished = ref(false);
const correctCount = ref(0);
const userId = ref("");
const pairKey = ref("");
const streakUpdate = ref(null);
const continuing = ref(false);
const hintText = ref("");
const hintShown = ref(false);
const hintAutoRevealed = ref(false);
let hintIdleTimer = null;
let autoAdvanceTimer = null;

const currentQuestion = computed(() => questions.value[index.value] ?? null);

const questionTransitionKey = computed(() =>
  practiceQuestionKey({
    question: currentQuestion.value,
    index: index.value,
  }),
);

const progress = computed(() => sessionProgress(index.value, questions.value.length));

const progressPct = computed(() =>
  sessionProgressPct(index.value, questions.value.length, {
    answered: showResult.value,
  }),
);

const accuracyPct = computed(() => sessionAccuracy(correctCount.value, questions.value.length));

const streakCelebration = computed(() =>
  reviewStreakCelebration(streakUpdate.value, t),
);

const showContinuePractice = computed(() =>
  shouldOfferFocusContinuation(questions.value.length, accuracyPct.value),
);

const correctAnswerText = computed(() =>
  currentQuestion.value ? formatCorrectAnswer(currentQuestion.value) : "",
);

const nearMissFeedback = computed(() => {
  if (!showResult.value || lastCorrect.value || !currentQuestion.value) return "";
  return (
    getNearMissFeedback(
      currentQuestion.value,
      currentAnswer.value,
      t,
    ) || ""
  );
});

const canCheck = computed(() => {
  if (showResult.value) return true;
  const q = currentQuestion.value;
  if (!q) return false;
  if (["T01", "T02", "T05", "T07", "T08", "T12"].includes(q.type)) {
    return currentAnswer.value != null;
  }
  if (q.type === "T03") return Array.isArray(currentAnswer.value) && currentAnswer.value.length > 0;
  if (q.type === "T06") return Array.isArray(currentAnswer.value) && currentAnswer.value.length > 0;
  if (q.type === "T09" || q.type === "T10") {
    return String(currentAnswer.value ?? "").trim().length > 0;
  }
  return false;
});

const primaryLabel = computed(() => {
  if (!showResult.value) return t("path.check");
  if (index.value < questions.value.length - 1) return t("path.next");
  return t("path.finish");
});

const hintAvailable = computed(() => hasQuestionHint(currentQuestion.value));

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
      inReinforcement: false,
    })
  ) {
    return;
  }
  hintIdleTimer = setTimeout(() => revealHint({ auto: true }), HINT_IDLE_MS);
}

watch(
  [currentQuestion, hintShown, showResult, finished, currentAnswer],
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
  autoAdvanceTimer = setTimeout(() => {
    if (showResult.value && lastCorrect.value) {
      advanceAfterResult();
    }
  }, correctAutoAdvanceDelayMs());
}

onUnmounted(() => {
  clearHintIdleTimer();
  clearAutoAdvanceTimer();
});

function resetQuestion() {
  clearAutoAdvanceTimer();
  currentAnswer.value = null;
  showResult.value = false;
  lastCorrect.value = false;
  resetHint();
}

async function load() {
  loading.value = true;
  error.value = "";
  const typeId = String(route.params.typeId ?? "");
  if (!isValidFocusType(typeId)) {
    error.value = t("path.focusPracticeInvalidType");
    loading.value = false;
    return;
  }

  try {
    const ctx = await loadLearningContext();
    userId.value = ctx.user?.id ?? "";
    pairKey.value = pairStatsKey(ctx.nativeLang, ctx.targetLang);
    const session = await getFocusPractice(
      ctx.nativeLang,
      ctx.targetLang,
      ctx.cefr,
      typeId,
    );
    questionType.value = session?.question_type ?? typeId;
    questions.value = Array.isArray(session?.questions) ? session.questions : [];
    index.value = 0;
    correctCount.value = 0;
    finished.value = false;
    streakUpdate.value = null;
    continuing.value = false;
    resetQuestion();
  } catch (e) {
    error.value = e?.message || t("common.fail");
    questions.value = [];
  } finally {
    loading.value = false;
  }
}

function checkCurrentAnswer() {
  if (showResult.value || !currentQuestion.value) return;

  lastCorrect.value = checkAnswer(currentQuestion.value, currentAnswer.value);
  playAnswerFeedback(lastCorrect.value);
  if (currentQuestion.value?.type) {
    recordAnswer(pairKey.value, currentQuestion.value.type, lastCorrect.value);
  }
  showResult.value = true;
  if (lastCorrect.value) {
    scheduleAutoAdvance();
  }
}

async function advanceAfterResult() {
  clearAutoAdvanceTimer();

  if (lastCorrect.value) correctCount.value += 1;

  if (index.value < questions.value.length - 1) {
    index.value += 1;
    resetQuestion();
    return;
  }

  finished.value = true;
  streakUpdate.value = await applyReviewStreak(userId.value, questions.value.length);
}

async function onPrimaryAction() {
  if (!showResult.value) {
    checkCurrentAnswer();
    return;
  }

  await advanceAfterResult();
}

usePracticeEnterKey(
  () => ({
    showResult: showResult.value,
    question: currentQuestion.value,
    answer: currentAnswer.value,
    disabled:
      loading.value ||
      Boolean(error.value) ||
      finished.value ||
      !currentQuestion.value,
  }),
  onPrimaryAction,
);

watch(currentAnswer, (answer) => {
  if (
    !shouldAutoCheckOnAnswerChange(currentQuestion.value, answer, {
      showResult: showResult.value,
    })
  ) {
    return;
  }
  checkCurrentAnswer();
});

async function continuePractice() {
  continuing.value = true;
  try {
    await load();
  } finally {
    continuing.value = false;
  }
}

function exitPractice() {
  router.replace({ name: "learn" });
}

onMounted(load);
</script>

<style scoped>
.focus-practice-page {
  min-height: 100%;
  display: flex;
  flex-direction: column;
  background: var(--bg);
}

.review-header {
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

.progress-label {
  flex-shrink: 0;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-light);
}

.center-state,
.review-body,
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
  text-align: center;
}

.empty-emoji,
.summary-emoji {
  font-size: 48px;
}

.review-badge {
  margin: 0 0 8px;
  padding: 8px 12px;
  background: rgba(88, 204, 2, 0.12);
  color: var(--green-hover, #46a302);
  border-radius: var(--radius-sm);
  font-size: 13px;
  font-weight: 700;
  text-align: center;
}

.type-label {
  margin: 0 0 16px;
  font-size: 15px;
  font-weight: 700;
  text-align: center;
  color: var(--text);
}

.review-footer {
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
  color: var(--green);
}

.feedback.bad {
  color: var(--red);
}

.answer-reveal {
  margin: 0 0 12px;
  padding: 10px 12px;
  background: var(--gray-light);
  border-radius: var(--radius-sm);
  font-size: 14px;
  text-align: center;
  line-height: 1.45;
}

.near-miss-tip {
  margin: 0 0 10px;
  padding: 10px 12px;
  background: #eef6ff;
  border: 1.5px solid #6eb5ff;
  border-radius: var(--radius-sm);
  color: #1a5a9e;
  font-size: 14px;
  line-height: 1.45;
  text-align: center;
}

.summary {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  gap: 8px;
}

.summary h2 {
  margin: 0;
  font-size: 22px;
}

.summary-sub,
.summary-stat {
  margin: 0;
  color: var(--text-light);
  font-size: 15px;
  line-height: 1.45;
}

.summary-stat {
  font-weight: 700;
  color: var(--green);
}

.streak-banner {
  margin: 8px 0 0;
  padding: 10px 14px;
  background: var(--orange-bg);
  color: var(--orange-hover);
  border-radius: var(--radius-sm);
  font-weight: 700;
}

.continue-hint {
  margin: 4px 0 0;
  font-size: 14px;
  color: var(--text-light);
  line-height: 1.45;
}

.summary-actions {
  display: flex;
  flex-direction: column;
  gap: 10px;
  width: 100%;
  max-width: 320px;
  margin-top: 16px;
}

.action-btn {
  width: 100%;
  padding: 14px 16px;
  border: none;
  border-radius: var(--radius-md);
  font-size: 16px;
  font-weight: 700;
  cursor: pointer;
  font-family: inherit;
}

.action-btn.primary {
  background: var(--green);
  color: var(--white);
}

.action-btn.secondary {
  background: var(--gray-light);
  color: var(--text);
}
</style>