<template>
  <div class="settings-page" :class="{ 'tv-content-pane': isTvLayoutMode }">
    <PageHeader :title="t('settings.title')" />

    <!-- Learning language (moved from Profile / Me page) -->
    <section class="settings-section">
      <h3 class="section-header">{{ t('learningLang.section') }}</h3>
      <p class="section-desc">{{ t('learningLang.desc') }}</p>
      <div class="lang-pills">
        <button
          v-for="lang in availableLanguages"
          :key="lang.code"
          class="lang-pill"
          :class="{ active: currentTargetLang === lang.code }"
          :disabled="switching"
          @click="onSwitchLang(lang.code)"
        >
          <span class="lang-flag">{{ lang.flag }}</span>
          <span class="lang-name">{{ t(lang.nameKey) }}</span>
          <span v-if="currentTargetLang === lang.code" class="lang-check">✓</span>
        </button>
      </div>

      <h3 class="section-header level-header">{{ t('learningLang.levelSection') }}</h3>
      <p class="section-desc">{{ t('learningLang.levelDesc') }}</p>
      <div class="lang-pills level-pills">
        <button
          v-for="lvl in learningLevels"
          :key="lvl"
          class="lang-pill level-pill"
          :class="{ active: currentLevel === lvl }"
          :disabled="levelSwitching"
          @click="onSwitchLevel(lvl)"
        >
          <span class="lang-name">{{ t(`wizard.levels.${lvl}`) }}</span>
          <span v-if="currentLevel === lvl" class="lang-check">✓</span>
        </button>
      </div>
    </section>

    <!-- AI Configuration (phone + TV) -->
    <section class="settings-section">
      <h3 class="section-header">{{ t('settings.ai') }}</h3>
      <div class="settings-card">
        <SettingsItem :title="t('settings.primaryModel')" :subtitle="t('settings.primaryModelSub')" to="/profile/llm-config" />
        <SettingsItem :title="t('settings.multimodalModel')" :subtitle="t('settings.multimodalModelSub')" to="/profile/multimodal-config" />
        <SettingsItem :title="t('settings.prompts')" :subtitle="t('settings.promptsSub')" to="/prompts" :showDivider="false" />
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
        <SettingsItem
          :title="t('settings.cloudSync')"
          :subtitle="cloudSyncSubtitle"
          :showDivider="true"
          :aria-pressed="cloudSyncEnabled"
          @click="onCloudSyncRowActivate"
        >
          <template #trailing>
            <!-- Decorative switch: whole row is the focusable control for TV remotes. -->
            <span
              class="sync-switch"
              :class="{ disabled: cloudSyncBusy, on: cloudSyncEnabled }"
              aria-hidden="true"
            >
              <span class="sync-switch-track" />
            </span>
          </template>
        </SettingsItem>
        <SettingsItem :title="t('settings.restart')" :subtitle="t('settings.restartSub')" danger @click="showResetDialog = true" :showDivider="false" />
      </div>
    </section>

    <!-- News limit Dialog -->
    <ModalShell
      :show="showNewsDialog"
      :title="t('settings.newsCount')"
      :description="t('settings.newsCountDesc')"
      @close="showNewsDialog = false"
    >
      <div class="dialog-input-row">
        <button class="stepper-btn" :disabled="newsLimit <= 1" @click="newsLimit = Math.max(1, newsLimit - 1)">−</button>
        <span class="stepper-value">{{ newsLimit }}</span>
        <button class="stepper-btn" :disabled="newsLimit >= 20" @click="newsLimit = Math.min(20, newsLimit + 1)">+</button>
      </div>
      <template #actions>
        <button class="dialog-btn" @click="showNewsDialog = false">{{ t('common.cancel') }}</button>
        <button class="dialog-btn primary" @click="saveNewsLimit(); showNewsDialog = false">{{ t('common.ok') }}</button>
      </template>
    </ModalShell>

    <!-- Cloud sync conflict dialog -->
    <ConfirmDialog
      v-if="!isWebMode"
      :show="showCloudSyncConflictDialog"
      :title="t('settings.cloudSyncConflictTitle')"
      :message="t('settings.cloudSyncConflictDesc', { nickname: cloudSyncNickname })"
      :confirm-text="t('settings.cloudSyncConflictConfirm')"
      :cancel-text="t('common.cancel')"
      :confirm-disabled="cloudSyncBusy"
      @cancel="cancelCloudSyncConflict"
      @confirm="confirmCloudSyncConflict"
    />

    <!-- Reset Confirm Dialog -->
    <ConfirmDialog
      :show="showResetDialog"
      :title="t('settings.restart')"
      :message="t('settings.restartDesc')"
      :confirm-text="t('settings.restartConfirm')"
      :cancel-text="t('common.cancel')"
      danger
      @cancel="showResetDialog = false"
      @confirm="confirmReset"
    />
  </div>
</template>

<script setup>
import { ref, onMounted, computed } from "vue";
import { useRouter } from "vue-router";
import PageHeader from "@/shared/components/PageHeader.vue";
import { getSetting, saveSetting } from "@/shared/backend/settings.js";
import { getCloudSyncStatus, setCloudSyncEnabled } from "@/shared/backend/sync.js";
import { getLearningGoals, updateLearningGoalCefr, resetWizard as resetWizardApi } from "@/shared/backend/user.js";
import SettingsItem from "./components/SettingsItem.vue";
import ConfirmDialog from "@/shared/components/ConfirmDialog.vue";
import ModalShell from "@/shared/components/ModalShell.vue";
import { useI18n } from "@/shared/i18n";
import { useTargetLangStore } from "@/stores/targetLang.js";
import { AVAILABLE_LANGUAGES, learningCefrLevels } from "@/shared/constants.js";
import { loadLearningContext } from "@/shared/learningContext.js";
import { pickLearningGoal } from "@/shared/learningGoal.js";
import { isTvLayoutMode, isWebMode } from "@/shared/appMode.js";
import { requestInstallAppPrompt } from "@/shared/installAppPrompt.js";

const router = useRouter();
const { t } = useI18n();
const targetLangStore = useTargetLangStore();

const newsLimit = ref(5);
const showNewsDialog = ref(false);
const showResetDialog = ref(false);
const showCloudSyncConflictDialog = ref(false);
const cloudSyncEnabled = ref(false);
const cloudSyncBusy = ref(false);
const cloudSyncNickname = ref("");
const cloudSyncLastSyncedAt = ref("");
const cloudSyncLastError = ref("");

const user = ref(null);
const goals = ref([]);
const currentTargetLang = computed(() => targetLangStore.code || "");
const currentLevel = ref("A1");
const levelSwitching = ref(false);
const switching = computed(() => targetLangStore.updating);
const availableLanguages = AVAILABLE_LANGUAGES;
const learningLevels = computed(() => learningCefrLevels(currentTargetLang.value));

const cloudSyncSubtitle = computed(() => {
  if (cloudSyncBusy.value) {
    return t("settings.cloudSyncTesting");
  }
  if (cloudSyncLastError.value) {
    return `${t("settings.cloudSyncError")}: ${cloudSyncLastError.value}`;
  }
  const base = t("settings.cloudSyncSub");
  if (!cloudSyncEnabled.value) {
    return base;
  }
  const status = cloudSyncLastSyncedAt.value
    ? t("settings.cloudSyncLastSynced", { time: formatSyncTime(cloudSyncLastSyncedAt.value) })
    : t("settings.cloudSyncNeverSynced");
  return `${base} · ${status}`;
});

function formatSyncTime(iso) {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString();
}

async function loadCloudSyncStatus() {
  try {
    const status = await getCloudSyncStatus();
    cloudSyncEnabled.value = Boolean(status?.enabled);
    cloudSyncNickname.value = status?.nickname || "";
    cloudSyncLastSyncedAt.value = status?.last_synced_at || "";
    cloudSyncLastError.value = status?.last_error || "";
  } catch (e) {
    console.error("Failed to load cloud sync status:", e);
  }
}

async function applyCloudSyncEnabled(enabled, forceEnable = false) {
  cloudSyncBusy.value = true;
  cloudSyncLastError.value = "";
  try {
    const result = await setCloudSyncEnabled(enabled, forceEnable);
    if (!enabled) {
      cloudSyncEnabled.value = false;
      return;
    }
    if (result?.remote_conflict) {
      showCloudSyncConflictDialog.value = true;
      cloudSyncEnabled.value = false;
      return;
    }
    cloudSyncEnabled.value = Boolean(result?.enabled);
    await loadCloudSyncStatus();
  } catch (e) {
    cloudSyncEnabled.value = false;
    cloudSyncLastError.value = e?.message || String(e);
    console.error("Cloud sync toggle failed:", e);
  } finally {
    cloudSyncBusy.value = false;
  }
}

async function onCloudSyncToggle(event) {
  const next = Boolean(event?.target?.checked);
  if (!next) {
    await applyCloudSyncEnabled(false);
    return;
  }
  if (event?.target) event.target.checked = false;
  await applyCloudSyncEnabled(true);
}

/** Whole-row activate (TV remote Enter / click) toggles cloud sync. */
async function onCloudSyncRowActivate() {
  if (isWebMode) {
    requestInstallAppPrompt("cloud-sync");
    return;
  }
  if (cloudSyncBusy.value) return;
  await onCloudSyncToggle({ target: { checked: !cloudSyncEnabled.value } });
}

function cancelCloudSyncConflict() {
  showCloudSyncConflictDialog.value = false;
  cloudSyncEnabled.value = false;
}

async function confirmCloudSyncConflict() {
  showCloudSyncConflictDialog.value = false;
  await applyCloudSyncEnabled(true, true);
}

onMounted(async () => {
  getSetting("news_fetch_limit").then((val) => {
    if (val) newsLimit.value = parseInt(val, 10) || 5;
  }).catch((e) => console.error("Failed to load news fetch limit:", e));
  if (!isWebMode) loadCloudSyncStatus();
  try {
    const ctx = await loadLearningContext({
      targetLangStore,
      fallbackToFirstGoal: true,
    });
    user.value = ctx.user;
    goals.value = ctx.goals;
    if (ctx.currentGoal) currentLevel.value = ctx.cefr;
  } catch (e) {
    console.error("Failed to load learning language settings:", e);
  }
});

async function onSwitchLevel(level) {
  if (levelSwitching.value || level === currentLevel.value) return;
  const lang = currentTargetLang.value;
  const u = user.value;
  if (!lang || !u) return;
  levelSwitching.value = true;
  try {
    await updateLearningGoalCefr(lang, level);
    currentLevel.value = level;
    goals.value = await getLearningGoals(u.id);
  } catch (e) {
    console.error("Failed to update learning level:", e);
  } finally {
    levelSwitching.value = false;
  }
}

async function onSwitchLang(code) {
  if (switching.value || code === currentTargetLang.value) return;
  try {
    await targetLangStore.set(code);
    try {
      const u = user.value;
      if (u) goals.value = await getLearningGoals(u.id);
      const g = pickLearningGoal(goals.value, code);
      if (g) currentLevel.value = g.cefr_level;
    } catch (_) { /* ignore */ }
  } catch (e) {
    console.error("Failed to switch target language:", e);
  }
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
.section-desc {
  font-size: 12px;
  color: var(--text-lighter);
  padding: 0 20px 8px;
  margin: 0;
}
.level-header {
  margin-top: 16px;
}
.lang-pills {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  padding: 0 16px 8px;
}
.lang-pill {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 10px 14px;
  border: 1.5px solid var(--border);
  border-radius: 24px;
  background: var(--surface);
  color: var(--text);
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all var(--transition);
  font-family: inherit;
}
.lang-pill:hover:not(:disabled) {
  border-color: var(--green);
  color: var(--green);
}
.lang-pill.active,
.lang-pill.active:hover:not(:disabled) {
  background: var(--green);
  color: #fff;
  border-color: var(--green);
}
.lang-pill.active:hover:not(:disabled) {
  background: var(--green-hover);
  border-color: var(--green-hover);
}
.lang-pill:disabled {
  opacity: 0.7;
  cursor: not-allowed;
}
.lang-flag {
  font-size: 18px;
  line-height: 1;
}
.lang-check {
  font-weight: 700;
  margin-left: 2px;
}
.settings-card {
  margin: 0 16px;
  border-radius: var(--radius-md);
  overflow: hidden;
  background: var(--surface);
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

/* Dialog action buttons (slotted into ModalShell) */
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

/* Cloud sync switch (visual only; row button owns focus/activation) */
.sync-switch {
  position: relative;
  display: inline-flex;
  align-items: center;
  pointer-events: none;
}
.sync-switch.disabled {
  opacity: 0.5;
}
.sync-switch-track {
  width: 44px;
  height: 24px;
  border-radius: 12px;
  background: var(--outline-variant);
  position: relative;
  transition: background var(--transition);
}
.sync-switch-track::after {
  content: "";
  position: absolute;
  top: 2px;
  left: 2px;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: #fff;
  transition: transform var(--transition);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
}
.sync-switch.on .sync-switch-track {
  background: var(--blue);
}
.sync-switch.on .sync-switch-track::after {
  transform: translateX(20px);
}

/* TV: inset focus for pills / steppers; avoid global scale+outer ring chaos. */
.lang-pill:focus-visible,
.stepper-btn:focus-visible,
.dialog-btn:focus-visible {
  z-index: 2;
  outline: 3px solid #1cb0f6 !important;
  outline-offset: 2px;
  box-shadow: 0 0 0 4px rgba(28, 176, 246, 0.2) !important;
  transform: none !important;
}
.lang-pill.active:focus-visible {
  outline-color: #fff !important;
  box-shadow: 0 0 0 3px #1cb0f6, 0 0 0 6px rgba(28, 176, 246, 0.25) !important;
}
.stepper-btn:focus-visible {
  outline-offset: 3px;
}

/* List rows: allow inset focus rings to paint fully. */
.settings-card {
  overflow: visible;
}
.settings-card :deep(.settings-item:first-child) {
  border-radius: var(--radius-md) var(--radius-md) 0 0;
}
.settings-card :deep(.settings-item:last-child) {
  border-radius: 0 0 var(--radius-md) var(--radius-md);
}
.settings-card :deep(.settings-item:only-child) {
  border-radius: var(--radius-md);
}
</style>
