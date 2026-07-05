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
        <div class="header-progress" v-if="questions.length > 0">
          {{ answeredCount }}/{{ questions.length }}
        </div>
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

    <div v-else class="questions-list">
      <div
        v-for="(q, qi) in questions"
        :key="qi"
        class="question-card"
        :class="{ answered: answers[qi] !== undefined }"
      >
        <div class="question-number">{{ qi + 1 }}</div>
        <p class="question-text">{{ q.question }}</p>

        <div class="options">
          <button
            v-for="(opt, oi) in q.options"
            :key="oi"
            class="option-btn"
            :class="optionClass(qi, oi)"
            :disabled="answers[qi] !== undefined"
            @click="selectAnswer(qi, oi)"
          >
            <span class="option-key">{{ optionLabels[oi] }}</span>
            <span class="option-text">{{ opt }}</span>
            <span v-if="answers[qi] !== undefined && oi === q.correct_index" class="option-mark correct-mark">✓</span>
            <span v-else-if="answers[qi] === oi && oi !== q.correct_index" class="option-mark wrong-mark">✗</span>
          </button>
        </div>

        <Transition name="expand">
          <div v-if="explanations[qi]" class="explanation-box">
            <div class="explanation-header">{{ t('reading.explanation') }}</div>
            <p class="explanation-text">{{ explanations[qi] }}</p>
          </div>
          <div v-else-if="loadingExplanation[qi]" class="explanation-loading">
            <div class="spinner-small" />
            <span>{{ t('reading.loadingExplanation') }}</span>
          </div>
        </Transition>
      </div>
    </div>

    <div v-if="questions.length > 0 && allAnswered" class="bottom-bar">
      <button
        class="btn-submit"
        :disabled="submitting"
        @click="submitTest"
      >
        {{ t('reading.submitTest') }}
      </button>
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
  getReadingArticle,
} from "@/shared/api.js";
import { loadLearningContext } from "@/shared/learningContext.js";

const { t } = useI18n();
const router = useRouter();
const targetLangStore = useTargetLangStore();

const props = defineProps({ id: [String, Number] });

const optionLabels = ["A", "B", "C", "D"];

const questions = ref([]);
const answers = ref({});
const explanations = ref({});
const loadingExplanation = ref({});
const loading = ref(true);
const error = ref("");
const submitting = ref(false);
const submitted = ref(false);
const correctCount = ref(0);

let userId = "";
let targetLang = "";
let cefrLevel = "";
let nativeLang = "";

const answeredCount = computed(() => Object.keys(answers.value).length);
const allAnswered = computed(() => questions.value.length > 0 && answeredCount.value === questions.value.length);

onMounted(async () => {
  await loadTest();
});

function optionClass(qi, oi) {
  if (answers.value[qi] === undefined) return "";
  const correct = questions.value[qi].correct_index;
  if (oi === correct) return "correct";
  if (answers.value[qi] === oi) return "wrong";
  return "dimmed";
}

async function loadTest() {
  loading.value = true;
  error.value = "";
  try {
    const ctx = await loadLearningContext({ targetLangStore, fallbackToFirstGoal: true });
    targetLang = ctx.targetLang;
    cefrLevel = ctx.cefr;
    nativeLang = ctx.nativeLang;
    userId = ctx.user?.id || "";

    questions.value = await getOrGenerateReadingTest(Number(props.id), targetLang, cefrLevel);

    // Load cached explanations (if returning after leaving)
    try {
      const cached = await getReadingTestExplanations(Number(props.id));
      cached.forEach((exp, i) => {
        if (exp) {
          explanations.value[i] = exp;
        }
      });
    } catch (e) {
      // ignore
    }
  } catch (e) {
    console.error("Failed to load test:", e);
    error.value = e?.message || String(e);
  } finally {
    loading.value = false;
  }
}

async function selectAnswer(qi, oi) {
  if (answers.value[qi] !== undefined) return;

  answers.value = { ...answers.value, [qi]: oi };

  const q = questions.value[qi];
  if (oi !== q.correct_index) {
    // Wrong answer - generate explanation
    loadingExplanation.value = { ...loadingExplanation.value, [qi]: true };
    try {
      const userAnswerText = q.options[oi];
      const correctAnswerText = q.options[q.correct_index];
      const questionJson = JSON.stringify(q);
      const exp = await explainReadingAnswer(
        Number(props.id), qi, questionJson,
        userAnswerText, correctAnswerText,
        targetLang, nativeLang,
      );
      explanations.value = { ...explanations.value, [qi]: exp };
    } catch (e) {
      console.error("Failed to get explanation:", e);
      explanations.value = { ...explanations.value, [qi]: t("reading.generateFail") };
    } finally {
      loadingExplanation.value = { ...loadingExplanation.value, [qi]: false };
    }
  }
}

async function submitTest() {
  if (submitting.value) return;
  submitting.value = true;

  let correct = 0;
  questions.value.forEach((q, qi) => {
    if (answers.value[qi] === q.correct_index) {
      correct++;
    }
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

.header-info {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.header-title {
  font-size: 16px;
  font-weight: 700;
}

.header-progress {
  font-size: 13px;
  color: var(--text-light);
  font-weight: 600;
}

.loading-center, .error-container {
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

.questions-list {
  padding: 12px 16px;
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding-bottom: 80px;
}

.question-card {
  background: var(--white);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  padding: 14px;
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
  margin-bottom: 8px;
}

.question-text {
  margin: 0 0 10px;
  font-size: 14px;
  font-weight: 600;
  line-height: 1.4;
  color: var(--text);
}

.options {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.option-btn {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 10px 12px;
  border: 1px solid var(--border);
  background: var(--white);
  border-radius: var(--radius-sm);
  cursor: pointer;
  text-align: left;
  font-family: inherit;
  font-size: 13px;
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
  width: 22px;
  height: 22px;
  border-radius: 50%;
  background: var(--surface-variant);
  text-align: center;
  font-size: 12px;
  font-weight: 700;
  line-height: 22px;
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

.explanation-box {
  margin-top: 10px;
  padding: 10px 12px;
  background: #fff8e1;
  border: 1px solid #ffe082;
  border-radius: var(--radius-sm);
}

.explanation-header {
  font-size: 12px;
  font-weight: 700;
  color: #856404;
  margin-bottom: 4px;
}

.explanation-text {
  margin: 0;
  font-size: 13px;
  line-height: 1.5;
  color: #5a4a00;
}

.explanation-loading {
  margin-top: 10px;
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
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  display: flex;
  justify-content: center;
  padding: 12px 16px;
  background: var(--white);
  border-top: 1px solid var(--border);
}

.btn-submit {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 32px;
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

.popup-enter-active, .popup-leave-active {
  transition: opacity 0.3s, transform 0.3s;
}

.popup-enter-from, .popup-leave-to {
  opacity: 0;
  transform: translateX(-50%) translateY(10px);
}

.expand-enter-active, .expand-leave-active {
  transition: all 0.3s ease;
}

.expand-enter-from, .expand-leave-to {
  opacity: 0;
  max-height: 0;
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
