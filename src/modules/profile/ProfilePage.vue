<template>
  <div class="profile-page">
    <header class="page-header">
      <h1 class="page-title">{{ t('profile.title') }}</h1>
    </header>

    <!-- User Account Card -->
    <section class="settings-section">
      <div class="account-card">
        <div class="account-row">
          <div class="account-avatar">{{ user?.avatar || '😊' }}</div>
          <div class="account-info">
            <div class="account-name">{{ user?.nickname || t('common.learner') }}</div>
            <div class="account-detail">
              <span v-if="currentTargetLang">{{ t('learningLang.' + currentTargetLang) }} · {{ currentLevel }}</span>
              <span v-else>{{ t('profile.noGoal') }}</span>
            </div>
          </div>
        </div>
        <div class="stats-row" :class="{ 'has-accuracy': showPracticeAccuracy }">
          <div class="stat-cell">
            <div class="stat-value">{{ learningStreak?.current || 0 }}</div>
            <div class="stat-label">{{ t('profile.streak') }}</div>
          </div>
          <div class="stat-divider" />
          <div class="stat-cell">
            <div class="stat-value">{{ vocabStats?.total_known || 0 }}</div>
            <div class="stat-label">{{ t('profile.words') }}</div>
          </div>
          <div class="stat-divider" />
          <div class="stat-cell">
            <div class="stat-value">{{ readArticleCount }}</div>
            <div class="stat-label">{{ t('profile.articles') }}</div>
          </div>
          <template v-if="showPracticeAccuracy">
            <div class="stat-divider" />
            <div class="stat-cell">
              <div
                class="stat-value"
                :class="accuracyValueClass(practiceAccuracy.accuracyPct)"
              >
                {{ practiceAccuracy.accuracyPct }}%
              </div>
              <div class="stat-label">{{ t('profile.accuracy') }}</div>
            </div>
          </template>
        </div>
        <button
          type="button"
          class="share-progress-btn"
          :disabled="sharing"
          @click="onShareProgress"
        >
          📤 {{ t('profile.shareProgress') }}
        </button>
        <p v-if="shareStatus" class="share-status" role="status">{{ shareStatus }}</p>
      </div>
    </section>

    <section v-if="showWeakAreas" class="settings-section">
      <h3 class="section-header">{{ t('profile.weakAreas') }}</h3>
      <p class="section-desc">{{ t('profile.weakAreasDesc') }}</p>
      <div class="weak-areas-card">
        <button
          v-for="(area, index) in practiceWeakAreas"
          :key="area.typeId"
          type="button"
          class="weak-area-item"
          :class="{ 'has-divider': index < practiceWeakAreas.length - 1 }"
          @click="goToFocusPractice(area.typeId)"
        >
          <div class="weak-area-header">
            <span class="weak-area-type">{{ t(focusAreaTypeKey(area.typeId)) }}</span>
            <span
              class="weak-area-pct"
              :class="accuracyValueClass(area.accuracyPct)"
            >
              {{ area.accuracyPct }}%
            </span>
          </div>
          <p class="weak-area-tip">{{ t(focusAreaTipKey(area.typeId)) }}</p>
        </button>
      </div>
    </section>

    <!-- Learning language switcher -->
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

    <!-- General Settings -->
    <section class="settings-section">
      <h3 class="section-header">{{ t('profile.general') }}</h3>
      <div class="settings-card">
        <SettingsItem icon="⚙️" :title="t('settings.title')" :subtitle="t('profile.learnSettingsSub')" to="/profile/settings" />
      </div>
    </section>

    <!-- About -->
    <section class="settings-section">
      <h3 class="section-header">{{ t('profile.about') }}</h3>
      <div class="settings-card">
        <SettingsItem icon="🔄" :title="t('profile.checkUpdate')" :subtitle="t('profile.checkUpdateSub')" :showArrow="true" @click="handleCheckUpdate" :showDivider="false" />
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
import { useRouter } from "vue-router";
import {
  getLearningGoals,
  getUserVocabStats,
  getReadArticleCount,
  getLearningStreak,
  checkUpdate,
  updateLearningGoalCefr,
  shareText as nativeShareText,
} from "@/shared/api.js";
import { openExternalUrl } from "@/shared/external.js";
import { canAutoInstallUpdate, pickPreferredUpdateAsset, startAppUpdate } from "@/shared/update.js";
import SettingsItem from "./components/SettingsItem.vue";
import { useI18n } from "@/shared/i18n";
import { useTargetLangStore } from "@/stores/targetLang.js";
import { AVAILABLE_LANGUAGES, LEARNING_CEFR_LEVELS } from "@/shared/constants.js";
import { loadLearningContext } from "@/shared/learningContext.js";
import { pickLearningGoal } from "@/shared/learningGoal.js";
import { shareLearningProgress } from "./shareProgress.js";
import {
  focusAreaTipKey,
  focusAreaTypeKey,
  pairStatsKey,
} from "@/modules/learn/questionTypeStats.js";
import {
  accuracyValueClass,
  buildPracticeAccuracy,
  shouldShowPracticeAccuracy,
} from "./practiceAccuracy.js";
import {
  buildPracticeWeakAreas,
  shouldShowPracticeWeakAreas,
} from "./practiceWeakAreas.js";
import { recordAccuracyPeak } from "./accuracyPeakStats.js";
import { focusPracticeRoute } from "@/modules/path/focusPracticeRoute.js";

const router = useRouter();
const { t } = useI18n();
const targetLangStore = useTargetLangStore();
const user = ref(null);
const goals = ref([]);
const vocabStats = ref(null);
const readArticleCount = ref(0);
const learningStreak = ref(null);
const practiceAccuracy = ref(null);
const showPracticeAccuracy = computed(() =>
  shouldShowPracticeAccuracy(practiceAccuracy.value),
);
const practiceWeakAreas = ref([]);
const showWeakAreas = computed(() =>
  shouldShowPracticeWeakAreas(practiceWeakAreas.value),
);
const sharing = ref(false);
const shareStatus = ref("");
let shareStatusTimer = null;
const currentTargetLang = computed(() => targetLangStore.code || "");
const targetLangLabel = computed(() =>
  currentTargetLang.value ? t(`learningLang.${currentTargetLang.value}`) : "",
);
const currentLevel = ref("A1");
const levelSwitching = ref(false);
const switching = computed(() => targetLangStore.updating);
const availableLanguages = AVAILABLE_LANGUAGES;
const learningLevels = LEARNING_CEFR_LEVELS;

onMounted(async () => {
  try {
    const ctx = await loadLearningContext({
      targetLangStore,
      fallbackToFirstGoal: true,
    });
    user.value = ctx.user;
    goals.value = ctx.goals;
    vocabStats.value = await getUserVocabStats(user.value.id, currentTargetLang.value);
    readArticleCount.value = await getReadArticleCount(user.value.id);
    learningStreak.value = await getLearningStreak(user.value.id);
    refreshPracticeAccuracy(ctx.user.native_language, currentTargetLang.value);
    refreshPracticeWeakAreas(ctx.user.native_language, currentTargetLang.value);
    if (ctx.currentGoal) currentLevel.value = ctx.cefr;
  } catch (e) {
    console.error("Failed to load profile:", e);
  }
});

function goToFocusPractice(typeId) {
  router.push(focusPracticeRoute(typeId));
}

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

function refreshPracticeAccuracy(nativeLang, targetLang) {
  if (!nativeLang || !targetLang) {
    practiceAccuracy.value = null;
    return;
  }
  const pairKey = pairStatsKey(nativeLang, targetLang);
  practiceAccuracy.value = buildPracticeAccuracy(pairKey);
  recordAccuracyPeak(pairKey);
}

function refreshPracticeWeakAreas(nativeLang, targetLang) {
  if (!nativeLang || !targetLang) {
    practiceWeakAreas.value = [];
    return;
  }
  practiceWeakAreas.value = buildPracticeWeakAreas(pairStatsKey(nativeLang, targetLang));
}

async function onSwitchLang(code) {
  if (switching.value || code === currentTargetLang.value) return;
  try {
    await targetLangStore.set(code);
    // Refresh goals list so the level summary updates.
    try {
      const u = user.value;
      if (u) {
        goals.value = await getLearningGoals(u.id);
        refreshPracticeAccuracy(u.native_language, code);
        refreshPracticeWeakAreas(u.native_language, code);
      }
      const g = pickLearningGoal(goals.value, code);
      if (g) currentLevel.value = g.cefr_level;
    } catch (_) { /* ignore */ }
  } catch (e) {
    console.error("Failed to switch target language:", e);
  }
}

const showUpdateDialog = ref(false);
const updateInfo = ref({ current_version: "", latest_version: "", has_update: false, release_notes: "", release_url: "", download_urls: [] });
const updateDialog = ref({ type: "", title: "", errorMsg: "" });
const installingUpdate = ref(false);
const primaryUpdateAsset = computed(() => pickPreferredUpdateAsset(updateInfo.value));
const canAutoInstall = computed(() => canAutoInstallUpdate(updateInfo.value));

function showShareStatus(message) {
  shareStatus.value = message;
  if (shareStatusTimer) clearTimeout(shareStatusTimer);
  shareStatusTimer = setTimeout(() => {
    shareStatus.value = "";
    shareStatusTimer = null;
  }, 2500);
}

async function onShareProgress() {
  if (sharing.value) return;
  sharing.value = true;
  try {
    await shareLearningProgress({
      nickname: user.value?.nickname || t("common.learner"),
      targetLangLabel: targetLangLabel.value,
      level: currentLevel.value,
      streakCurrent: learningStreak.value?.current || 0,
      streakLongest: learningStreak.value?.longest || 0,
      wordsKnown: vocabStats.value?.total_known || 0,
      articlesRead: readArticleCount.value,
      practiceAccuracyPct: practiceAccuracy.value?.accuracyPct ?? null,
      t,
      nativeShareText,
      showShareStatus,
    });
  } finally {
    sharing.value = false;
  }
}

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
  background: var(--green-bg);
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

/* Stats row */
.stats-row {
  display: flex;
  align-items: center;
  border-top: 1px solid var(--border);
  padding: 4px 0;
}
.stats-row.has-accuracy {
  display: grid;
  grid-template-columns: 1fr 1fr;
}
.stats-row.has-accuracy .stat-divider {
  display: none;
}
.stat-cell {
  flex: 1;
  text-align: center;
  padding: 10px 4px;
}
.stat-value {
  font-size: 18px;
  font-weight: 600;
  color: var(--green);
}
.stat-value.tier-excellent {
  color: #2e9e44;
}
.stat-value.tier-good {
  color: var(--green);
}
.stat-value.tier-fair {
  color: #c47d00;
}
.stat-value.tier-needs_work {
  color: #d64545;
}
.stat-label {
  font-size: 11px;
  color: var(--text-lighter);
  margin-top: 1px;
}
.stat-divider {
  width: 1px;
  height: 32px;
  background: var(--border);
  flex-shrink: 0;
}

.weak-areas-card {
  margin: 0 16px;
  background: var(--surface);
  border-radius: var(--radius-md);
  overflow: hidden;
}

.weak-area-item {
  display: block;
  width: 100%;
  padding: 12px 14px;
  border: none;
  background: transparent;
  text-align: left;
  font-family: inherit;
  cursor: pointer;
}

.weak-area-item:hover {
  background: var(--white);
}

.weak-area-item.has-divider {
  border-bottom: 1px solid var(--border);
}

.weak-area-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.weak-area-type {
  font-size: 14px;
  font-weight: 600;
  color: var(--text);
}

.weak-area-pct {
  font-size: 14px;
  font-weight: 700;
  flex-shrink: 0;
}

.weak-area-pct.tier-excellent {
  color: #2e9e44;
}

.weak-area-pct.tier-good {
  color: var(--green);
}

.weak-area-pct.tier-fair {
  color: #c47d00;
}

.weak-area-pct.tier-needs_work {
  color: #d64545;
}

.weak-area-tip {
  margin: 4px 0 0;
  font-size: 12px;
  line-height: 1.45;
  color: var(--text-lighter);
}

.share-progress-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  width: 100%;
  padding: 12px 16px;
  border: none;
  border-top: 1px solid var(--border);
  background: transparent;
  color: var(--green);
  font-size: 14px;
  font-weight: 500;
  font-family: inherit;
  cursor: pointer;
  transition: background var(--transition);
}

.share-progress-btn:hover:not(:disabled) {
  background: var(--green-bg);
}

.share-progress-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.share-status {
  margin: 0;
  padding: 0 16px 10px;
  font-size: 12px;
  color: var(--text-lighter);
  text-align: center;
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
