<template>
  <div class="settings-page">
    <!-- Top bar -->
    <header class="page-header">
      <button class="back-btn" @click="$router.back()">
        <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor">
          <path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/>
        </svg>
      </button>
      <h1 class="page-title">设置</h1>
    </header>

    <!-- Interface -->
    <section class="settings-section">
      <h3 class="section-header">界面</h3>
      <div class="settings-card">
        <SettingsItem title="界面语言" :trailingText="uiLang === 'zh' ? '中文' : 'English'" @click="showLangDialog = true" :showDivider="false" />
      </div>
    </section>

    <!-- AI Configuration -->
    <section class="settings-section">
      <h3 class="section-header">AI 配置</h3>
      <div class="settings-card">
        <SettingsItem title="主模型配置" subtitle="设置 API Key、模型等" to="/profile/llm-config/primary" />
        <SettingsItem title="备用模型配置" subtitle="主模型失败时自动切换" to="/profile/llm-config/fallback" :showDivider="false" />
      </div>
    </section>

    <!-- Content -->
    <section class="settings-section">
      <h3 class="section-header">内容</h3>
      <div class="settings-card">
        <SettingsItem title="新闻获取数量" :trailingText="`${newsLimit} 条`" @click="showNewsDialog = true" :showDivider="false" />
      </div>
    </section>

    <!-- Data Management -->
    <section class="settings-section">
      <h3 class="section-header">数据管理</h3>
      <div class="settings-card">
        <SettingsItem title="重新开始向导" subtitle="清除学习数据并重新设置" danger @click="showResetDialog = true" :showDivider="false" />
      </div>
    </section>

    <!-- Language Dialog -->
    <Teleport to="body">
      <div v-if="showLangDialog" class="modal-overlay" @click.self="showLangDialog = false">
        <div class="modal-content dialog-sm">
          <h3 class="dialog-title">界面语言</h3>
          <div class="dialog-options">
            <label class="dialog-option" :class="{ selected: uiLang === 'zh' }">
              <input type="radio" name="lang" value="zh" v-model="uiLang" class="dialog-radio" />
              <span class="dialog-option-text">中文</span>
              <span v-if="uiLang === 'zh'" class="dialog-check">✓</span>
            </label>
            <label class="dialog-option" :class="{ selected: uiLang === 'en' }">
              <input type="radio" name="lang" value="en" v-model="uiLang" class="dialog-radio" />
              <span class="dialog-option-text">English</span>
              <span v-if="uiLang === 'en'" class="dialog-check">✓</span>
            </label>
          </div>
          <div class="dialog-actions">
            <button class="dialog-btn" @click="showLangDialog = false">取消</button>
            <button class="dialog-btn primary" @click="saveLang; showLangDialog = false">确定</button>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- News limit Dialog -->
    <Teleport to="body">
      <div v-if="showNewsDialog" class="modal-overlay" @click.self="showNewsDialog = false">
        <div class="modal-content dialog-sm">
          <h3 class="dialog-title">新闻获取数量</h3>
          <p class="dialog-desc">每次刷新时获取的文章数量</p>
          <div class="dialog-input-row">
            <button class="stepper-btn" :disabled="newsLimit <= 1" @click="newsLimit = Math.max(1, newsLimit - 1)">−</button>
            <span class="stepper-value">{{ newsLimit }}</span>
            <button class="stepper-btn" :disabled="newsLimit >= 20" @click="newsLimit = Math.min(20, newsLimit + 1)">+</button>
          </div>
          <div class="dialog-actions">
            <button class="dialog-btn" @click="showNewsDialog = false">取消</button>
            <button class="dialog-btn primary" @click="saveNewsLimit; showNewsDialog = false">确定</button>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- Reset Confirm Dialog -->
    <Teleport to="body">
      <div v-if="showResetDialog" class="modal-overlay" @click.self="showResetDialog = false">
        <div class="modal-content dialog-sm">
          <h3 class="dialog-title">重新开始向导</h3>
          <p class="dialog-desc">这将清除你的学习数据并重新进入新用户向导。此操作不可撤销。</p>
          <div class="dialog-actions">
            <button class="dialog-btn" @click="showResetDialog = false">取消</button>
            <button class="dialog-btn danger" @click="confirmReset">确定重置</button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script setup>
import { ref, onMounted } from "vue";
import { useRouter } from "vue-router";
import { resetWizard as resetWizardApi, getSetting, saveSetting } from "@/shared/api.js";
import SettingsItem from "./components/SettingsItem.vue";

const router = useRouter();

const uiLang = ref("zh");
const newsLimit = ref(5);
const showLangDialog = ref(false);
const showNewsDialog = ref(false);
const showResetDialog = ref(false);

onMounted(async () => {
  try {
    const val = await getSetting("news_fetch_limit");
    if (val) newsLimit.value = parseInt(val, 10) || 5;
  } catch (e) {
    console.error("Failed to load news limit:", e);
  }
});

function saveLang() {
  saveSetting("ui_language", uiLang.value).catch(console.error);
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
