<template>
  <div class="lesson-page">
    <header class="lesson-header">
      <button class="close-btn" :aria-label="t('common.back')" @click="exitLesson">
        ✕
      </button>
      <div class="progress-track">
        <div class="progress-fill" :style="{ width: progressPct + '%' }" />
      </div>
    </header>

    <div v-if="loading" class="center-state">{{ t("path.loading") }}</div>
    <div v-else-if="error" class="center-state">
      <p>{{ error }}</p>
      <button class="action-btn secondary" @click="load">{{ t("common.retry") }}</button>
    </div>

    <template v-else-if="finished">
      <div class="summary">
        <div class="summary-emoji">{{ result?.passed ? "🎉" : "💪" }}</div>
        <h2>{{ result?.passed ? t("path.lessonPassed") : t("path.lessonFailed") }}</h2>
        <p class="summary-score">
          {{ t("path.score", { correct: correctCount, total: questions.length }) }}
        </p>
        <div v-if="result?.passed" class="summary-stars">
          {{ "⭐".repeat(result.stars) }}
        </div>
        <p v-if="result?.passed && result?.streak_extended" class="streak-banner">
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
                <p class="mistake-answer">
                  {{ t("path.correctAnswer", { answer: formatCorrectAnswer(item.question) }) }}
                </p>
              </div>
            </li>
          </ul>
        </section>
        <div class="summary-actions">
          <button class="action-btn secondary" @click="retryLesson">{{ t("path.retry") }}</button>
          <button class="action-btn primary" @click="finishLesson">
            {{ result?.passed ? t("path.continuePath") : t("path.backToPath") }}
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
        <p v-if="hintText" class="hint-text">{{ hintText }}</p>
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
import { computed, onMounted, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useI18n } from "@/shared/i18n";
import {
  completeSection,
  getSectionLesson,
} from "@/shared/api.js";
import { useTargetLangStore } from "@/stores/targetLang.js";
import { loadLearningContext } from "@/shared/learningContext.js";
import QuestionRenderer from "./components/QuestionRenderer.vue";
import { checkAnswer, formatCorrectAnswer, formatQuestionPrompt } from "./checkAnswer.js";
import { getQuestionHint, hasQuestionHint } from "./questionHint.js";
import {
  LESSON_PHASE_MAIN,
  LESSON_PHASE_REINFORCEMENT,
  buildReinforcementQueue,
  isLastReinforcementQuestion,
  reinforcementLabel as formatReinforcementLabel,
  shouldStartReinforcement,
} from "./lessonReinforcement.js";

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

function revealHint() {
  if (hintShown.value || !currentQuestion.value) return;
  const hint = getQuestionHint(currentQuestion.value, t);
  if (!hint) return;
  hintText.value = hint;
  hintShown.value = true;
}

function resetHint() {
  hintText.value = "";
  hintShown.value = false;
}

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
}

function startReinforcement() {
  phase.value = LESSON_PHASE_REINFORCEMENT;
  reinforcementQueue.value = buildReinforcementQueue(mistakes.value);
  reinforcementIndex.value = 0;
  currentAnswer.value = null;
  showResult.value = false;
  lastCorrect.value = false;
  resetHint();
}

function advanceQuestion() {
  currentAnswer.value = null;
  showResult.value = false;
  lastCorrect.value = false;
  resetHint();
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
  router.replace({ name: "path" });
}

function onPrimaryAction() {
  if (!showResult.value) {
    lastCorrect.value = checkAnswer(currentQuestion.value, currentAnswer.value);
    if (lastCorrect.value) {
      correctCount.value += 1;
    } else if (!inReinforcement.value) {
      mistakes.value.push({
        question: currentQuestion.value,
        answer: currentAnswer.value,
      });
    }
    showResult.value = true;
    return;
  }

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

async function submitLesson() {
  try {
    const res = await completeSection(
      userMeta.value.nativeLang,
      userMeta.value.targetLang,
      userMeta.value.cefr,
      route.params.sectionId,
      correctCount.value,
      questions.value.length,
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

.daily-goal-banner {
  margin: 8px 0 0;
  padding: 12px 16px;
  background: var(--green-bg);
  color: var(--green-hover);
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

.mistake-answer {
  margin: 0;
  font-size: 13px;
  color: var(--green-hover);
  line-height: 1.4;
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