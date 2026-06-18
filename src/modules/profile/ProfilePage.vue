<template>
  <div class="profile-page">
    <header class="page-header">
      <h1 class="page-title">学习设置</h1>
    </header>

    <!-- User Account Card -->
    <section class="settings-section">
      <div class="account-card">
        <div class="account-row" @click="$router.push('/profile/settings')">
          <div class="account-avatar">{{ user?.avatar || '😊' }}</div>
          <div class="account-info">
            <div class="account-name">{{ user?.nickname || '学习者' }}</div>
            <div class="account-detail">
              <span v-if="goals.length > 0">{{ langLabel(goals[0].target_language) }} · {{ goals[0].cefr_level }}</span>
              <span v-else>未设置学习目标</span>
            </div>
          </div>
          <svg class="av-chevron" viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
            <path d="M9.29 15.88L13.17 12 9.29 8.12a.996.996 0 111.41-1.41l4.59 4.59c.39.39.39 1.02 0 1.41L10.7 15.3a.996.996 0 01-1.41 0c-.38-.39-.39-1.03 0-1.42z"/>
          </svg>
        </div>
        <div class="stats-row">
          <div class="stat-cell">
            <div class="stat-value">0</div>
            <div class="stat-label">学习天数</div>
          </div>
          <div class="stat-divider" />
          <div class="stat-cell">
            <div class="stat-value">{{ vocabStats?.total_known || 0 }}</div>
            <div class="stat-label">已掌握词汇</div>
          </div>
          <div class="stat-divider" />
          <div class="stat-cell">
            <div class="stat-value">0</div>
            <div class="stat-label">已读文章</div>
          </div>
          <div class="stat-divider" />
          <div class="stat-cell">
            <div class="stat-value">0</div>
            <div class="stat-label">连续天数</div>
          </div>
        </div>
      </div>
    </section>

    <!-- General Settings -->
    <section class="settings-section">
      <h3 class="section-header">通用</h3>
      <div class="settings-card">
        <SettingsItem icon="⚙️" title="设置" subtitle="界面语言、AI 配置、新闻设置" to="/profile/settings" />
        <SettingsItem icon="🤖" title="提示词管理" subtitle="管理 AI 对话提示词" to="/prompts" :showDivider="false" />
      </div>
    </section>

    <!-- About -->
    <section class="settings-section">
      <h3 class="section-header">关于</h3>
      <div class="settings-card">
        <SettingsItem icon="🔄" title="检查更新" subtitle="检查新版本" :showArrow="true" @click="handleCheckUpdate" :showDivider="false" />
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
              <h4>更新内容</h4>
              <pre>{{ updateInfo.release_notes }}</pre>
            </div>
            <div class="download-section" v-if="updateInfo.download_urls.length > 0">
              <h4>下载</h4>
              <a v-for="asset in updateInfo.download_urls" :key="asset.name" class="download-link" :href="asset.url" target="_blank" @click.prevent="openUrl(asset.url)">
                ⬇ {{ asset.name }}
              </a>
            </div>
            <a class="download-link all-releases" :href="updateInfo.release_url" target="_blank" @click.prevent="openUrl(updateInfo.release_url)">查看所有版本 →</a>
          </div>
          <div class="modal-body" v-else-if="updateDialog.type === 'latest'">
            <div class="up-to-date">
              <div class="up-to-date-icon">✅</div>
              <p>当前已是最新版本 (v{{ updateInfo.current_version }})</p>
            </div>
          </div>
          <div class="modal-body" v-else-if="updateDialog.type === 'error'">
            <div class="up-to-date">
              <div class="up-to-date-icon">❌</div>
              <p>{{ updateDialog.errorMsg }}</p>
            </div>
          </div>
          <div class="modal-footer">
            <button class="btn-dialog-close" @click="showUpdateDialog = false">知道了</button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script setup>
import { ref, onMounted } from "vue";
import { getCurrentUser, getLearningGoals, getUserVocabStats, checkUpdate } from "@/shared/api.js";
import { open } from "@tauri-apps/plugin-shell";
import SettingsItem from "./components/SettingsItem.vue";

const user = ref(null);
const goals = ref([]);
const vocabStats = ref(null);

onMounted(async () => {
  try {
    user.value = await getCurrentUser();
    goals.value = await getLearningGoals(user.value.id);
    vocabStats.value = await getUserVocabStats(user.value.id);
  } catch (e) {
    console.error("Failed to load profile:", e);
  }
});

const showUpdateDialog = ref(false);
const updateInfo = ref({ current_version: "", latest_version: "", has_update: false, release_notes: "", release_url: "", download_urls: [] });
const updateDialog = ref({ type: "", title: "", errorMsg: "" });

let checking = false;
async function handleCheckUpdate() {
  if (checking) return;
  checking = true;
  try {
    const info = await checkUpdate();
    updateInfo.value = info;
    updateDialog.value = info.has_update
      ? { type: "available", title: "发现新版本" }
      : { type: "latest", title: "已是最新版本" };
    showUpdateDialog.value = true;
  } catch (e) {
    updateInfo.value = { current_version: "", latest_version: "", has_update: false, release_notes: "", release_url: "", download_urls: [] };
    updateDialog.value = { type: "error", title: "检查更新失败", errorMsg: e?.toString() || "网络请求失败，请检查网络连接" };
    showUpdateDialog.value = true;
  } finally {
    checking = false;
  }
}

async function openUrl(url) {
  try { await open(url); } catch { window.open(url, "_blank"); }
}

function langLabel(code) {
  const map = { es: "西班牙语", zh: "中文", en: "英语", ja: "日语", fr: "法语" };
  return map[code] || code;
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
