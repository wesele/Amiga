<template>
  <div class="step-demo">
    <h2 class="step-title">{{ t('wizard.step3Title') }}</h2>
    <p class="step-sub">{{ t('wizard.step3Sub') }}</p>

    <div class="form-group">
      <label class="form-label">{{ t('wizard.ageRange') }}</label>
      <div class="pill-group">
        <button
          v-for="r in ageRanges"
          :key="r.value"
          class="pill"
          :class="{ selected: form.ageRange === r.value }"
          @click="form.ageRange = form.ageRange === r.value ? null : r.value"
        >
          {{ r.label }}
        </button>
      </div>
    </div>

    <div class="form-group">
      <label class="form-label">{{ t('wizard.gender') }}</label>
      <div class="pill-group">
        <button
          v-for="g in genders"
          :key="g.value"
          class="pill"
          :class="{ selected: form.gender === g.value }"
          @click="form.gender = form.gender === g.value ? null : g.value"
        >
          {{ g.label }}
        </button>
      </div>
    </div>

    <div class="wizard-footer">
      <button class="btn-primary" @click="emitNext">
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

const ageRanges = computed(() => [
  { value: "under_18", label: t("wizard.ageRanges.under_18") },
  { value: "18_36", label: t("wizard.ageRanges.18_36") },
  { value: "37_54", label: t("wizard.ageRanges.37_54") },
  { value: "over_54", label: t("wizard.ageRanges.over_54") },
]);

const genders = computed(() => [
  { value: "male", label: t("wizard.genders.male") },
  { value: "female", label: t("wizard.genders.female") },
  { value: "private", label: t("wizard.genders.private") },
]);

const form = reactive({
  ageRange: null,
  gender: null,
});

function emitNext() {
  emit("next", { ...form });
}
</script>

<style scoped>
.step-demo {
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
  color: var(--text-lighter);
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

.pill:focus-visible {
  border-color: var(--green);
  color: var(--green);
  outline: none;
  background: var(--green-bg);
}

.btn-primary:focus-visible {
  background: var(--green-hover);
  box-shadow: 0 0 0 3px rgba(88, 204, 2, 0.4);
  outline: none;
}
</style>
