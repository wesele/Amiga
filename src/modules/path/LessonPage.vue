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
        <p v-if="result?.level_upgraded" class="level-up-banner">
          🎓 {{ t("path.levelUp", { level: result.new_cefr_level }) }}
        </p>
        <p v-if="!result?.passed" class="retry-hint">{{ t("path.unlimitedRetry") }}</p>
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
        <p class="section-label">{{ lesson?.section_title_native }}</p>
        <QuestionRenderer
          :key="index"
          :question="currentQuestion"
          v-model:answer="currentAnswer"
          :show-result="showResult"
          :is-correct="lastCorrect"
        />
      </div>

      <footer class="lesson-footer">
        <p v-if="showResult" class="feedback" :class="lastCorrect ? 'ok' : 'bad'">
          {{ lastCorrect ? t("path.correct") : t("path.incorrect") }}
          <span v-if="!lastCorrect && correctAnswerText" class="correct-answer">
            {{ t("path.correctAnswer", { answer: correctAnswerText }) }}
          </span>
        </p>
        <button
          class="action-btn primary"
          :disabled="!canCheck"
          @click="onPrimaryAction"
        >
          {{ checking ? t("path.checking") : primaryLabel }}
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
} from "@/shared/backend/path.js";
import { useTargetLangStore } from "@/stores/targetLang.js";
import { loadLearningContext } from "@/shared/learningContext.js";
import QuestionRenderer from "./components/QuestionRenderer.vue";
import { checkAnswer, checkAnswerAsync } from "./checkAnswer.js";

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
const checking = ref(false);

const userMeta = ref({ nativeLang: "zh", targetLang: "es", cefr: "A1" });

const currentQuestion = computed(() => questions.value[index.value] || null);
const progressPct = computed(() => {
  if (!questions.value.length) return 0;
  if (finished.value) return 100;
  return Math.round((index.value / questions.value.length) * 100);
});

const canCheck = computed(() => {
  if (checking.value) return false;
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

const primaryLabel = computed(() => {
  if (showResult.value) {
    return index.value >= questions.value.length - 1
      ? t("path.finish")
      : t("path.next");
  }
  return t("path.check");
});

const correctAnswerText = computed(() => {
  const q = currentQuestion.value;
  if (!q) return "";
  if (q.type === "T10") {
    return q.acceptedAnswers?.[0] || q.answer || "";
  }
  if (q.type === "T09") {
    return q.answer || "";
  }
  return "";
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

function goToNextQuestion() {
  if (index.value < questions.value.length - 1) {
    index.value += 1;
    currentAnswer.value = null;
    showResult.value = false;
    lastCorrect.value = false;
    return;
  }

  submitLesson();
}

async function onPrimaryAction() {
  if (!showResult.value) {
    checking.value = true;
    try {
      lastCorrect.value = await checkAnswerAsync(
        currentQuestion.value,
        currentAnswer.value,
        userMeta.value.targetLang
      );
      if (lastCorrect.value) correctCount.value += 1;
      if (lastCorrect.value) {
        goToNextQuestion();
        return;
      }
      showResult.value = true;
    } catch (e) {
      console.error(e);
      lastCorrect.value = checkAnswer(currentQuestion.value, currentAnswer.value);
      if (lastCorrect.value) correctCount.value += 1;
      if (lastCorrect.value) {
        goToNextQuestion();
        return;
      }
      showResult.value = true;
    } finally {
      checking.value = false;
    }
    return;
  }

  goToNextQuestion();
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
  background: linear-gradient(180deg, #ffffff 0%, var(--bg) 220px);
}

.lesson-header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px 10px;
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
  padding: 22px 20px;
}

.lesson-body {
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
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
  margin: 0 0 14px;
  font-size: 13px;
  color: var(--text-light);
  font-weight: 800;
  letter-spacing: 0;
}

.lesson-footer {
  padding: 14px 20px calc(16px + var(--safe-bottom));
  background: var(--white);
  border-top: 1px solid var(--border);
  box-shadow: 0 -8px 24px rgba(0, 0, 0, 0.04);
}

.feedback {
  display: flex;
  flex-direction: column;
  gap: 4px;
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

.correct-answer {
  color: var(--text);
  font-size: 14px;
  font-weight: 600;
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

.summary-actions {
  display: flex;
  flex-direction: column;
  gap: 10px;
  width: 100%;
  max-width: 320px;
  margin-top: 16px;
}
</style>
