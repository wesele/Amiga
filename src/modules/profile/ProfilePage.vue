<template>
  <div class="profile-page">
    <header class="page-header">
      <h1 class="page-title">{{ t('profile.title') }}</h1>
    </header>

    <!-- User Account Card -->
    <section class="settings-section">
      <div class="account-card">
        <div class="account-row">
          <div class="account-avatar">
            <StylizedAvatar :id="avatarId" :size="48" />
          </div>
          <div class="account-info">
            <div class="account-name">{{ user?.nickname || t('common.learner') }}</div>
            <div class="account-detail">
              <span v-if="currentTargetLang">{{ t('learningLang.' + currentTargetLang) }} · {{ currentLevel }}</span>
              <span v-else>{{ t('profile.noGoal') }}</span>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- Interface language switcher (promoted from Settings) -->
    <section class="settings-section">
      <h3 class="section-header">{{ t('settings.uiLang') }}</h3>
      <p class="section-desc">{{ t('settings.pickDesc') }}</p>
      <div class="lang-pills">
        <button
          v-for="lang in uiLocales"
          :key="lang.code"
          class="lang-pill"
          :class="{ active: locale === lang.code }"
          @click="onSwitchUiLang(lang.code)"
        >
          <span class="lang-flag">{{ lang.flag }}</span>
          <span class="lang-name">{{ t(lang.nameKey) }}</span>
          <span v-if="locale === lang.code" class="lang-check">✓</span>
        </button>
      </div>
    </section>

    <!-- General Settings -->
    <section class="settings-section">
      <h3 class="section-header">{{ t('profile.general') }}</h3>
      <div class="settings-card">
        <SettingsItem :subtitle="t(learnSettingsSubKey)" to="/profile/settings">
          <template #icon><SettingsIcon /></template>
        </SettingsItem>
        <SettingsItem
          v-if="!isTvMode"
          :title="t('soulmate.settingsTitle')"
          :subtitle="t('soulmate.settingsSub')"
          to="/profile/soulmate"
          :showDivider="false"
        >
          <template #icon>
            <span class="soulmate-settings-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" width="1em" height="1em">
                <path d="M12 4 A8 8 0 0 1 19.6 9.5" stroke="#FF4D9A" stroke-width="2.6" stroke-linecap="round"/>
                <path d="M19.6 9.5 A8 8 0 0 1 16.5 18.3" stroke="#FFC94D" stroke-width="2.6" stroke-linecap="round"/>
                <path d="M16.5 18.3 A8 8 0 0 1 7.5 18.3" stroke="#58cc02" stroke-width="2.6" stroke-linecap="round"/>
                <path d="M7.5 18.3 A8 8 0 0 1 4.4 9.5" stroke="#1cb0f6" stroke-width="2.6" stroke-linecap="round"/>
                <path d="M4.4 9.5 A8 8 0 0 1 12 4" stroke="#9B6DFF" stroke-width="2.6" stroke-linecap="round"/>
                <circle cx="12" cy="12" r="2.9" fill="#FF4D9A"/>
                <circle cx="12" cy="12" r="1.35" fill="#FFC94D"/>
              </svg>
            </span>
          </template>
        </SettingsItem>
      </div>
    </section>

    <!-- About -->
    <section v-if="!isTvMode" class="settings-section">
      <h3 class="section-header">{{ t('profile.about') }}</h3>
      <div class="settings-card">
        <SettingsItem :subtitle="t('profile.checkUpdateSub')" :showArrow="true" @click="handleCheckUpdate" :showDivider="false">
          <template #icon><UpdateIcon /></template>
        </SettingsItem>
      </div>
    </section>

    <!-- Update Dialog -->
    <Teleport to="body">
      <div v-if="showUpdateDialog" class="modal-overlay" @click.self="showUpdateDialog = false">
        <div class="modal-content">
          <div class="modal-header">
            <h3>{{ updateDialog.title }}</h3>
          </div>
          <div class="modal-body" v-if="updateDialog.type === 'available'">
            <div class="version-compare">
              <span class="version-badge current">v{{ updateInfo.current_version }}</span>
              <span class="version-arrow">→</span>
              <span class="version-badge latest">v{{ updateInfo.latest_version }}</span>
            </div>
            <div class="release-notes">
              <h4>{{ t('update.releaseNotes') }}</h4>
              <pre>{{ updateInfo.release_notes }}</pre>
            </div>
            <button
              v-if="primaryUpdateAsset"
              class="btn-update-primary"
              :disabled="installingUpdate"
              @click="handleInstallUpdate"
            >{{ canAutoInstall ? t('update.install') : t('update.download') }}</button>
            <div class="download-section" v-if="updateInfo.download_urls.length > 0">
              <h4>{{ t('update.download') }}</h4>
              <a v-for="asset in updateInfo.download_urls" :key="asset.name" class="download-link" :href="asset.url" target="_blank" @click.prevent="openUrl(asset.url)">
                ⬇ {{ asset.name }}
              </a>
            </div>
            <a class="download-link all-releases" :href="updateInfo.release_url" target="_blank" @click.prevent="openUrl(updateInfo.release_url)">{{ t('update.viewAll') }}</a>
          </div>
          <div class="modal-body" v-else-if="updateDialog.type === 'latest'">
            <div class="up-to-date">
              <div class="up-to-date-icon">✅</div>
              <p>{{ t('profile.upToDateDesc', { version: updateInfo.current_version }) }}</p>
            </div>
          </div>
          <div class="modal-body" v-else-if="updateDialog.type === 'error'">
            <div class="up-to-date">
              <div class="up-to-date-icon">❌</div>
              <p>{{ updateDialog.errorMsg }}</p>
            </div>
          </div>
          <div class="modal-footer">
            <button class="btn-dialog-close" @click="showUpdateDialog = false">{{ t('profile.knowIt') }}</button>
          </div>
        </div>
      </div>
    </Teleport>

  </div>
</template>

<script setup>
import { ref, onMounted, computed } from "vue";
import { checkUpdate } from "@/shared/backend/update.js";
import { openExternalUrl } from "@/shared/external.js";
import { canAutoInstallUpdate, pickPreferredUpdateAsset, startAppUpdate } from "@/shared/update.js";
import SettingsItem from "./components/SettingsItem.vue";
import SettingsIcon from "@/shared/components/SettingsIcon.vue";
import UpdateIcon from "@/shared/components/UpdateIcon.vue";
import StylizedAvatar from "@/shared/components/StylizedAvatar.vue";
import { useI18n } from "@/shared/i18n";
import { useTargetLangStore } from "@/stores/targetLang.js";
import { loadLearningContext } from "@/shared/learningContext.js";
import { isTvMode } from "@/shared/appMode.js";
import { learnSettingsSubtitleKey } from "@/shared/tvPolicy.js";

const { t, locale, setLocale } = useI18n();
const learnSettingsSubKey = learnSettingsSubtitleKey(isTvMode);
const targetLangStore = useTargetLangStore();
const user = ref(null);
const currentTargetLang = computed(() => targetLangStore.code || "");
const currentLevel = ref("A1");
const avatarMapping = {
  "😊": 0, "😎": 1, "🤓": 2, "🌸": 3, "🦊": 4, "🐱": 5, "🐶": 6, "🐻": 7, "🦉": 8, "🌟": 9, "🎯": 10, "🎨": 11
};
const avatarId = computed(() => {
  const av = user.value?.avatar;
  if (typeof av === "number") return av;
  return avatarMapping[av] ?? 0;
});

const uiLocales = [
  { code: "zh", flag: "🇨🇳", nameKey: "lang.zh" },
  { code: "en", flag: "🇬🇧", nameKey: "lang.en" },
  { code: "es", flag: "🇪🇸", nameKey: "lang.es" },
];

onMounted(async () => {
  try {
    const ctx = await loadLearningContext({
      targetLangStore,
      fallbackToFirstGoal: true,
    });
    user.value = ctx.user;
    if (ctx.currentGoal) currentLevel.value = ctx.cefr;
  } catch (e) {
    console.error("Failed to load profile:", e);
  }
});

function onSwitchUiLang(code) {
  if (code === locale.value) return;
  setLocale(code);
}

const showUpdateDialog = ref(false);
const updateInfo = ref({ current_version: "", latest_version: "", has_update: false, release_notes: "", release_url: "", download_urls: [] });
const updateDialog = ref({ type: "", title: "", errorMsg: "" });
const installingUpdate = ref(false);
const primaryUpdateAsset = computed(() => pickPreferredUpdateAsset(updateInfo.value));
const canAutoInstall = computed(() => canAutoInstallUpdate(updateInfo.value));

let checking = false;
async function handleCheckUpdate() {
  if (checking) return;
  checking = true;
  try {
    const info = await checkUpdate();
    updateInfo.value = info;
    updateDialog.value = info.has_update
      ? { type: "available", title: t("profile.updateAvailable") }
      : { type: "latest", title: t("profile.upToDate") };
    showUpdateDialog.value = true;
  } catch (e) {
    updateInfo.value = { current_version: "", latest_version: "", has_update: false, release_notes: "", release_url: "", download_urls: [] };
    updateDialog.value = { type: "error", title: t("profile.updateCheckFail"), errorMsg: e?.toString() || e?.message || "" };
    showUpdateDialog.value = true;
  } finally {
    checking = false;
  }
}

async function openUrl(url) {
  await openExternalUrl(url);
}

async function handleInstallUpdate() {
  if (!primaryUpdateAsset.value || installingUpdate.value) return;
  installingUpdate.value = true;
  try {
    await startAppUpdate(updateInfo.value);
  } finally {
    installingUpdate.value = false;
  }
}

</script>

<style scoped>
.profile-page {
  min-height: 100%;
  background: var(--bg);
  padding-bottom: 24px;
}

/* Header */
.page-header {
  padding: 16px 16px 4px;
}
.page-title {
  font-size: 22px;
  font-weight: 700;
  color: var(--text);
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

/* Account Card */
.account-card {
  margin: 0 16px;
  background: var(--surface);
  border-radius: var(--radius-md);
  overflow: hidden;
}
.account-row {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 16px;
  cursor: pointer;
  transition: background var(--transition);
}
.account-row:hover {
  background: var(--surface-variant);
}
.account-avatar {
  width: 48px;
  height: 48px;
  border-radius: 50%;
  background: transparent;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 24px;
  flex-shrink: 0;
}
.account-info {
  flex: 1;
  min-width: 0;
}
.account-name {
  font-size: 16px;
  font-weight: 500;
  line-height: 1.3;
}
.account-detail {
  font-size: 13px;
  color: var(--text-lighter);
  margin-top: 1px;
}
.av-chevron {
  color: var(--text-lighter);
  flex-shrink: 0;
  opacity: 0.6;
}

/* Update Dialog */
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
.modal-content {
  background: var(--surface);
  border-radius: 20px;
  width: 100%;
  max-width: 360px;
  max-height: 80vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.modal-header {
  padding: 20px 20px 0;
}
.modal-header h3 {
  font-size: 20px;
  font-weight: 500;
  margin: 0;
}
.modal-body {
  flex: 1;
  overflow-y: auto;
  padding: 16px 20px;
}
.modal-footer {
  padding: 8px 20px 20px;
  display: flex;
  justify-content: flex-end;
}
.btn-dialog-close {
  padding: 8px 24px;
  border: none;
  border-radius: 20px;
  background: transparent;
  color: var(--blue);
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  font-family: inherit;
  transition: background var(--transition);
}
.btn-dialog-close:hover {
  background: var(--blue-bg);
}

.version-compare {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  margin-bottom: 16px;
}
.version-badge {
  padding: 6px 16px;
  border-radius: 20px;
  font-size: 14px;
  font-weight: 600;
}
.version-badge.current {
  background: var(--surface-variant);
  color: var(--text-light);
}
.version-badge.latest {
  background: var(--green-bg);
  color: var(--green);
}
.version-arrow {
  font-size: 18px;
  color: var(--text-lighter);
}
.release-notes {
  background: var(--bg);
  border-radius: var(--radius-sm);
  padding: 12px;
  margin-bottom: 16px;
}
.release-notes h4 {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-light);
  margin: 0 0 8px;
}
.release-notes pre {
  font-size: 13px;
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-word;
  color: var(--text);
  margin: 0;
  font-family: inherit;
}
.download-section {
  margin-bottom: 12px;
}
.soulmate-settings-icon {
  display: inline-flex;
  width: 22px;
  height: 22px;
  color: var(--text);
}
.soulmate-settings-icon svg {
  width: 22px;
  height: 22px;
}
.btn-update-primary {
  width: 100%;
  border: none;
  border-radius: 14px;
  background: var(--green);
  color: #fff;
  font-size: 15px;
  font-weight: 700;
  padding: 12px 16px;
  margin-bottom: 14px;
  cursor: pointer;
  transition: background var(--transition), opacity var(--transition);
}
.btn-update-primary:hover:not(:disabled) {
  background: var(--green-hover);
}
.btn-update-primary:disabled {
  opacity: 0.7;
  cursor: wait;
}
.download-section h4 {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-light);
  margin: 0 0 8px;
}
.download-link {
  display: block;
  padding: 10px 12px;
  background: var(--bg);
  border-radius: var(--radius-sm);
  margin-bottom: 6px;
  text-decoration: none;
  color: var(--blue);
  font-size: 14px;
  font-weight: 500;
  transition: background var(--transition);
}
.download-link:hover {
  background: var(--blue-bg);
}
.download-link.all-releases {
  text-align: center;
}
.up-to-date {
  text-align: center;
  padding: 12px 0;
}
.up-to-date-icon {
  font-size: 40px;
  margin-bottom: 8px;
}
.up-to-date p {
  font-size: 15px;
  color: var(--text-light);
  margin: 0;
}
</style>
