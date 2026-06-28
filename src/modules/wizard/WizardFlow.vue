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
      <div v-if="saveError" class="error-banner">{{ t("wizard.saveFail") }}</div>
      <Transition :name="transitionName" mode="out-in">
        <component
          :is="currentComponent"
          :key="current"
          @next="onNext"
        />
      </Transition>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from "vue";
import { useRouter } from "vue-router";
import StepProfile from "./steps/StepProfile.vue";
import StepLearning from "./steps/StepLearning.vue";
import StepDemographics from "./steps/StepDemographics.vue";
import StepAvatar from "./steps/StepAvatar.vue";
import {
  createUser,
  saveLearningGoal,
  initUserVocab,
} from "@/shared/api.js";
import { useI18n, setLocale } from "@/shared/i18n";
import { useTargetLangStore } from "@/stores/targetLang.js";

const { t } = useI18n();
const router = useRouter();
const targetLangStore = useTargetLangStore();

// Screenshot helper: ?wizardStep=N (0-3) jumps to a specific step. Only
// active in browser-dev mode (no Tauri), guarded by `typeof window`.
let _initialStep = 0;
if (typeof window !== "undefined") {
  const _s = new URLSearchParams(window.location.search).get("wizardStep");
  if (_s !== null) {
    const _n = parseInt(_s, 10);
    if (!Number.isNaN(_n) && _n >= 0 && _n < 4) _initialStep = _n;
  }
}
const current = ref(_initialStep);
const prevStep = ref(0);

const steps = [
  { component: StepProfile },
  { component: StepLearning },
  { component: StepDemographics },
  { component: StepAvatar },
];

const currentComponent = computed(() => steps[current.value].component);

const transitionName = computed(() =>
  current.value > prevStep.value ? "slide-left" : "slide-right",
);

const profile = ref({ nickname: "", nativeLanguage: "zh" });
const learning = ref({ targetLanguage: "es", cefrLevel: "A1" });
const demographics = ref({ ageRange: null, gender: null });
const avatar = ref({ avatar: "😊" });

const emitted = ref(false);
const saveError = ref(false);

async function onNext(data) {
  if (emitted.value) return;

  if (current.value === 0) {
    profile.value = { ...profile.value, ...data };
    // Native language maps 1:1 to UI locale (zh/en/es). Switching here so
    // the rest of the wizard and the main app both render in the user's
    // language without a second detour to settings.
    if (data.nativeLanguage) {
      setLocale(data.nativeLanguage, { persist: true });
    }
  } else if (current.value === 1) {
    learning.value = { ...learning.value, ...data };
  } else if (current.value === 2) {
    demographics.value = { ...demographics.value, ...data };
  } else if (current.value === 3) {
    avatar.value = { ...avatar.value, ...data };
    const ok = await saveToBackend();
    if (!ok) return;
    emitted.value = true;
    // Replace (not push) so /wizard is not left on the browser history
    // stack. Otherwise a system back press can land on the wizard again
    // even after onboarding is complete (issue #11).
    router.replace({ name: "learn" });
    return;
  }
  prevStep.value = current.value;
  current.value++;
}

async function saveToBackend() {
  saveError.value = false;
  try {
    const user = await createUser({
      nickname: profile.value.nickname || t("common.learner"),
      avatar: avatar.value.avatar || "😊",
      native_language: profile.value.nativeLanguage || "zh",
      country: "CN",
      gender: demographics.value.gender || null,
      birth_year: null,
      age_range: demographics.value.ageRange || null,
    });

    await saveLearningGoal({
      user_id: user.id,
      target_language: learning.value.targetLanguage || "es",
      cefr_level: learning.value.cefrLevel || "A1",
      daily_minutes: 15,
      objective: "daily_conversation",
    });

    try {
      await targetLangStore.set(learning.value.targetLanguage);
    } catch (e) {
      console.warn("setTargetLanguage failed during wizard", e);
    }

    await initUserVocab(user.id, learning.value.cefrLevel || "A1");
  } catch (e) {
    console.error("Failed to save wizard data:", e);
    saveError.value = true;
    return false;
  }
  return true;
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

.error-banner {
  margin-bottom: 12px;
  padding: 10px 16px;
  background: var(--red-bg);
  color: var(--red);
  border-radius: var(--radius-sm);
  font-size: 13px;
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
