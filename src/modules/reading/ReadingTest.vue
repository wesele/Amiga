<template>
  <div class="reading-test" :class="{ 'tv-content-pane tv-content-pane--fixed': isTvMode }">
    <header class="test-header">
      <button class="back-btn" type="button" :tabindex="isTvMode ? -1 : undefined" @click="goBack">
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

    <div v-else-if="!submitted" class="question-stage">
      <div v-if="currentQuestion" class="question-card" :class="{ answered: isCurrentAnswered }">
        <div class="question-toolbar">
          <div class="question-number">{{ currentQuestionIndex + 1 }}</div>
          <div class="question-progress">{{ currentQuestionIndex + 1 }}/{{ questions.length }}</div>
        </div>

        <div v-if="isListeningQuestion" class="audio-panel">
          <button
            type="button"
            class="audio-btn"
            data-tv-preferred-focus
            :disabled="audioBusy"
            @click="playAudio"
          >
            <span class="audio-icon" aria-hidden="true">♪</span>
            <span>{{ t('path.playAudio') }}</span>
          </button>
        </div>

        <p v-if="!isListeningQuestion" class="question-text">{{ questionPrompt }}</p>
        <p v-else class="question-text listening-hint">{{ questionPrompt }}</p>

        <div class="options" role="listbox" :aria-label="t('reading.test')">
          <button
            v-for="(opt, oi) in currentQuestion.options"
            :key="`${currentQuestionIndex}-${oi}`"
            type="button"
            class="option-btn"
            :class="optionClass(currentQuestionIndex, oi)"
            :data-tv-preferred-focus="!isListeningQuestion && oi === 0 ? true : undefined"
            :aria-disabled="isCurrentAnswered ? 'true' : undefined"
            :disabled="optionsHardDisabled"
            @click="selectAnswer(currentQuestionIndex, oi)"
          >
            <span class="option-key">{{ optionLabels[oi] }}</span>
            <span class="option-text">{{ opt }}</span>
            <span v-if="isCurrentAnswered && oi === currentQuestion.correct_index" class="option-mark correct-mark">✓</span>
            <span v-else-if="answers[currentQuestionIndex] === oi && oi !== currentQuestion.correct_index" class="option-mark wrong-mark">×</span>
          </button>
        </div>

        <div v-if="isCurrentAnswerWrong" class="answer-feedback">
          <span>{{ t('reading.wrong') }}</span>
        </div>

        <div v-if="isCurrentAnswerWrong && loadingExplanation[currentQuestionIndex]" class="explanation-loading">
          <div class="spinner-small" />
          <span>{{ t('reading.loadingExplanation') }}</span>
        </div>

        <div v-else-if="isCurrentAnswerWrong && explanationErrors[currentQuestionIndex]" class="explanation-box explanation-error-box">
          <div class="explanation-header">{{ t('reading.explanation') }}</div>
          <p class="explanation-text">{{ explanations[currentQuestionIndex] || t('reading.generateFail') }}</p>
          <button type="button" class="retry-link" @click="retryExplanation(currentQuestionIndex)">{{ t('reading.retry') }}</button>
        </div>

        <div v-else-if="isCurrentAnswerWrong && explanations[currentQuestionIndex]" class="explanation-box">
          <div class="explanation-header">{{ t('reading.explanation') }}</div>
          <p class="explanation-text">{{ explanations[currentQuestionIndex] }}</p>
        </div>
      </div>

      <div v-if="currentQuestion" class="bottom-bar">
        <button
          type="button"
          class="btn-secondary test-nav-btn"
          :disabled="currentQuestionIndex === 0"
          @click="goPrev"
        >
          {{ t('common.previous') }}
        </button>
        <button
          v-if="!isLastQuestion"
          ref="primaryNavBtn"
          type="button"
          class="btn-submit test-nav-btn"
          @click="goNext"
        >
          {{ t('reading.next') }}
        </button>
        <button
          v-else
          ref="primaryNavBtn"
          type="button"
          class="btn-submit test-nav-btn"
          :disabled="submitting || !allAnswered"
          @click="submitTest"
        >
          {{ t('reading.submitTest') }}
        </button>
      </div>

      <div v-else class="error-container">
        <p class="error-text">{{ t('reading.generatingFail') }}</p>
        <button type="button" class="btn-secondary" @click="loadTest">{{ t('reading.retry') }}</button>
      </div>
    </div>

    <!-- popup-overlay: TV remote scopes focus to this layer (see tvRemoteNavigation). -->
    <Transition name="popup">
      <div v-if="submitted" class="popup-overlay result-overlay" role="dialog" aria-modal="true">
        <div class="result-panel">
          <div class="result-title">{{ t('reading.testScore') }}</div>
          <div class="result-score">{{ correctCount }}<span class="result-total">/{{ questions.length }}</span></div>
          <div class="result-actions">
            <button
              ref="resultBtn"
              type="button"
              class="btn-secondary result-btn"
              data-tv-preferred-focus
              @click="goBack"
            >{{ t('reading.backToList') }}</button>
          </div>
        </div>
      </div>
    </Transition>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, nextTick, watch } from "vue";
import { useRouter } from "vue-router";
import { isTvMode } from "@/shared/appMode.js";
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
const primaryNavBtn = ref(null);
const resultBtn = ref(null);

let userId = "";
let targetLang = "";
let cefrLevel = "";
let nativeLang = "";
let autoAdvanceTimer = null;

const answeredCount = computed(() => Object.keys(answers.value).length);
const allAnswered = computed(() => questions.value.length > 0 && answeredCount.value === questions.value.length);
const currentQuestion = computed(() => questions.value[currentQuestionIndex.value] || null);
const isListeningQuestion = computed(() => currentQuestion.value?.question_type === "listening");
const isCurrentAnswered = computed(() => answers.value[currentQuestionIndex.value] !== undefined);
/** Phone: disable options after answer. TV: keep focusable (aria-disabled only). */
const optionsHardDisabled = computed(() => !isTvMode && isCurrentAnswered.value);
const questionPrompt = computed(() => {
  const question = currentQuestion.value;
  if (!question) return "";
  if (isListeningQuestion.value) {
    return t("path.listenChoose");
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
  focusQuestionPrimary();
});

watch(currentQuestionIndex, () => {
  if (submitted.value) return;
  focusQuestionPrimary();
});

watch(submitted, (value) => {
  if (value) focusResultPrimary();
});

function clearAutoAdvance() {
  if (autoAdvanceTimer != null) {
    clearTimeout(autoAdvanceTimer);
    autoAdvanceTimer = null;
  }
}

/**
 * Land remote focus on the interactive control for the current step.
 * Listening → play audio; otherwise first option (still focusable after answer on TV).
 */
function focusQuestionPrimary() {
  if (!isTvMode || submitted.value || loading.value) return;
  nextTick(() => {
    const root = document.querySelector(".reading-test");
    if (!root) return;
    const preferred =
      root.querySelector("[data-tv-preferred-focus]")
      || root.querySelector(".option-btn")
      || root.querySelector(".audio-btn")
      || root.querySelector(".test-nav-btn:not(:disabled)")
      || root.querySelector(".btn-secondary");
    preferred?.focus?.({ preventScroll: true });
    preferred?.scrollIntoView?.({ block: "nearest", inline: "nearest" });
  });
}

function focusPrimaryNav() {
  if (!isTvMode) return;
  nextTick(() => {
    const btn = primaryNavBtn.value;
    if (btn && !btn.disabled) {
      btn.focus({ preventScroll: true });
      return;
    }
    const root = document.querySelector(".reading-test");
    const fallback = root?.querySelector(".test-nav-btn:not(:disabled), .btn-submit:not(:disabled)");
    fallback?.focus?.({ preventScroll: true });
  });
}

function focusResultPrimary() {
  if (!isTvMode) return;
  nextTick(() => {
    const btn = resultBtn.value || document.querySelector(".reading-test .result-btn");
    btn?.focus?.({ preventScroll: true });
  });
}

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
  clearAutoAdvance();
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
  clearAutoAdvance();
  if (currentQuestionIndex.value > 0) currentQuestionIndex.value -= 1;
}

function goNext() {
  clearAutoAdvance();
  if (currentQuestionIndex.value < questions.value.length - 1) currentQuestionIndex.value += 1;
}

async function selectAnswer(qi, oi) {
  if (answers.value[qi] !== undefined) return;

  answers.value = { ...answers.value, [qi]: oi };

  const q = questions.value[qi];
  if (oi !== q.correct_index) {
    // Wrong: keep remote on Next/Submit so user can continue after reading feedback.
    focusPrimaryNav();
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
      // Re-assert focus after async DOM (explanation / retry) updates.
      if (qi === currentQuestionIndex.value) focusPrimaryNav();
    }
  } else {
    scheduleAutoAdvance(qi);
  }
}

function scheduleAutoAdvance(qi) {
  if (qi !== currentQuestionIndex.value) return;
  clearAutoAdvance();
  const isLast = currentQuestionIndex.value === questions.value.length - 1;
  autoAdvanceTimer = setTimeout(() => {
    autoAdvanceTimer = null;
    if (currentQuestionIndex.value !== qi) return;
    if (isLast) {
      submitTest();
    } else {
      goNext();
    }
  }, 700);
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
    if (isTvMode && qi === currentQuestionIndex.value) focusPrimaryNav();
  }
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
  clearAutoAdvance();
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
  } catch (e) {
    console.error("Failed to submit test:", e);
    error.value = e?.message || String(e);
  } finally {
    submitting.value = false;
  }
}

function goBack() {
  clearAutoAdvance();
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
  min-height: 0;
  padding: 18px 16px 16px;
  overflow-y: auto;
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

.listening-hint {
  font-weight: 600;
  color: var(--text-light);
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

.option-btn:hover:not(:disabled):not([aria-disabled="true"]) {
  background: var(--surface-variant);
}

.option-btn:disabled,
.option-btn[aria-disabled="true"] {
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

.explanation-box {
  margin-top: 16px;
  padding: 14px;
  background: #fff8e1;
  border: 1px solid #ffe082;
  border-radius: var(--radius-sm);
}

.explanation-header {
  font-size: 13px;
  font-weight: 700;
  margin-bottom: 6px;
  color: var(--text);
}

.explanation-text {
  margin: 0;
  font-size: 13px;
  line-height: 1.5;
  color: var(--text-light);
  white-space: pre-wrap;
}

.explanation-error-box {
  background: #fff5f5;
  border-color: #ffc9c9;
}

.retry-link {
  margin-top: 8px;
  border: none;
  background: none;
  color: var(--blue);
  font-weight: 700;
  font-size: 13px;
  cursor: pointer;
  font-family: inherit;
  padding: 0;
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
  margin-top: auto;
  padding: 14px 0 4px;
  background: linear-gradient(180deg, transparent 0%, var(--bg) 28%);
}

.test-nav-btn {
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
  font-family: inherit;
}

.btn-submit:disabled {
  opacity: 0.5;
  cursor: wait;
}

/* Full-screen result layer so TV focus is scoped (popup-overlay). */
.result-overlay {
  position: fixed;
  inset: 0;
  z-index: 100;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: rgba(0, 0, 0, 0.45);
  box-sizing: border-box;
}

.result-panel {
  background: var(--white);
  color: var(--text);
  padding: 28px 24px;
  border-radius: var(--radius-lg);
  font-weight: 700;
  font-size: 16px;
  box-shadow: var(--shadow-lg);
  width: min(100%, 360px);
  text-align: center;
}

.result-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-light);
}

.result-score {
  font-size: 40px;
  font-weight: 800;
  color: var(--green);
  line-height: 1.2;
  margin: 8px 0 20px;
}

.result-total {
  font-size: 18px;
  font-weight: 700;
  color: var(--text-lighter);
}

.result-actions {
  display: flex;
  gap: 12px;
}

.result-btn {
  flex: 1;
  min-height: 48px;
}

.popup-enter-active,
.popup-leave-active {
  transition: opacity 0.3s;
}

.popup-enter-active .result-panel,
.popup-leave-active .result-panel {
  transition: transform 0.3s, opacity 0.3s;
}

.popup-enter-from,
.popup-leave-to {
  opacity: 0;
}

.popup-enter-from .result-panel,
.popup-leave-to .result-panel {
  transform: translateY(10px);
  opacity: 0;
}

.btn-secondary {
  padding: 10px 20px;
  border: 1px solid var(--border);
  background: var(--white);
  border-radius: var(--radius-md);
  font-weight: 600;
  color: var(--text);
  cursor: pointer;
  font-family: inherit;
}

/* TV: larger targets + inset focus for stacked options */
html[data-app-mode="tv"] .option-btn {
  min-height: 56px;
  font-size: 17px;
  padding: 14px 16px;
}

html[data-app-mode="tv"] .option-btn:focus-visible,
html[data-app-mode="tv"] .audio-btn:focus-visible,
html[data-app-mode="tv"] .test-nav-btn:focus-visible,
html[data-app-mode="tv"] .result-btn:focus-visible,
html[data-app-mode="tv"] .retry-link:focus-visible {
  transform: none;
  outline: 4px solid #1cb0f6 !important;
  outline-offset: -4px;
  z-index: 5;
}

html[data-app-mode="tv"] .question-stage {
  padding: 16px 16px 12px;
}

html[data-app-mode="tv"] .question-text {
  font-size: 18px;
}

html[data-app-mode="tv"] .test-nav-btn {
  min-height: 56px;
  font-size: 17px;
}

html[data-app-mode="tv"] .result-panel {
  max-width: 420px;
  padding: 32px 28px;
}

html[data-app-mode="tv"] .result-btn {
  min-height: 56px;
  font-size: 17px;
}
</style>
