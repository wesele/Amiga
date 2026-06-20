<template>
  <div class="step-profile">
    <h2 class="step-title">{{ t('wizard.step1Title') }}</h2>
    <p class="step-sub">{{ t('wizard.step1Sub') }}</p>

    <div class="form-group">
      <label class="form-label" for="nickname">{{ t('wizard.nickname') }}</label>
      <input
        id="nickname"
        v-model="form.nickname"
        class="form-input"
        type="text"
        maxlength="20"
        :placeholder="t('wizard.nicknamePlaceholder')"
      />
      <span class="char-count">{{ form.nickname.length }}/20</span>
    </div>

    <div class="form-group">
      <label class="form-label">{{ t('wizard.nativeLang') }}</label>
      <div class="pill-group">
        <button
          v-for="lang in nativeLanguages"
          :key="lang.value"
          class="pill"
          :class="{ selected: form.nativeLanguage === lang.value }"
          @click="form.nativeLanguage = lang.value"
        >
          {{ lang.flag }} {{ lang.label }}
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

const emit = defineEmits(["next"]);
const { t } = useI18n();

const nativeLanguages = computed(() => [
  { value: "zh", flag: "🇨🇳", label: t("lang.zh") },
  { value: "en", flag: "🇬🇧", label: t("lang.en") },
  { value: "es", flag: "🇪🇸", label: t("lang.es") },
]);

const form = reactive({
  nickname: "",
  nativeLanguage: "zh",
});

const canNext = computed(
  () => form.nickname.trim().length > 0 && !!form.nativeLanguage,
);

function emitNext() {
  emit("next", { ...form });
}
</script>

<style scoped>
.step-profile {
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
  margin-bottom: 18px;
}

.form-label {
  display: block;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-light);
  margin-bottom: 6px;
}

.form-input {
  width: 100%;
  padding: 12px 14px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--border);
  font-size: 14px;
  font-family: inherit;
  color: var(--text);
  background: var(--surface);
  transition: border-color var(--transition);
  outline: none;
}

.form-input:focus {
  border-color: var(--green);
  box-shadow: 0 0 0 3px var(--green-bg);
}

.char-count {
  font-size: 11px;
  color: var(--text-lighter);
  float: right;
  margin-top: 2px;
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
