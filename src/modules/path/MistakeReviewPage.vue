<template>
  <div class="mistake-review-page">
    <header class="review-header">
      <button type="button" class="close-btn" :aria-label="t('common.back')" @click="exitReview">
        ✕
      </button>
      <div v-if="!finished && queue.length" class="progress-track">
        <div class="progress-fill" :style="{ width: progressPct + '%' }" />
      </div>
      <span v-if="!finished && queue.length" class="progress-label">
        {{ t("path.mistakeReviewProgress", { current: progressCurrent, total: queue.length }) }}
      </span>
    </header>

    <div v-if="loading" class="center-state">{{ t("path.loading") }}</div>

    <div v-else-if="error" class="center-state">
      <p>{{ error }}</p>
      <button type="button" class="action-btn secondary" @click="load">{{ t("common.retry") }}</button>
    </div>

    <div v-else-if="!queue.length" class="center-state">
      <span class="empty-emoji" aria-hidden="true">✨</span>
      <p>{{ t("path.mistakeReviewAllCaughtUp") }}</p>
      <button type="button" class="action-btn primary" @click="exitReview">
        {{ t("path.mistakeReviewBack") }}
      </button>
    </div>

    <div v-else-if="finished" class="summary">
      <div class="summary-emoji" aria-hidden="true">🎯</div>
      <h2>{{ t("path.mistakeReviewComplete") }}</h2>
      <p class="summary-sub">{{ t("path.mistakeReviewCompleteHint", { n: sessionTotal }) }}</p>
      <p v-if="masteredCount" class="summary-stat">
        {{ t("path.mistakeReviewMasteredCount", { n: masteredCount }) }}
      </p>
      <p v-if="streakCelebration" class="streak-banner">{{ streakCelebration }}</p>
      <p v-if="mistakeMilestoneBanner" class="mistake-milestone-banner">{{ mistakeMilestoneBanner }}</p>
      <p v-if="showContinueReview" class="continue-hint">{{ t("path.mistakeReviewContinueHint") }}</p>
      <div class="summary-actions">
        <button
          v-if="showContinueReview"
          type="button"
          class="action-btn primary"
          :disabled="continuing"
          @click="continueReview"
        >
          {{ continueReviewLabel }}
        </button>
        <button
          type="button"
          class="action-btn"
          :class="showContinueReview ? 'secondary' : 'primary'"
          @click="exitReview"
        >
          {{ t("path.mistakeReviewBack") }}
        </button>
      </div>
    </div>

    <template v-else-if="currentQuestion">
      <div class="review-body">
        <p class="review-badge">{{ t("path.mistakeReviewBadge") }}</p>
        <p v-if="previousWrongAnswerText" class="previous-wrong">
          {{ t("path.mistakeReviewPreviousAnswer", { answer: previousWrongAnswerText }) }}
        </p>
        <QuestionRenderer
          :question="currentQuestion"
          v-model:answer="currentAnswer"
          :show-result="showResult"
          :is-correct="lastCorrect"
        />
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
import { useRouter } from "vue-router";
import { useI18n } from "@/shared/i18n";
import { loadLearningContext } from "@/shared/learningContext.js";
import { applyReviewStreak, reviewStreakCelebration } from "@/shared/reviewStreak.js";
import {
  MISTAKE_MILESTONE_CELEBRATION_KEY,
  mistakeMilestoneReached,
} from "@/modules/learn/mistakeMilestones.js";
import { pairStatsKey } from "@/modules/learn/questionTypeStats.js";
import { playAnswerFeedback } from "@/shared/lessonFeedback.js";
import { getQuestionHint, hasQuestionHint } from "./questionHint.js";
import { HINT_IDLE_MS, shouldScheduleAutoHint } from "./questionHintTimer.js";
import { recordMistakesMastered } from "./mistakeMasteryStats.js";
import QuestionRenderer from "./components/QuestionRenderer.vue";
import { checkAnswer, formatCorrectAnswer, formatUserAnswer } from "./checkAnswer.js";
import {
  applyReviewResult,
  loadDueMistakes,
  loadMistakeQueue,
  saveMistakeQueue,
} from "./mistakeReviewStore.js";
import {
  REMAINING_PEEK_LIMIT,
  mistakeContinueLabelKey,
  remainingMistakeReviewCount,
  shouldOfferMistakeContinuation,
} from "./mistakeReviewContinuation.js";

const router = useRouter();
const { t } = useI18n();

const loading = ref(true);
const error = ref("");
const queue = ref([]);
const index = ref(0);
const currentAnswer = ref(null);
const showResult = ref(false);
const lastCorrect = ref(false);
const finished = ref(false);
const masteredCount = ref(0);
const sessionTotal = ref(0);
const pairKey = ref("");
const userId = ref("");
const streakUpdate = ref(null);
const remainingDue = ref(0);
const checkingRemaining = ref(false);
const continuing = ref(false);
const hintText = ref("");
const hintShown = ref(false);
const hintAutoRevealed = ref(false);
let hintIdleTimer = null;

const currentEntry = computed(() => queue.value[index.value] ?? null);
const currentQuestion = computed(() => currentEntry.value?.question ?? null);

const progressCurrent = computed(() => Math.min(index.value + 1, queue.value.length || 1));

const progressPct = computed(() => {
  if (!queue.value.length) return 0;
  return Math.round((progressCurrent.value / queue.value.length) * 100);
});

const streakCelebration = computed(() =>
  reviewStreakCelebration(streakUpdate.value, t),
);

const masteredBefore = ref(0);

const mistakeMilestoneBanner = computed(() => {
  if (!finished.value || masteredCount.value <= 0) return "";
  const milestone = mistakeMilestoneReached(
    masteredBefore.value,
    masteredBefore.value + masteredCount.value,
  );
  if (!milestone) return "";
  return t(MISTAKE_MILESTONE_CELEBRATION_KEY, { n: milestone });
});

const showContinueReview = computed(
  () => !checkingRemaining.value && shouldOfferMistakeContinuation(remainingDue.value),
);

const continueReviewLabel = computed(() => {
  const key = mistakeContinueLabelKey(remainingDue.value);
  const n =
    remainingDue.value >= REMAINING_PEEK_LIMIT
      ? REMAINING_PEEK_LIMIT
      : remainingDue.value;
  return t(key, { n });
});

const correctAnswerText = computed(() =>
  currentQuestion.value ? formatCorrectAnswer(currentQuestion.value) : "",
);

const previousWrongAnswerText = computed(() => {
  const q = currentQuestion.value;
  if (!q) return "";
  return formatUserAnswer(q, currentEntry.value?.user_answer);
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
  if (index.value < queue.value.length - 1) return t("path.next");
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

onUnmounted(() => {
  clearHintIdleTimer();
});

async function load() {
  loading.value = true;
  error.value = "";
  try {
    const ctx = await loadLearningContext();
    userId.value = ctx.user?.id ?? "";
    pairKey.value = pairStatsKey(ctx.nativeLang, ctx.targetLang);
    queue.value = loadDueMistakes(pairKey.value);
    sessionTotal.value = queue.value.length;
    index.value = 0;
    resetQuestion();
    finished.value = false;
    masteredCount.value = 0;
    masteredBefore.value = 0;
    streakUpdate.value = null;
    remainingDue.value = 0;
    checkingRemaining.value = false;
    continuing.value = false;
  } catch (e) {
    error.value = e?.message || String(e);
  } finally {
    loading.value = false;
  }
}

function resetQuestion() {
  currentAnswer.value = null;
  showResult.value = false;
  lastCorrect.value = false;
  resetHint();
}

function persistReviewResult(isCorrect) {
  const questionId = currentEntry.value?.question_id;
  if (!questionId) return;

  const all = loadMistakeQueue();
  const next = applyReviewResult(
    all,
    questionId,
    isCorrect,
    Date.now(),
    isCorrect ? undefined : currentAnswer.value,
  );
  saveMistakeQueue(next);

  if (isCorrect) {
    const prev = all.find((e) => e.question_id === questionId);
    const updated = next.find((e) => e.question_id === questionId);
    if (prev && !updated) masteredCount.value += 1;
  }
}

async function onPrimaryAction() {
  if (!showResult.value) {
    lastCorrect.value = checkAnswer(currentQuestion.value, currentAnswer.value);
    playAnswerFeedback(lastCorrect.value);
    showResult.value = true;
    return;
  }

  persistReviewResult(lastCorrect.value);

  if (index.value < queue.value.length - 1) {
    index.value += 1;
    resetQuestion();
    return;
  }

  finished.value = true;
  if (masteredCount.value > 0) {
    const { prev } = recordMistakesMastered(pairKey.value, masteredCount.value);
    masteredBefore.value = prev;
  }
  streakUpdate.value = await applyReviewStreak(userId.value, sessionTotal.value);
  await refreshRemainingDue();
}

function refreshRemainingDue() {
  if (!pairKey.value) {
    remainingDue.value = 0;
    return;
  }
  checkingRemaining.value = true;
  try {
    const peeked = loadDueMistakes(pairKey.value, { limit: REMAINING_PEEK_LIMIT });
    remainingDue.value = remainingMistakeReviewCount(peeked);
  } catch {
    remainingDue.value = 0;
  } finally {
    checkingRemaining.value = false;
  }
}

async function continueReview() {
  continuing.value = true;
  try {
    await load();
  } finally {
    continuing.value = false;
  }
}

function exitReview() {
  router.replace({ name: "learn" });
}

onMounted(load);
</script>

<style scoped>
.mistake-review-page {
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
  background: var(--orange);
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
  margin: 0 0 12px;
  padding: 8px 12px;
  background: var(--orange-bg);
  color: var(--orange-hover);
  border-radius: var(--radius-sm);
  font-size: 13px;
  font-weight: 700;
  text-align: center;
}

.previous-wrong {
  margin: 0 0 16px;
  padding: 10px 14px;
  background: var(--red-bg);
  color: var(--red);
  border-radius: var(--radius-sm);
  font-size: 14px;
  font-weight: 600;
  text-align: center;
  line-height: 1.4;
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
  color: var(--green-hover);
}

.feedback.bad {
  color: var(--red);
}

.answer-reveal {
  margin: 0 0 12px;
  font-size: 14px;
  color: var(--text-light);
  text-align: center;
  line-height: 1.4;
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
  color: var(--green-hover);
  font-weight: 600;
}

.streak-banner {
  margin: 4px 0 0;
  padding: 12px 16px;
  background: var(--orange-bg);
  color: var(--orange-hover);
  border-radius: var(--radius-md);
  font-weight: 700;
}

.mistake-milestone-banner {
  margin: 4px 0 0;
  padding: 12px 16px;
  background: rgba(230, 120, 90, 0.12);
  color: #c45a3a;
  border-radius: var(--radius-md);
  font-weight: 700;
}

.continue-hint {
  margin: 4px 0 0;
  font-size: 14px;
  color: var(--text-light);
  line-height: 1.45;
}

.summary-actions {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-top: 8px;
}

.action-btn {
  width: 100%;
  padding: 14px 18px;
  border: none;
  border-radius: var(--radius-md);
  font-size: 16px;
  font-weight: 700;
  cursor: pointer;
}

.action-btn.primary {
  background: var(--green);
  color: var(--white);
}

.action-btn.secondary {
  background: var(--gray-light);
  color: var(--text);
}

.action-btn:disabled {
  opacity: 0.5;
  cursor: default;
}
</style>