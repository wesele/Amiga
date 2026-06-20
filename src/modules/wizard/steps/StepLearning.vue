<template>
  <div class="step-learning">
    <h2 class="step-title">{{ t('wizard.step2Title') }}</h2>
    <p class="step-sub">{{ t('wizard.step2Sub') }}</p>

    <div class="form-group">
      <label class="form-label">
        {{ t('wizard.targetLang') }}
        <span class="hint">{{ t('wizard.targetLangHint') }}</span>
      </label>
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

    <div class="form-group">
      <label class="form-label">{{ t('wizard.level') }}</label>
      <div class="pill-group">
        <button
          v-for="lvl in levels"
          :key="lvl.value"
          class="pill"
          :class="{ selected: form.cefrLevel === lvl.value }"
          @click="form.cefrLevel = lvl.value"
        >
          {{ lvl.label }}
        </button>
      </div>
    </div>

    <div class="wizard-footer">
      <button class="btn-primary" :disabled="!canNext" @click="emitNext">
        {{ t('wizard.next') }}
      </button>
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

// Only show levels that have content in vocab_bank (per migration V8 comment).
const SUPPORTED_LEVELS = ["A1", "A2"];

const levels = computed(() =>
  SUPPORTED_LEVELS.map((v) => ({ value: v, label: t(`wizard.levels.${v}`) })),
);

const form = reactive({
  targetLanguage: AVAILABLE_LANGUAGES[0].code,
  cefrLevel: SUPPORTED_LEVELS[0],
});

const canNext = computed(() => !!form.targetLanguage && !!form.cefrLevel);

function emitNext() {
  emit("next", { ...form });
}
</script>

<style scoped>
.step-learning {
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
  margin-bottom: 24px;
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

.hint {
  font-weight: 400;
  color: var(--text-lighter);
  margin-left: 4px;
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

.btn-primary:hover:not(:disabled) {
  background: var(--green-hover);
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(88, 204, 2, 0.3);
}

.btn-primary:disabled {
  background: var(--surface-variant);
  color: var(--text-lighter);
  cursor: not-allowed;
}
</style>
