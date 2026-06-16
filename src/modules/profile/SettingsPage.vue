<template>
  <div class="settings-page">
    <!-- Back header -->
    <header class="settings-header">
      <button class="back-btn" @click="$router.back()">
        <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor">
          <path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/>
        </svg>
      </button>
      <h1 class="header-title">设置</h1>
      <div class="header-spacer" />
    </header>

    <!-- Interface Language -->
    <section class="settings-section">
      <h3 class="section-title">界面语言</h3>
      <div class="lang-options">
        <button
          v-for="lang in uiLanguages"
          :key="lang.code"
          class="lang-chip"
          :class="{ active: uiLang === lang.code }"
          @click="uiLang = lang.code"
        >
          {{ lang.label }}
        </button>
      </div>
    </section>

    <!-- LLM API Configuration -->
    <section class="settings-section">
      <h3 class="section-title">AI 配置</h3>

      <!-- Primary Model -->
      <div class="expandable-card">
        <button class="card-header" @click="showPrimary = !showPrimary">
          <div class="card-header-left">
            <span class="card-dot primary" />
            <span class="card-label">主模型</span>
          </div>
          <span class="card-arrow" :class="{ expanded: showPrimary }">›</span>
        </button>
        <div v-if="showPrimary" class="card-body">
          <div class="form-group">
            <label class="form-label">API Key</label>
            <input
              v-model="primaryApiKey"
              type="password"
              class="form-input"
              placeholder="sk-..."
            />
          </div>
          <div class="form-group">
            <label class="form-label">Base URL</label>
            <input
              v-model="primaryBaseUrl"
              type="text"
              class="form-input"
              placeholder="https://api.openai.com/v1"
            />
          </div>
          <div class="form-group">
            <label class="form-label">模型名称</label>
            <input
              v-model="primaryModel"
              type="text"
              class="form-input"
              placeholder="gpt-4o-mini"
            />
          </div>
          <button
            class="btn-test"
            :disabled="testing === 'primary'"
            @click="testConnection('primary')"
          >
            {{ testing === 'primary' ? '测试中…' : '测试连接' }}
          </button>
          <p v-if="testResult.primary" class="test-result" :class="testResult.primary">
            {{ testResult.primary === 'ok' ? '✓ 连接成功' : '✗ 连接失败' }}
          </p>
        </div>
      </div>

      <!-- Fallback Model -->
      <div class="expandable-card">
        <button class="card-header" @click="showFallback = !showFallback">
          <div class="card-header-left">
            <span class="card-dot fallback" />
            <span class="card-label">备用模型</span>
          </div>
          <span class="card-arrow" :class="{ expanded: showFallback }">›</span>
        </button>
        <div v-if="showFallback" class="card-body">
          <div class="form-group">
            <label class="form-label">API Key</label>
            <input
              v-model="fallbackApiKey"
              type="password"
              class="form-input"
              placeholder="sk-..."
            />
          </div>
          <div class="form-group">
            <label class="form-label">Base URL</label>
            <input
              v-model="fallbackBaseUrl"
              type="text"
              class="form-input"
              placeholder="https://api.openai.com/v1"
            />
          </div>
          <div class="form-group">
            <label class="form-label">模型名称</label>
            <input
              v-model="fallbackModel"
              type="text"
              class="form-input"
              placeholder="gpt-4o-mini"
            />
          </div>
          <button
            class="btn-test"
            :disabled="testing === 'fallback'"
            @click="testConnection('fallback')"
          >
            {{ testing === 'fallback' ? '测试中…' : '测试连接' }}
          </button>
          <p v-if="testResult.fallback" class="test-result" :class="testResult.fallback">
            {{ testResult.fallback === 'ok' ? '✓ 连接成功' : '✗ 连接失败' }}
          </p>
        </div>
      </div>

      <button class="btn-save" @click="saveConfig">保存配置</button>
      <p v-if="saveMsg" class="save-msg">{{ saveMsg }}</p>
    </section>

    <!-- Danger Zone -->
    <section class="settings-section danger-section">
      <h3 class="section-title danger-title">数据管理</h3>
      <button class="btn-danger" @click="resetWizard">重新开始向导</button>
      <p class="danger-hint">这将清除你的学习数据并重新进入新用户向导。</p>
    </section>
  </div>
</template>

<script setup>
import { ref, onMounted } from "vue";
import { useRouter } from "vue-router";
import {
  getLlmConfig,
  saveLlmConfig,
  testLlmConnection,
  resetWizard as resetWizardApi,
} from "@/shared/api.js";

const router = useRouter();

// UI Language
const uiLang = ref("zh");
const uiLanguages = [
  { code: "zh", label: "中文" },
  { code: "en", label: "English" },
];

// LLM config
const showPrimary = ref(false);
const showFallback = ref(false);
const primaryApiKey = ref("");
const primaryBaseUrl = ref("https://api.openai.com/v1");
const primaryModel = ref("gpt-4o-mini");
const fallbackApiKey = ref("");
const fallbackBaseUrl = ref("https://api.openai.com/v1");
const fallbackModel = ref("gpt-4o-mini");

const testing = ref(null);
const testResult = ref({ primary: null, fallback: null });
const saveMsg = ref("");

onMounted(async () => {
  try {
    const config = await getLlmConfig();
    if (config) {
      if (config.primary) {
        primaryApiKey.value = config.primary.api_key || "";
        primaryBaseUrl.value = config.primary.base_url || "https://api.openai.com/v1";
        primaryModel.value = config.primary.model || "gpt-4o-mini";
      }
      if (config.backup) {
        fallbackApiKey.value = config.backup.api_key || "";
        fallbackBaseUrl.value = config.backup.base_url || "https://api.openai.com/v1";
        fallbackModel.value = config.backup.model || "gpt-4o-mini";
      }
    }
  } catch (e) {
    console.error("Failed to load LLM config:", e);
  }
});

async function testConnection(modelType) {
  testing.value = modelType;
  testResult.value[modelType] = null;
  try {
    const config =
      modelType === "primary"
        ? {
            api_key: primaryApiKey.value,
            base_url: primaryBaseUrl.value,
            model: primaryModel.value,
          }
        : {
            api_key: fallbackApiKey.value,
            base_url: fallbackBaseUrl.value,
            model: fallbackModel.value,
          };
    await testLlmConnection(config);
    testResult.value[modelType] = "ok";
  } catch (e) {
    testResult.value[modelType] = "fail";
  } finally {
    testing.value = null;
  }
}

async function saveConfig() {
  try {
    await saveLlmConfig("primary", {
      api_key: primaryApiKey.value,
      base_url: primaryBaseUrl.value,
      model: primaryModel.value,
    });
    await saveLlmConfig("backup", {
      api_key: fallbackApiKey.value,
      base_url: fallbackBaseUrl.value,
      model: fallbackModel.value,
    });
    saveMsg.value = "✓ 配置已保存";
    setTimeout(() => (saveMsg.value = ""), 2000);
  } catch (e) {
    saveMsg.value = "✗ 保存失败";
  }
}

function resetWizard() {
  if (confirm("确定要重新开始向导吗？这将清除你的学习数据。")) {
    resetWizardApi().then(() => {
      router.push("/wizard");
    });
  }
}
</script>

<style scoped>
.settings-page {
  min-height: 100%;
  background: var(--bg);
  padding-bottom: 24px;
}

.settings-header {
  display: flex;
  align-items: center;
  padding: 12px 8px;
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
}

.back-btn:hover {
  background: var(--surface-variant);
}

.header-title {
  flex: 1;
  text-align: center;
  font-size: 18px;
  font-weight: 700;
}

.header-spacer {
  width: 40px;
}

.settings-section {
  margin: 16px;
}

.section-title {
  font-size: 13px;
  font-weight: 700;
  color: var(--text-light);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-bottom: 10px;
  padding-left: 4px;
}

.lang-options {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.lang-chip {
  padding: 8px 18px;
  border-radius: 20px;
  border: 2px solid var(--outline-variant);
  background: var(--surface);
  font-size: 14px;
  font-weight: 600;
  color: var(--text);
  cursor: pointer;
  transition: all var(--transition);
}

.lang-chip.active {
  border-color: var(--green);
  background: var(--green-bg);
  color: var(--green);
}

/* Expandable Cards */
.expandable-card {
  background: var(--surface);
  border-radius: var(--radius-md);
  margin-bottom: 8px;
  overflow: hidden;
}

.card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  padding: 14px 16px;
  border: none;
  background: none;
  cursor: pointer;
  font-size: 15px;
  color: var(--text);
  transition: background var(--transition);
}

.card-header:hover {
  background: var(--surface-variant);
}

.card-header-left {
  display: flex;
  align-items: center;
  gap: 10px;
}

.card-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
}

.card-dot.primary {
  background: var(--blue);
}

.card-dot.fallback {
  background: var(--orange);
}

.card-label {
  font-weight: 600;
}

.card-arrow {
  font-size: 22px;
  color: var(--text-lighter);
  transition: transform var(--transition);
}

.card-arrow.expanded {
  transform: rotate(90deg);
}

.card-body {
  padding: 0 16px 16px;
  border-top: 1px solid var(--border);
  padding-top: 14px;
}

.form-group {
  margin-bottom: 12px;
}

.form-label {
  display: block;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-light);
  margin-bottom: 4px;
}

.form-input {
  width: 100%;
  padding: 10px 12px;
  border: 1px solid var(--outline-variant);
  border-radius: var(--radius-sm);
  font-size: 14px;
  color: var(--text);
  background: var(--bg);
  outline: none;
  transition: border-color var(--transition);
}

.form-input:focus {
  border-color: var(--blue);
}

.btn-test {
  width: 100%;
  padding: 10px;
  border: 2px solid var(--blue);
  border-radius: var(--radius-sm);
  background: var(--surface);
  color: var(--blue);
  font-size: 14px;
  font-weight: 700;
  cursor: pointer;
  transition: all var(--transition);
  margin-top: 4px;
}

.btn-test:hover:not(:disabled) {
  background: var(--blue-bg);
}

.btn-test:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.test-result {
  margin-top: 8px;
  font-size: 13px;
  font-weight: 600;
  text-align: center;
}

.test-result.ok {
  color: var(--green);
}

.test-result.fail {
  color: var(--red);
}

.btn-save {
  width: 100%;
  padding: 14px;
  border: none;
  border-radius: var(--radius-md);
  background: var(--green);
  color: #fff;
  font-size: 15px;
  font-weight: 800;
  cursor: pointer;
  transition: background var(--transition);
  margin-top: 12px;
}

.btn-save:hover {
  background: var(--green-hover);
}

.save-msg {
  text-align: center;
  margin-top: 8px;
  font-size: 13px;
  font-weight: 600;
  color: var(--green);
}

/* Danger Zone */
.danger-section {
  background: var(--red-bg);
  border-radius: var(--radius-md);
  padding: 16px;
  margin: 16px;
}

.danger-title {
  color: var(--red) !important;
}

.btn-danger {
  width: 100%;
  padding: 12px;
  border: 2px solid var(--red);
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--red);
  font-size: 14px;
  font-weight: 700;
  cursor: pointer;
  transition: all var(--transition);
}

.btn-danger:hover {
  background: var(--red);
  color: #fff;
}

.danger-hint {
  font-size: 11px;
  color: var(--text-lighter);
  margin-top: 8px;
  text-align: center;
}
</style>
