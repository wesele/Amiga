<template>
  <div class="settings-page">
    <!-- Top bar -->
    <header class="page-header">
      <button class="back-btn" @click="$router.back()">
        <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor">
          <path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/>
        </svg>
      </button>
      <h1 class="page-title">{{ t('settings.title') }}</h1>
    </header>

    <!-- Interface -->
    <section class="settings-section">
      <h3 class="section-header">{{ t('settings.interface') }}</h3>
      <div class="settings-card">
        <SettingsItem :title="t('settings.uiLang')" :trailingText="currentLangLabel" @click="showLangDialog = true" :showDivider="false" />
      </div>
    </section>

    <!-- AI Configuration -->
    <section class="settings-section">
      <h3 class="section-header">{{ t('settings.ai') }}</h3>
      <div class="settings-card">
        <SettingsItem :title="t('settings.primaryModel')" :subtitle="t('settings.primaryModelSub')" to="/profile/llm-config" :showDivider="false" />
      </div>
    </section>

    <!-- Content -->
    <section class="settings-section">
      <h3 class="section-header">{{ t('settings.content') }}</h3>
      <div class="settings-card">
        <SettingsItem :title="t('settings.newsCount')" :trailingText="String(newsLimit)" @click="showNewsDialog = true" :showDivider="false" />
      </div>
    </section>

    <!-- Data Management -->
    <section class="settings-section">
      <h3 class="section-header">{{ t('settings.data') }}</h3>
      <div class="settings-card">
        <SettingsItem :title="t('settings.restart')" :subtitle="t('settings.restartSub')" danger @click="showResetDialog = true" :showDivider="false" />
      </div>
    </section>

    <!-- Language Dialog -->
    <Teleport to="body">
      <div v-if="showLangDialog" class="modal-overlay" @click.self="showLangDialog = false">
        <div class="modal-content dialog-sm">
          <h3 class="dialog-title">{{ t('settings.pick') }}</h3>
          <p class="dialog-desc">{{ t('settings.pickDesc') }}</p>
          <div class="dialog-options">
            <label
              v-for="opt in langOptions"
              :key="opt.code"
              class="dialog-option"
              :class="{ selected: uiLang === opt.code }"
            >
              <input type="radio" name="lang" :value="opt.code" v-model="uiLang" class="dialog-radio" />
              <span class="dialog-option-text">{{ opt.flag }} {{ opt.label }}</span>
              <span v-if="uiLang === opt.code" class="dialog-check">✓</span>
            </label>
          </div>
          <div class="dialog-actions">
            <button class="dialog-btn" @click="showLangDialog = false">{{ t('common.cancel') }}</button>
            <button class="dialog-btn primary" @click="saveLang(); showLangDialog = false">{{ t('common.ok') }}</button>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- News limit Dialog -->
    <Teleport to="body">
      <div v-if="showNewsDialog" class="modal-overlay" @click.self="showNewsDialog = false">
        <div class="modal-content dialog-sm">
          <h3 class="dialog-title">{{ t('settings.newsCount') }}</h3>
          <p class="dialog-desc">{{ t('settings.newsCountDesc') }}</p>
          <div class="dialog-input-row">
            <button class="stepper-btn" :disabled="newsLimit <= 1" @click="newsLimit = Math.max(1, newsLimit - 1)">−</button>
            <span class="stepper-value">{{ newsLimit }}</span>
            <button class="stepper-btn" :disabled="newsLimit >= 20" @click="newsLimit = Math.min(20, newsLimit + 1)">+</button>
          </div>
          <div class="dialog-actions">
            <button class="dialog-btn" @click="showNewsDialog = false">{{ t('common.cancel') }}</button>
            <button class="dialog-btn primary" @click="saveNewsLimit(); showNewsDialog = false">{{ t('common.ok') }}</button>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- Reset Confirm Dialog -->
    <Teleport to="body">
      <div v-if="showResetDialog" class="modal-overlay" @click.self="showResetDialog = false">
        <div class="modal-content dialog-sm">
          <h3 class="dialog-title">{{ t('settings.restart') }}</h3>
          <p class="dialog-desc">{{ t('settings.restartDesc') }}</p>
          <div class="dialog-actions">
            <button class="dialog-btn" @click="showResetDialog = false">{{ t('common.cancel') }}</button>
            <button class="dialog-btn danger" @click="confirmReset">{{ t('settings.restartConfirm') }}</button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script setup>
import { ref, onMounted, computed } from "vue";
import { useRouter } from "vue-router";
import { resetWizard as resetWizardApi, getSetting, saveSetting } from "@/shared/api.js";
import SettingsItem from "./components/SettingsItem.vue";
import { useI18n } from "@/shared/i18n";

const router = useRouter();
const { t, locale, setLocale } = useI18n();

const uiLang = ref("zh");
const newsLimit = ref(5);
const showLangDialog = ref(false);
const showNewsDialog = ref(false);
const showResetDialog = ref(false);

const langOptions = computed(() => [
  { code: "zh", flag: "🇨🇳", label: t("lang.zh") },
  { code: "en", flag: "🇬🇧", label: t("lang.en") },
  { code: "es", flag: "🇪🇸", label: t("lang.es") },
]);

const currentLangLabel = computed(() => {
  const found = langOptions.value.find((o) => o.code === locale.value);
  return found ? `${found.flag} ${found.label}` : locale.value;
});

onMounted(() => {
  // Initialise the picker from the active i18n locale.
  uiLang.value = locale.value || "zh";
  try {
    getSetting("news_fetch_limit").then((val) => {
      if (val) newsLimit.value = parseInt(val, 10) || 5;
    });
  } catch (e) {
    console.error("Failed to load news limit:", e);
  }
});

function saveLang() {
  // setLocale handles persistence to app_settings under "ui_language" and
  // broadcasts the change to every component that calls useI18n().
  setLocale(uiLang.value);
}

function saveNewsLimit() {
  saveSetting("news_fetch_limit", String(newsLimit.value)).catch(console.error);
}

function confirmReset() {
  showResetDialog.value = false;
  resetWizardApi().then(() => {
    router.push("/wizard");
  }).catch(console.error);
}
</script>

<style scoped>
.settings-page {
  min-height: 100%;
  background: var(--bg);
  padding-bottom: 24px;
}

/* Header */
.page-header {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 8px 4px;
  background: var(--surface);
  border-bottom: 1px solid var(--border);
  position: sticky;
  top: 0;
  z-index: 10;
}
.back-btn {
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  background: none;
  color: var(--text);
  cursor: pointer;
  border-radius: 50%;
  transition: background var(--transition);
  flex-shrink: 0;
}
.back-btn:hover {
  background: var(--surface-variant);
}
.page-title {
  font-size: 20px;
  font-weight: 500;
  margin: 0;
}

/* Section */
.settings-section {
  margin: 12px 0;
}
.section-header {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-light);
  padding: 0 20px;
  margin-bottom: 4px;
}
.settings-card {
  margin: 0 16px;
  border-radius: var(--radius-md);
  overflow: hidden;
  background: var(--surface);
}

/* Dialog */
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: 24px;
}
.modal-content.dialog-sm {
  background: var(--surface);
  border-radius: 20px;
  width: 100%;
  max-width: 320px;
  padding: 24px 24px 16px;
}
.dialog-title {
  font-size: 20px;
  font-weight: 500;
  margin: 0 0 4px;
}
.dialog-desc {
  font-size: 14px;
  color: var(--text-lighter);
  margin: 8px 0 16px;
  line-height: 1.4;
}

/* Dialog radio options */
.dialog-options {
  margin: 12px 0 8px;
}
.dialog-option {
  display: flex;
  align-items: center;
  padding: 14px 4px;
  cursor: pointer;
  border-radius: var(--radius-sm);
  transition: background var(--transition);
}
.dialog-option:hover {
  background: var(--surface-variant);
}
.dialog-radio {
  appearance: none;
  width: 20px;
  height: 20px;
  border: 2px solid var(--outline-variant);
  border-radius: 50%;
  margin-right: 14px;
  position: relative;
  transition: border-color var(--transition);
  flex-shrink: 0;
}
.dialog-radio:checked {
  border-color: var(--blue);
}
.dialog-radio:checked::after {
  content: "";
  position: absolute;
  inset: 3px;
  border-radius: 50%;
  background: var(--blue);
}
.dialog-option-text {
  flex: 1;
  font-size: 16px;
}
.dialog-check {
  color: var(--blue);
  font-weight: 600;
  font-size: 18px;
}

/* Stepper */
.dialog-input-row {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 20px;
  margin: 16px 0 8px;
}
.stepper-btn {
  width: 44px;
  height: 44px;
  border: 1px solid var(--border);
  border-radius: 50%;
  background: var(--surface);
  font-size: 22px;
  color: var(--text);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all var(--transition);
  font-family: inherit;
}
.stepper-btn:hover:not(:disabled) {
  border-color: var(--blue);
  color: var(--blue);
}
.stepper-btn:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}
.stepper-value {
  font-size: 24px;
  font-weight: 500;
  min-width: 32px;
  text-align: center;
}

/* Dialog actions */
.dialog-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 16px;
}
.dialog-btn {
  padding: 8px 20px;
  border: none;
  border-radius: 20px;
  background: transparent;
  color: var(--text);
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  font-family: inherit;
  transition: background var(--transition);
}
.dialog-btn:hover {
  background: var(--surface-variant);
}
.dialog-btn.primary {
  color: var(--blue);
}
.dialog-btn.danger {
  color: var(--red);
}
.dialog-btn.primary:hover {
  background: var(--blue-bg);
}
.dialog-btn.danger:hover {
  background: var(--red-bg);
}
</style>
