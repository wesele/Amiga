<template>
  <div class="wizard">
    <!-- Step Indicator -->
    <div class="step-indicator">
      <div
        v-for="(step, i) in steps"
        :key="i"
        class="step-dot"
        :class="{ active: i === current, done: i < current }"
      >
        <template v-if="i < current">✓</template>
        <template v-else>{{ i + 1 }}</template>
      </div>
      <div
        v-for="i in steps.length - 1"
        :key="'line-' + i"
        class="step-line"
        :class="{ done: i <= current }"
      />
    </div>

    <!-- Steps -->
    <div class="steps-container">
      <Transition :name="transitionName" mode="out-in">
        <component
          :is="currentComponent"
          :key="current"
          :data="stepData"
          @next="onNext"
        />
      </Transition>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from "vue";
import { useRouter } from "vue-router";
import StepBasicInfo from "./steps/StepBasicInfo.vue";
import StepLearningGoal from "./steps/StepLearningGoal.vue";
import StepComplete from "./steps/StepComplete.vue";
import {
  createUser,
  saveLearningGoal,
  initUserVocab,
  getCurrentUser,
} from "@/shared/api.js";
import { useI18n } from "@/shared/i18n";
import { useTargetLangStore } from "@/stores/targetLang.js";

const { t } = useI18n();
const router = useRouter();
const targetLangStore = useTargetLangStore();
const current = ref(0);
const prevStep = ref(0);

const steps = [
  { component: StepBasicInfo, title: "wizard.basic" },
  { component: StepLearningGoal, title: "wizard.goal" },
  { component: StepComplete, title: "wizard.complete" },
];

const currentComponent = computed(() => steps[current.value].component);

const transitionName = computed(() =>
  current.value > prevStep.value ? "slide-left" : "slide-right"
);

const basicInfo = ref(null);
const learningGoal = ref(null);

const stepData = computed(() => ({
  basicInfo: basicInfo.value,
  learningGoal: learningGoal.value,
  targetLanguage: learningGoal.value?.targetLanguage,
}));

const emitted = ref(false);

async function onNext(data) {
  if (emitted.value) return;

  if (current.value === 0) {
    basicInfo.value = data;
  } else if (current.value === 1) {
    learningGoal.value = data;
    // Save everything to backend
    await saveToBackend();
  } else if (current.value === 2) {
    emitted.value = true;
    router.push("/news");
    return;
  }
  prevStep.value = current.value;
  current.value++;
}

async function saveToBackend() {
  try {
    const info = basicInfo.value;
    const goal = learningGoal.value;

    // Create/update user
    const user = await createUser({
      nickname: info.nickname || t("common.learner"),
      avatar: info.avatar || "😊",
      native_language: info.nativeLanguage || "zh",
      country: info.country || "CN",
      gender: info.gender || "private",
      birth_year: info.birthYear || null,
    });

    const targetLang = goal.targetLanguage || "es";

    // Save learning goal
    await saveLearningGoal({
      user_id: user.id,
      target_language: targetLang,
      cefr_level: goal.cefrLevel || "A1",
      daily_minutes: goal.dailyMinutes || 15,
      objective: goal.objective || "daily_conversation",
    });

    // Persist the wizard's choice as the active target language so
    // downstream pages (news/vocab/chat) read it from the same source.
    // The store emits a `targetLang:changed` event so any mounted consumers
    // refresh immediately; here it has no listeners yet but the value
    // is what the first onMounted will read.
    try {
      await targetLangStore.set(targetLang);
    } catch (e) {
      console.warn("setTargetLanguage failed during wizard", e);
    }

    // Initialize vocabulary
    if (goal.cefrLevel && goal.cefrLevel !== "A0") {
      await initUserVocab(user.id, goal.cefrLevel);
    }
  } catch (e) {
    console.error("Failed to save wizard data:", e);
  }
}
</script>

<style scoped>
.wizard {
  display: flex;
  flex-direction: column;
  height: 100vh;
  background: var(--surface);
}

.step-indicator {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0;
  padding: 24px 32px;
  flex-shrink: 0;
}

.step-dot {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  font-weight: 700;
  background: var(--surface-variant);
  color: var(--text-lighter);
  transition: all var(--transition);
  flex-shrink: 0;
  border: 2px solid var(--outline-variant);
}

.step-dot.active {
  background: var(--green);
  color: #fff;
  border-color: var(--green);
  box-shadow: 0 0 0 4px var(--green-bg);
  transform: scale(1.1);
}

.step-dot.done {
  background: var(--green);
  color: #fff;
  border-color: var(--green);
}

.step-line {
  width: 48px;
  height: 3px;
  background: var(--outline-variant);
  border-radius: 2px;
  margin: 0 4px;
  transition: background var(--transition);
}

.step-line.done {
  background: var(--green);
}

.steps-container {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 0 24px;
  display: flex;
  flex-direction: column;
}

/* Slide transitions */
.slide-left-enter-active,
.slide-left-leave-active,
.slide-right-enter-active,
.slide-right-leave-active {
  transition: all 0.3s cubic-bezier(0.2, 0, 0, 1);
}

.slide-left-enter-from {
  opacity: 0;
  transform: translateX(30px);
}

.slide-left-leave-to {
  opacity: 0;
  transform: translateX(-30px);
}

.slide-right-enter-from {
  opacity: 0;
  transform: translateX(-30px);
}

.slide-right-leave-to {
  opacity: 0;
  transform: translateX(30px);
}
</style>
