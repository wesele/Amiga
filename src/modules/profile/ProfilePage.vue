<template>
  <div class="profile-page">
    <!-- Profile Header -->
    <div class="profile-header">
      <div class="avatar-large">{{ user?.avatar || '😊' }}</div>
      <h2 class="profile-name">{{ user?.nickname || '学习者' }}</h2>
      <div class="profile-lang">
        <span v-if="goals.length > 0" class="lang-badge">
          {{ langLabel(goals[0].target_language) }} · {{ goals[0].cefr_level }}
        </span>
      </div>
    </div>

    <!-- Stats Grid -->
    <div class="stats-grid">
      <div class="stat-item">
        <div class="stat-value">0</div>
        <div class="stat-label">学习天数</div>
      </div>
      <div class="stat-item">
        <div class="stat-value">{{ vocabStats?.total_known || 0 }}</div>
        <div class="stat-label">已掌握词汇</div>
      </div>
      <div class="stat-item">
        <div class="stat-value">0</div>
        <div class="stat-label">已读文章</div>
      </div>
      <div class="stat-item">
        <div class="stat-value">0</div>
        <div class="stat-label">连续天数</div>
      </div>
    </div>

    <!-- Menu -->
    <div class="menu-list">
      <router-link to="/profile/settings" class="menu-item">
        <div class="menu-icon">⚙️</div>
        <span class="menu-label">设置</span>
        <span class="menu-arrow">›</span>
      </router-link>
      <router-link to="/prompts" class="menu-item">
        <div class="menu-icon">🤖</div>
        <span class="menu-label">提示词管理</span>
        <span class="menu-arrow">›</span>
      </router-link>
      <a class="menu-item" @click.prevent="handleCheckUpdate">
        <div class="menu-icon">🔄</div>
        <span class="menu-label">检查新版本</span>
        <span v-if="checking" class="checking-spinner">⋯</span>
        <span v-else class="menu-arrow">›</span>
      </a>
    </div>

    <!-- Update Dialog -->
    <Teleport to="body">
      <div v-if="showUpdateDialog" class="modal-overlay" @click.self="showUpdateDialog = false">
        <div class="modal-content">
          <div class="modal-header">
            <h3>{{ updateDialog.title }}</h3>
            <button class="modal-close" @click="showUpdateDialog = false">✕</button>
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
              <a
                v-for="asset in updateInfo.download_urls"
                :key="asset.name"
                class="download-link"
                :href="asset.url"
                target="_blank"
                @click.prevent="openUrl(asset.url)"
              >
                ⬇ {{ asset.name }}
              </a>
            </div>
            <a class="download-link all-releases" :href="updateInfo.release_url" target="_blank" @click.prevent="openUrl(updateInfo.release_url)">
              查看所有版本 →
            </a>
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
            <button class="btn-close" @click="showUpdateDialog = false">关闭</button>
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

const checking = ref(false);
const showUpdateDialog = ref(false);
const updateInfo = ref({ current_version: "", latest_version: "", has_update: false, release_notes: "", release_url: "", download_urls: [] });
const updateDialog = ref({ type: "", title: "", errorMsg: "" });

async function handleCheckUpdate() {
  checking.value = true;
  try {
    const info = await checkUpdate();
    updateInfo.value = info;
    if (info.has_update) {
      updateDialog.value = { type: "available", title: "发现新版本！" };
    } else {
      updateDialog.value = { type: "latest", title: "已是最新版本" };
    }
    showUpdateDialog.value = true;
  } catch (e) {
    updateInfo.value = { current_version: "", latest_version: "", has_update: false, release_notes: "", release_url: "", download_urls: [] };
    updateDialog.value = { type: "error", title: "检查更新失败", errorMsg: e?.toString() || "网络请求失败，请检查网络连接" };
    showUpdateDialog.value = true;
  } finally {
    checking.value = false;
  }
}

async function openUrl(url) {
  try {
    await open(url);
  } catch {
    window.open(url, "_blank");
  }
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
}

.profile-header {
  background: var(--surface);
  padding: 32px 20px 20px;
  text-align: center;
  border-bottom: 1px solid var(--border);
}

.avatar-large {
  width: 72px;
  height: 72px;
  border-radius: 50%;
  background: var(--green-bg);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 36px;
  margin: 0 auto 12px;
  border: 3px solid var(--green);
}

.profile-name {
  font-size: 20px;
  font-weight: 800;
  margin-bottom: 6px;
}

.profile-lang {
  margin-top: 4px;
}

.lang-badge {
  font-size: 13px;
  font-weight: 600;
  padding: 4px 14px;
  border-radius: 16px;
  background: var(--blue-bg);
  color: var(--blue);
}

.stats-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1px;
  background: var(--border);
  margin: 16px;
  border-radius: var(--radius-md);
  overflow: hidden;
}

.stat-item {
  background: var(--surface);
  padding: 16px 12px;
  text-align: center;
}

.stat-value {
  font-size: 24px;
  font-weight: 800;
  color: var(--green);
}

.stat-label {
  font-size: 11px;
  color: var(--text-lighter);
  margin-top: 2px;
}

.menu-list {
  background: var(--surface);
  margin: 0 16px;
  border-radius: var(--radius-md);
  overflow: hidden;
}

.menu-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px;
  text-decoration: none;
  color: var(--text);
  border-bottom: 1px solid var(--border);
  transition: background var(--transition);
}

.menu-item:last-child {
  border-bottom: none;
}

.menu-item:hover {
  background: var(--surface-variant);
}

.menu-icon {
  font-size: 20px;
  flex-shrink: 0;
}

.menu-label {
  flex: 1;
  font-size: 15px;
  font-weight: 500;
}

.menu-arrow {
  font-size: 20px;
  color: var(--text-lighter);
}

.checking-spinner {
  font-size: 18px;
  color: var(--green);
  animation: pulse 0.8s infinite;
}

@keyframes pulse {
  0%, 100% { opacity: 0.3; }
  50% { opacity: 1; }
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
  padding: 20px;
}

.modal-content {
  background: var(--bg);
  border-radius: var(--radius-lg);
  width: 100%;
  max-width: 380px;
  max-height: 90vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid var(--border);
}

.modal-header h3 {
  font-size: 16px;
  font-weight: 700;
  margin: 0;
}

.modal-close {
  width: 32px;
  height: 32px;
  border: none;
  background: none;
  font-size: 18px;
  cursor: pointer;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-lighter);
}

.modal-close:hover {
  background: var(--surface-variant);
}

.modal-body {
  flex: 1;
  overflow-y: auto;
  padding: 20px;
}

.modal-footer {
  padding: 12px 20px;
  border-top: 1px solid var(--border);
  text-align: center;
}

.btn-close {
  padding: 10px 32px;
  border: none;
  border-radius: var(--radius-sm);
  background: var(--surface-variant);
  color: var(--text);
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
}

.btn-close:hover {
  background: var(--border);
}

.version-compare {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  margin-bottom: 20px;
}

.version-badge {
  padding: 6px 16px;
  border-radius: 20px;
  font-size: 14px;
  font-weight: 700;
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
  font-size: 20px;
  color: var(--text-lighter);
}

.release-notes {
  background: var(--surface);
  border-radius: var(--radius-sm);
  padding: 12px;
  margin-bottom: 16px;
}

.release-notes h4 {
  font-size: 12px;
  font-weight: 700;
  color: var(--text-light);
  text-transform: uppercase;
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
  font-weight: 700;
  color: var(--text-light);
  text-transform: uppercase;
  margin: 0 0 8px;
}

.download-link {
  display: block;
  padding: 10px 12px;
  background: var(--surface);
  border-radius: var(--radius-sm);
  margin-bottom: 6px;
  text-decoration: none;
  color: var(--blue);
  font-size: 14px;
  font-weight: 600;
  transition: background var(--transition);
}

.download-link:hover {
  background: var(--blue-bg);
}

.download-link.all-releases {
  text-align: center;
  background: transparent;
  border: 1px solid var(--border);
}

.up-to-date {
  text-align: center;
  padding: 20px 0;
}

.up-to-date-icon {
  font-size: 48px;
  margin-bottom: 12px;
}

.up-to-date p {
  font-size: 15px;
  color: var(--text-light);
  margin: 0;
}
</style>
