<template>
  <div class="step-goal">
    <h2 class="step-title">{{ t('wizard.goalTitle') }}</h2>
    <p class="step-sub">{{ t('wizard.goalSub') }}</p>

    <!-- Target Language -->
    <div class="form-group">
      <label class="form-label">{{ t('wizard.targetLang') }}</label>
      <div class="pill-group">
        <button
          v-for="lang in targetLanguages"
          :key="lang.value"
          class="pill"
          :class="{ selected: form.targetLanguage === lang.value }"
          @click="form.targetLanguage = lang.value"
        >
          {{ lang.flag }} {{ lang.label }}
        </button>
      </div>
    </div>

    <!-- CEFR Level -->
    <div class="form-group">
      <label class="form-label">{{ t('wizard.level') }}</label>
      <div class="pill-group">
        <button
          v-for="level in levels"
          :key="level.value"
          class="pill"
          :class="{ selected: form.cefrLevel === level.value }"
          @click="form.cefrLevel = level.value"
        >
          {{ level.label }}
        </button>
      </div>
    </div>

    <!-- Learning Objective -->
    <div class="form-group">
      <label class="form-label">{{ t('wizard.objective') }}</label>
      <div class="pill-group">
        <button
          v-for="obj in objectives"
          :key="obj.value"
          class="pill"
          :class="{ selected: form.objective === obj.value }"
          @click="form.objective = obj.value"
        >
          {{ obj.label }}
        </button>
      </div>
    </div>

    <!-- Daily Duration -->
    <div class="form-group">
      <label class="form-label">{{ t('wizard.daily') }}</label>
      <div class="pill-group">
        <button
          v-for="d in durations"
          :key="d.value"
          class="pill"
          :class="{ selected: form.dailyMinutes === d.value }"
          @click="form.dailyMinutes = d.value"
        >
          {{ d.label }}
        </button>
      </div>
    </div>

    <div class="wizard-footer">
      <button class="btn-primary" @click="emitNext">{{ t('wizard.startLearning') }}</button>
    </div>
  </div>
</template>

<script setup>
import { reactive, computed } from "vue";
import { useI18n } from "@/shared/i18n";
import { AVAILABLE_LANGUAGES } from "@/shared/constants.js";

const emit = defineEmits(["next"]);
const { t } = useI18n();

const targetLanguages = computed(() =>
  AVAILABLE_LANGUAGES.map((l) => ({
    value: l.code,
    flag: l.flag,
    label: t(l.nameKey),
  })),
);

const levels = computed(() => [
  { value: "A0", label: t("wizard.levels.A0") },
  { value: "A1", label: t("wizard.levels.A1") },
  { value: "A2", label: t("wizard.levels.A2") },
  { value: "B1", label: t("wizard.levels.B1") },
  { value: "B2", label: t("wizard.levels.B2") },
  { value: "C1", label: t("wizard.levels.C1") },
]);

const objectives = computed(() => [
  { value: "daily_conversation", label: t("wizard.objectives.daily_conversation") },
  { value: "travel", label: t("wizard.objectives.travel") },
  { value: "exam", label: t("wizard.objectives.exam") },
  { value: "fluent", label: t("wizard.objectives.fluent") },
]);

const durations = computed(() => [
  { value: 5, label: t("wizard.durations.5") },
  { value: 15, label: t("wizard.durations.15") },
  { value: 30, label: t("wizard.durations.30") },
  { value: 60, label: t("wizard.durations.60") },
]);

const form = reactive({
  targetLanguage: "es",
  cefrLevel: "A0",
  objective: "daily_conversation",
  dailyMinutes: 15,
});

function emitNext() {
  emit("next", { ...form });
}
</script>

<style scoped>
.step-goal {
  display: flex;
  flex-direction: column;
  flex: 1;
}

.step-title {
  font-size: 22px;
  font-weight: 800;
  text-align: center;
  margin-bottom: 4px;
}

.step-sub {
  font-size: 13px;
  color: var(--text-light);
  text-align: center;
  margin-bottom: 28px;
}

.form-group {
  margin-bottom: 20px;
}

.form-label {
  display: block;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-light);
  margin-bottom: 8px;
}

.pill-group {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.pill {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 10px 18px;
  border-radius: 24px;
  border: 1.5px solid var(--border);
  background: var(--surface);
  color: var(--text);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all var(--transition);
  font-family: inherit;
}

.pill:hover {
  border-color: var(--green);
  color: var(--green);
}

.pill.selected {
  background: var(--green);
  color: #fff;
  border-color: var(--green);
}

.wizard-footer {
  margin-top: auto;
  padding: 20px 0 32px;
}

.btn-primary {
  width: 100%;
  padding: 14px;
  border-radius: var(--radius-md);
  background: var(--green);
  color: #fff;
  font-size: 16px;
  font-weight: 700;
  border: none;
  cursor: pointer;
  transition: all var(--transition);
  font-family: inherit;
}

.btn-primary:hover {
  background: var(--green-hover);
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(88, 204, 2, 0.3);
}
</style>
