<template>
  <div class="reading-test">
    <header class="test-header">
      <button class="back-btn" @click="goBack">
        <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor">
          <path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/>
        </svg>
      </button>
      <div class="header-info">
        <div class="header-title">{{ t('reading.test') }}</div>
      </div>
    </header>

    <div v-if="loading" class="loading-center">
      <div class="spinner" />
      <p>{{ t('common.loading') }}</p>
    </div>

    <div v-else-if="error" class="error-container">
      <p class="error-text">{{ error }}</p>
      <button class="btn-secondary" @click="loadTest">{{ t('reading.retry') }}</button>
    </div>

    <div v-else class="question-stage">
      <div v-if="currentQuestion" class="question-card" :class="{ answered: answers[currentQuestionIndex] !== undefined }">
        <div class="question-toolbar">
          <div class="question-number">{{ currentQuestionIndex + 1 }}</div>
          <div class="question-progress">{{ currentQuestionIndex + 1 }}/{{ questions.length }}</div>
        </div>

        <div v-if="isListeningQuestion" class="audio-panel">
          <button
            type="button"
            class="audio-btn"
            :disabled="audioBusy"
            @click="playAudio"
          >
            <span class="audio-icon" aria-hidden="true">♪</span>
            <span>{{ t('path.playAudio') }}</span>
          </button>
        </div>

        <p class="question-text">{{ questionPrompt }}</p>

        <div class="options">
          <button
            v-for="(opt, oi) in currentQuestion.options"
            :key="oi"
            class="option-btn"
            :class="optionClass(currentQuestionIndex, oi)"
            :disabled="answers[currentQuestionIndex] !== undefined"
            @click="selectAnswer(currentQuestionIndex, oi)"
          >
            <span class="option-key">{{ optionLabels[oi] }}</span>
            <span class="option-text">{{ opt }}</span>
            <span v-if="answers[currentQuestionIndex] !== undefined && oi === currentQuestion.correct_index" class="option-mark correct-mark">✓</span>
            <span v-else-if="answers[currentQuestionIndex] === oi && oi !== currentQuestion.correct_index" class="option-mark wrong-mark">×</span>
          </button>
        </div>

        <div v-if="isCurrentAnswerWrong" class="answer-feedback">
          <span>{{ t('reading.wrong') }}</span>
          <button class="retry-answer-btn" @click="retryQuestion(currentQuestionIndex)">
            {{ t('reading.retry') }}
          </button>
        </div>

        <div v-if="isCurrentAnswerWrong && loadingExplanation[currentQuestionIndex]" class="explanation-loading">
          <div class="spinner-small" />
          <span>{{ t('reading.loadingExplanation') }}</span>
        </div>

        <div v-else-if="isCurrentAnswerWrong && explanationErrors[currentQuestionIndex]" class="explanation-box explanation-error-box">
          <div class="explanation-header">{{ t('reading.explanation') }}</div>
          <p class="explanation-text">{{ explanations[currentQuestionIndex] || t('reading.generateFail') }}</p>
          <button class="retry-link" @click="retryExplanation(currentQuestionIndex)">{{ t('reading.retry') }}</button>
        </div>

        <div v-else-if="isCurrentAnswerWrong && explanations[currentQuestionIndex]" class="explanation-box">
          <div class="explanation-header">{{ t('reading.explanation') }}</div>
          <p class="explanation-text">{{ explanations[currentQuestionIndex] }}</p>
        </div>
      </div>

      <div v-if="currentQuestion" class="bottom-bar">
        <button class="btn-secondary nav-btn" :disabled="currentQuestionIndex === 0" @click="goPrev">
          {{ t('common.previous') }}
        </button>
        <button v-if="!isLastQuestion" class="btn-submit nav-btn" @click="goNext">
          {{ t('reading.next') }}
        </button>
        <button v-else class="btn-submit nav-btn" :disabled="submitting || !allAnswered" @click="submitTest">
          {{ t('reading.submitTest') }}
        </button>
      </div>

      <div v-else class="error-container">
        <p class="error-text">{{ t('reading.generatingFail') }}</p>
        <button class="btn-secondary" @click="loadTest">{{ t('reading.retry') }}</button>
      </div>
    </div>

    <Transition name="popup">
      <div v-if="submitted" class="result-toast">
        {{ t('reading.testScore') }}: {{ correctCount }}/{{ questions.length }}
      </div>
    </Transition>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from "vue";
import { useRouter } from "vue-router";
import { useI18n } from "@/shared/i18n";
import { useTargetLangStore } from "@/stores/targetLang.js";
import {
  getOrGenerateReadingTest,
  explainReadingAnswer,
  submitReadingTest,
  getReadingTestExplanations,
} from "@/shared/backend/reading.js";
import { loadLearningContext } from "@/shared/learningContext.js";
import { normalizeQuestions, optionLabels, readingOptionClass } from "./readingTestQuestions.js";
import { useListeningQuestionAudio } from "./useListeningQuestionAudio.js";

const { t } = useI18n();
const router = useRouter();
const targetLangStore = useTargetLangStore();
const props = defineProps({ id: [String, Number] });

const questions = ref([]);
const answers = ref({});
const explanations = ref({});
const loadingExplanation = ref({});
const explanationErrors = ref({});
const loading = ref(true);
const error = ref("");
const submitting = ref(false);
const submitted = ref(false);
const correctCount = ref(0);
const currentQuestionIndex = ref(0);

let userId = "";
let targetLang = "";
let cefrLevel = "";
let nativeLang = "";

const answeredCount = computed(() => Object.keys(answers.value).length);
const allAnswered = computed(() => questions.value.length > 0 && answeredCount.value === questions.value.length);
const currentQuestion = computed(() => questions.value[currentQuestionIndex.value] || null);
const isListeningQuestion = computed(() => currentQuestion.value?.question_type === "listening");
const questionPrompt = computed(() => {
  const question = currentQuestion.value;
  if (!question) return "";
  if (isListeningQuestion.value) {
    return question.question || t("path.listenChoose");
  }
  return question.question;
});
const isLastQuestion = computed(() => currentQuestionIndex.value === questions.value.length - 1);
const isCurrentAnswerWrong = computed(() => {
  const answer = answers.value[currentQuestionIndex.value];
  const question = currentQuestion.value;
  return question && answer !== undefined && answer !== question.correct_index;
});

const { audioBusy, playAudio, stopAudio } = useListeningQuestionAudio({
  currentQuestion,
  currentQuestionIndex,
  getTargetLang: () => targetLang,
});

onMounted(async () => {
  await loadTest();
});

function optionClass(qi, oi) {
  return readingOptionClass(questions.value[qi], answers.value[qi], oi);
}

async function loadTest() {
  loading.value = true;
  error.value = "";
  submitted.value = false;
  correctCount.value = 0;
  answers.value = {};
  explanations.value = {};
  loadingExplanation.value = {};
  explanationErrors.value = {};
  currentQuestionIndex.value = 0;
  try {
    const ctx = await loadLearningContext({ targetLangStore, fallbackToFirstGoal: true });
    targetLang = ctx.targetLang;
    cefrLevel = ctx.cefr;
    nativeLang = ctx.nativeLang;
    userId = ctx.user?.id || "";

    const rawQuestions = await getOrGenerateReadingTest(Number(props.id), targetLang, cefrLevel);
    questions.value = normalizeQuestions(rawQuestions);
    if (questions.value.length === 0) {
      throw new Error(t("reading.generatingFail"));
    }

    try {
      const cached = await getReadingTestExplanations(Number(props.id));
      cached.forEach((exp, i) => {
        if (exp) explanations.value[i] = exp;
      });
    } catch (e) {
      // ignore cached explanation load errors
    }
  } catch (e) {
    console.error("Failed to load test:", e);
    error.value = e?.message || String(e);
  } finally {
    loading.value = false;
  }
}

function goPrev() {
  if (currentQuestionIndex.value > 0) currentQuestionIndex.value -= 1;
}

function goNext() {
  if (currentQuestionIndex.value < questions.value.length - 1) currentQuestionIndex.value += 1;
}

async function selectAnswer(qi, oi) {
  if (answers.value[qi] !== undefined) return;

  answers.value = { ...answers.value, [qi]: oi };

  const q = questions.value[qi];
  if (oi !== q.correct_index) {
    loadingExplanation.value = { ...loadingExplanation.value, [qi]: true };
    explanationErrors.value = { ...explanationErrors.value, [qi]: false };
    try {
      await generateExplanation(qi);
    } catch (e) {
      console.error("Failed to get explanation:", e);
      explanations.value = { ...explanations.value, [qi]: t("reading.generateFail") };
      explanationErrors.value = { ...explanationErrors.value, [qi]: true };
    } finally {
      loadingExplanation.value = { ...loadingExplanation.value, [qi]: false };
    }
  }
}

async function retryExplanation(qi) {
  if (loadingExplanation.value[qi]) return;
  loadingExplanation.value = { ...loadingExplanation.value, [qi]: true };
  explanationErrors.value = { ...explanationErrors.value, [qi]: false };
  try {
    await generateExplanation(qi);
  } catch (e) {
    console.error("Failed to retry explanation:", e);
    explanations.value = { ...explanations.value, [qi]: t("reading.generateFail") };
    explanationErrors.value = { ...explanationErrors.value, [qi]: true };
  } finally {
    loadingExplanation.value = { ...loadingExplanation.value, [qi]: false };
  }
}

function retryQuestion(qi) {
  const nextAnswers = { ...answers.value };
  delete nextAnswers[qi];
  answers.value = nextAnswers;

  const nextExplanations = { ...explanations.value };
  delete nextExplanations[qi];
  explanations.value = nextExplanations;

  const nextLoading = { ...loadingExplanation.value };
  delete nextLoading[qi];
  loadingExplanation.value = nextLoading;

  const nextErrors = { ...explanationErrors.value };
  delete nextErrors[qi];
  explanationErrors.value = nextErrors;
}

async function generateExplanation(qi) {
  const q = questions.value[qi];
  const answer = answers.value[qi];
  const userAnswerText = q.options[answer];
  const correctAnswerText = q.options[q.correct_index];
  const questionJson = JSON.stringify(q);
  const exp = await explainReadingAnswer(
    Number(props.id), qi, questionJson,
    userAnswerText, correctAnswerText,
    targetLang, nativeLang,
  );
  explanations.value = { ...explanations.value, [qi]: exp };
  explanationErrors.value = { ...explanationErrors.value, [qi]: false };
}

async function submitTest() {
  if (submitting.value) return;
  submitting.value = true;

  let correct = 0;
  questions.value.forEach((q, qi) => {
    if (answers.value[qi] === q.correct_index) correct++;
  });
  correctCount.value = correct;

  try {
    await submitReadingTest(
      Number(props.id), userId,
      JSON.stringify(answers.value),
      correct, questions.value.length,
    );
    submitted.value = true;
    setTimeout(() => {
      router.push("/learn/reading");
    }, 2000);
  } catch (e) {
    console.error("Failed to submit test:", e);
    error.value = e?.message || String(e);
  } finally {
    submitting.value = false;
  }
}

function goBack() {
  stopAudio();
  router.push(`/learn/reading/${props.id}`);
}
</script>

<style scoped>
.reading-test {
  display: flex;
  flex-direction: column;
  min-height: 100%;
  background: var(--bg);
}

.test-header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  background: var(--white);
  border-bottom: 1px solid var(--border);
}

.back-btn {
  flex-shrink: 0;
  width: 36px;
  height: 36px;
  border: none;
  background: transparent;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  color: var(--text-light);
}

.back-btn:hover {
  background: var(--surface-variant);
}

.header-info {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.header-title {
  font-size: 16px;
  font-weight: 700;
}

.audio-panel {
  display: flex;
  justify-content: center;
  margin-bottom: 16px;
}

.audio-btn {
  min-height: 52px;
  padding: 0 20px;
  border: 2px solid #84d8ff;
  border-radius: 999px;
  background: var(--blue-bg);
  color: var(--blue-hover);
  font-size: 16px;
  font-weight: 800;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  box-shadow: 0 4px 0 #b9e9ff;
  font-family: inherit;
}

.audio-btn:disabled {
  opacity: 0.6;
  cursor: wait;
}

.audio-icon {
  font-size: 18px;
  line-height: 1;
}

.loading-center,
.error-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 48px 16px;
  gap: 12px;
  color: var(--text-lighter);
}

.error-text {
  text-align: center;
  font-size: 14px;
}

.spinner {
  width: 24px;
  height: 24px;
  border: 3px solid var(--border);
  border-top-color: var(--green);
  border-radius: 50%;
  animation: spin 0.6s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.question-stage {
  flex: 1;
  display: flex;
  flex-direction: column;
  padding: 18px 16px 104px;
}

.question-card {
  background: var(--white);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  padding: 18px 16px 20px;
}

.question-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 16px;
}

.question-number {
  display: inline-block;
  width: 24px;
  height: 24px;
  background: var(--green-bg);
  color: var(--green);
  border-radius: 50%;
  text-align: center;
  font-size: 12px;
  font-weight: 700;
  line-height: 24px;
}

.question-progress {
  font-size: 12px;
  color: var(--text-lighter);
  font-weight: 600;
}

.question-text {
  margin: 0 0 18px;
  font-size: 15px;
  font-weight: 600;
  line-height: 1.55;
  color: var(--text);
}

.options {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.option-btn {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  min-height: 52px;
  padding: 12px 14px;
  border: 1px solid var(--border);
  background: var(--white);
  border-radius: var(--radius-sm);
  cursor: pointer;
  text-align: left;
  font-family: inherit;
  font-size: 14px;
  line-height: 1.4;
  transition: background var(--transition), border-color var(--transition);
}

.option-btn:hover:not(:disabled) {
  background: var(--surface-variant);
}

.option-btn:disabled {
  cursor: default;
}

.option-btn.correct {
  border-color: var(--green);
  background: var(--green-bg);
}

.option-btn.wrong {
  border-color: #dc3545;
  background: #fff5f5;
}

.option-btn.dimmed {
  opacity: 0.5;
}

.option-key {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: var(--surface-variant);
  text-align: center;
  font-size: 12px;
  font-weight: 700;
  line-height: 24px;
  flex-shrink: 0;
  color: var(--text-light);
}

.option-text {
  flex: 1;
}

.option-mark {
  font-size: 16px;
  font-weight: 700;
}

.correct-mark {
  color: var(--green);
}

.wrong-mark {
  color: #dc3545;
}

.answer-feedback {
  margin-top: 16px;
  padding: 12px 14px;
  border: 1px solid #ffc9c9;
  border-radius: var(--radius-sm);
  background: #fff5f5;
  color: #b42318;
  font-size: 13px;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.retry-answer-btn {
  flex-shrink: 0;
  border: none;
  border-radius: var(--radius-sm);
  background: #dc3545;
  color: #fff;
  padding: 7px 12px;
  font-family: inherit;
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
}

.explanation-box {
  margin-top: 16px;
  padding: 14px;
  background: #fff8e1;
  border: 1px solid #ffe082;
  border-radius: var(--radius-sm);
}

.explanation-error-box {
  border-color: #ffd49d;
}

.explanation-header {
  font-size: 12px;
  font-weight: 700;
  color: #856404;
  margin-bottom: 8px;
}

.explanation-text {
  margin: 0;
  font-size: 13px;
  line-height: 1.6;
  color: #5a4a00;
}

.retry-link {
  margin-top: 8px;
  padding: 0;
  border: none;
  background: transparent;
  color: var(--green);
  font-weight: 700;
  cursor: pointer;
}

.explanation-loading {
  margin-top: 16px;
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: var(--text-lighter);
}

.spinner-small {
  width: 14px;
  height: 14px;
  border: 2px solid var(--border);
  border-top-color: var(--green);
  border-radius: 50%;
  animation: spin 0.6s linear infinite;
}

.bottom-bar {
  position: sticky;
  bottom: 0;
  display: flex;
  gap: 12px;
  width: 100%;
  box-sizing: border-box;
  padding: 14px 16px 16px;
}

.nav-btn {
  flex: 1 1 0;
  min-width: 0;
  min-height: 48px;
}

.btn-submit {
  min-height: 48px;
  padding: 13px 16px;
  border: none;
  background: var(--green);
  color: var(--white);
  border-radius: var(--radius-md);
  font-size: 15px;
  font-weight: 700;
  cursor: pointer;
}

.btn-submit:disabled {
  opacity: 0.5;
  cursor: wait;
}

.result-toast {
  position: fixed;
  top: 20%;
  left: 50%;
  transform: translateX(-50%);
  background: var(--green);
  color: var(--white);
  padding: 12px 24px;
  border-radius: var(--radius-md);
  font-weight: 700;
  font-size: 16px;
  box-shadow: 0 4px 12px rgba(0,0,0,0.15);
  z-index: 100;
}

.popup-enter-active,
.popup-leave-active {
  transition: opacity 0.3s, transform 0.3s;
}

.popup-enter-from,
.popup-leave-to {
  opacity: 0;
  transform: translateX(-50%) translateY(10px);
}

.btn-secondary {
  padding: 10px 20px;
  border: 1px solid var(--border);
  background: var(--white);
  border-radius: var(--radius-md);
  font-weight: 600;
  color: var(--text);
  cursor: pointer;
}
</style>
