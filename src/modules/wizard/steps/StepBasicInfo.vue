<template>
  <div class="step-basic">
    <div class="welcome-logo">
      <div class="logo-icon">A</div>
      <h1 class="app-name">{{ t('app.name') }}</h1>
      <p class="tagline">{{ t('app.tagline') }}</p>
    </div>

    <h2 class="step-title">{{ t('wizard.welcome') }}</h2>
    <p class="step-sub">{{ t('wizard.welcomeSub') }}</p>

    <!-- Avatar -->
    <div class="form-group">
      <label class="form-label">{{ t('wizard.fields.avatar') }}</label>
      <div class="avatar-select">
        <button
          v-for="emoji in avatars"
          :key="emoji"
          class="avatar-circle"
          :class="{ selected: form.avatar === emoji }"
          @click="form.avatar = emoji"
        >
          {{ emoji }}
        </button>
      </div>
    </div>

    <!-- Nickname -->
    <div class="form-group">
      <label class="form-label" for="nickname">{{ t('wizard.fields.nickname') }}</label>
      <input
        id="nickname"
        v-model="form.nickname"
        class="form-input"
        type="text"
        maxlength="20"
        :placeholder="t('wizard.fields.nicknamePlaceholder')"
      />
      <span class="char-count">{{ form.nickname.length }}/20</span>
    </div>

    <!-- Native Language -->
    <div class="form-group">
      <label class="form-label">{{ t('wizard.fields.native') }}</label>
      <div class="pill-group">
        <button
          v-for="lang in languages"
          :key="lang.value"
          class="pill"
          :class="{ selected: form.nativeLanguage === lang.value }"
          @click="form.nativeLanguage = lang.value"
        >
          {{ lang.flag }} {{ lang.label }}
        </button>
      </div>
    </div>

    <!-- Country -->
    <div class="form-group">
      <label class="form-label">{{ t('wizard.fields.country') }}</label>
      <select v-model="form.country" class="form-input">
        <option v-for="c in countries" :key="c.value" :value="c.value">
          {{ c.flag }} {{ c.label }}
        </option>
      </select>
    </div>

    <!-- Gender -->
    <div class="form-group">
      <label class="form-label">
        {{ t('wizard.fields.gender') }}
        <span class="optional">{{ t('wizard.fields.genderOptional') }}</span>
      </label>
      <div class="pill-group">
        <button
          v-for="g in genders"
          :key="g.value"
          class="pill"
          :class="{ selected: form.gender === g.value }"
          @click="form.gender = g.value"
        >
          {{ g.label }}
        </button>
      </div>
    </div>

    <!-- Birth Year -->
    <div class="form-group">
      <label class="form-label">
        {{ t('wizard.fields.year') }}
        <span class="optional">{{ t('wizard.fields.genderOptional') }}</span>
      </label>
      <select v-model="form.birthYear" class="form-input">
        <option :value="null">{{ t('wizard.fields.yearPlaceholder') }}</option>
        <option v-for="y in yearOptions" :key="y" :value="y">{{ y }}</option>
      </select>
    </div>

    <div class="wizard-footer">
      <button class="btn-primary" @click="emitNext">{{ t('wizard.next') }}</button>
      <button class="btn-link" @click="emitNext">{{ t('wizard.skip') }}</button>
    </div>
  </div>
</template>

<script setup>
import { reactive, computed } from "vue";
import { useI18n } from "@/shared/i18n";

const emit = defineEmits(["next"]);
const { t } = useI18n();

const avatars = ["😊", "😎", "🤓", "🌸", "🦊", "🐱", "🐶", "🐻", "🦉", "🌟", "🎯", "🎨"];

const languages = computed(() => [
  { value: "zh", flag: "🇨🇳", label: t("lang.zh") },
  { value: "en", flag: "🇬🇧", label: t("lang.en") },
  { value: "es", flag: "🇪🇸", label: t("lang.es") },
  { value: "ja", flag: "🇯🇵", label: t("lang.ja") },
  { value: "fr", flag: "🇫🇷", label: t("lang.fr") },
  { value: "de", flag: "🇩🇪", label: t("lang.de") },
]);

const countries = computed(() => [
  { value: "CN", flag: "🇨🇳", label: t("country.CN") },
  { value: "ES", flag: "🇪🇸", label: t("country.ES") },
  { value: "MX", flag: "🇲🇽", label: t("country.MX") },
  { value: "AR", flag: "🇦🇷", label: t("country.AR") },
  { value: "US", flag: "🇺🇸", label: t("country.US") },
  { value: "JP", flag: "🇯🇵", label: t("country.JP") },
]);

const genders = computed(() => [
  { value: "male", label: t("wizard.genders.male") },
  { value: "female", label: t("wizard.genders.female") },
  { value: "private", label: t("wizard.genders.private") },
]);

const form = reactive({
  avatar: "😊",
  nickname: "",
  nativeLanguage: "zh",
  country: "CN",
  gender: "private",
  birthYear: null,
});

const currentYear = new Date().getFullYear();
const yearOptions = computed(() => {
  const years = [];
  for (let y = currentYear - 10; y >= currentYear - 70; y--) years.push(y);
  return years;
});

function emitNext() {
  emit("next", { ...form });
}
</script>

<style scoped>
.step-basic {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
}

.welcome-logo {
  text-align: center;
  padding: 8px 0 16px;
}

.logo-icon {
  width: 60px;
  height: 60px;
  border-radius: 16px;
  background: linear-gradient(135deg, var(--green), var(--green-hover));
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 28px;
  font-weight: 800;
  color: #fff;
  margin: 0 auto 10px;
  box-shadow: 0 4px 16px rgba(88, 204, 2, 0.25);
}

.app-name {
  font-size: 22px;
  font-weight: 800;
  color: var(--green);
}

.tagline {
  font-size: 12px;
  color: var(--text-lighter);
  margin-top: 2px;
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
  margin-bottom: 20px;
}

.form-group {
  margin-bottom: 14px;
}

.form-label {
  display: block;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-light);
  margin-bottom: 6px;
}

.optional {
  font-weight: 400;
  color: var(--text-lighter);
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
  appearance: none;
}

.form-input:focus {
  border-color: var(--green);
  box-shadow: 0 0 0 3px var(--green-bg);
}

select.form-input {
  background: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12'%3E%3Cpath d='M2 4l4 4 4-4' fill='%23777'/%3E%3C/svg%3E") no-repeat right 12px center;
  appearance: none;
  padding-right: 32px;
}

.char-count {
  font-size: 11px;
  color: var(--text-lighter);
  float: right;
  margin-top: 2px;
}

.avatar-select {
  display: flex;
  gap: 8px;
  align-items: center;
  flex-wrap: wrap;
}

.avatar-circle {
  width: 44px;
  height: 44px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 22px;
  cursor: pointer;
  border: 2px solid transparent;
  background: var(--bg);
  transition: all var(--transition);
}

.avatar-circle:hover {
  border-color: var(--green);
}

.avatar-circle.selected {
  border-color: var(--green);
  background: var(--green-bg);
  border-width: 3px;
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
  padding: 8px 16px;
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
  display: flex;
  flex-direction: column;
  gap: 8px;
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

.btn-link {
  background: none;
  border: none;
  color: var(--text-light);
  font-size: 13px;
  cursor: pointer;
  text-align: center;
  padding: 8px;
  font-family: inherit;
}
</style>
