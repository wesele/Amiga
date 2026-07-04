<template>
  <div class="assessment-page">
    <header class="assessment-header">
      <button type="button" class="ghost-btn" @click="exit">关闭</button>
      <div class="progress">
        <div class="progress-fill" :style="{ width: progress + '%' }" />
      </div>
      <span class="count">{{ index + 1 }}/{{ items.length }}</span>
    </header>

    <main v-if="current" class="question-panel">
      <p class="skill-label">{{ skillLabel(current.skill) }}</p>
      <h1>{{ current.prompt }}</h1>

      <div v-if="current.type === 'choice'" class="options">
        <button
          v-for="(option, optionIdx) in current.options"
          :key="option"
          type="button"
          class="option-btn"
          :class="{ selected: answers[current.id] === optionIdx }"
          @click="answerChoice(optionIdx)"
        >
          {{ option }}
        </button>
      </div>

      <textarea
        v-else
        v-model="textAnswer"
        class="text-answer"
        :placeholder="current.placeholder"
        @input="answerText"
      />
    </main>

    <footer class="assessment-footer">
      <button type="button" class="secondary-btn" :disabled="index === 0" @click="prev">
        上一题
      </button>
      <button type="button" class="primary-btn" :disabled="!canContinue" @click="next">
        {{ index === items.length - 1 ? "看结果" : "下一题" }}
      </button>
    </footer>
  </div>
</template>

<script setup>
import { computed, onMounted, ref, watch } from "vue";
import { useRouter } from "vue-router";
import { ASSESSMENT_ITEMS, SKILL_LABELS, scoreAssessment } from "./scoring.js";
import {
  clearAssessmentDraft,
  loadAssessmentDraft,
  saveAssessmentDraft,
} from "./sessionStore.js";

const router = useRouter();
const items = ASSESSMENT_ITEMS;
const index = ref(0);
const answers = ref({});
const textAnswer = ref("");

const current = computed(() => items[index.value]);
const progress = computed(() => Math.round((index.value / items.length) * 100));
const canContinue = computed(() => {
  const item = current.value;
  if (!item) return false;
  const answer = answers.value[item.id];
  if (item.type === "text") return String(answer || "").trim().length > 0;
  return answer != null;
});

function skillLabel(skill) {
  return SKILL_LABELS[skill] || skill;
}

function persist() {
  saveAssessmentDraft({ index: index.value, answers: answers.value });
}

function answerChoice(optionIdx) {
  answers.value = { ...answers.value, [current.value.id]: optionIdx };
  persist();
}

function answerText() {
  answers.value = { ...answers.value, [current.value.id]: textAnswer.value };
  persist();
}

function syncTextAnswer() {
  const item = current.value;
  textAnswer.value = item?.type === "text" ? answers.value[item.id] || "" : "";
}

function prev() {
  if (index.value > 0) index.value -= 1;
  persist();
}

function next() {
  if (index.value < items.length - 1) {
    index.value += 1;
    persist();
    return;
  }
  const result = scoreAssessment(items, answers.value);
  sessionStorage.setItem("assessment.latest_result", JSON.stringify(result));
  clearAssessmentDraft();
  router.replace({ name: "assessment-result" });
}

function exit() {
  persist();
  router.replace({ name: "learn" });
}

onMounted(() => {
  const draft = loadAssessmentDraft();
  if (draft) {
    index.value = Math.min(Math.max(Number(draft.index || 0), 0), items.length - 1);
    answers.value = draft.answers || {};
  }
  syncTextAnswer();
});

watch(current, syncTextAnswer);
</script>

<style scoped>
.assessment-page {
  min-height: 100%;
  display: flex;
  flex-direction: column;
  background: var(--bg);
}

.assessment-header {
  display: grid;
  grid-template-columns: auto 1fr auto;
  align-items: center;
  gap: 12px;
  padding: 14px 16px;
  background: var(--white);
  border-bottom: 1px solid var(--border);
}

.ghost-btn,
.secondary-btn,
.primary-btn {
  min-height: 40px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--border);
  background: var(--white);
  font: inherit;
  font-weight: 800;
}

.ghost-btn {
  padding: 0 10px;
  color: var(--text-light);
}

.progress {
  height: 12px;
  border-radius: 999px;
  background: var(--gray-light);
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  background: var(--green);
  transition: width var(--transition);
}

.count {
  font-size: 13px;
  font-weight: 800;
  color: var(--text-light);
}

.question-panel {
  flex: 1;
  padding: 28px 20px;
}

.skill-label {
  margin: 0 0 10px;
  color: var(--blue-hover);
  font-size: 13px;
  font-weight: 900;
}

.question-panel h1 {
  margin: 0 0 24px;
  font-size: 22px;
  line-height: 1.35;
}

.options {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.option-btn {
  width: 100%;
  min-height: 54px;
  padding: 14px 16px;
  border: 2px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--white);
  text-align: left;
  font: inherit;
  font-weight: 700;
}

.option-btn.selected {
  border-color: var(--blue);
  background: var(--blue-bg);
  color: var(--blue-hover);
}

.text-answer {
  width: 100%;
  min-height: 150px;
  padding: 14px;
  border: 2px solid var(--border);
  border-radius: var(--radius-md);
  font: inherit;
  line-height: 1.45;
  resize: none;
}

.assessment-footer {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
  padding: 14px 16px calc(14px + var(--safe-bottom));
  background: var(--white);
  border-top: 1px solid var(--border);
}

.secondary-btn:disabled,
.primary-btn:disabled {
  opacity: 0.45;
}

.primary-btn {
  border: none;
  background: var(--green);
  color: var(--white);
  box-shadow: 0 4px 0 var(--green-hover);
}
</style>
