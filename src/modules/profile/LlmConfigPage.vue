<template>
  <div class="llm-config-page">
    <header class="page-header">
      <button class="back-btn" @click="$router.back()">
        <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor">
          <path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/>
        </svg>
      </button>
      <h1 class="page-title">{{ pageTitle }}</h1>
    </header>

    <div class="config-body">
      <!-- Fields -->
      <div class="settings-card">
        <div class="field-group">
          <label class="field-label">API Key</label>
          <div class="api-key-wrapper">
            <input
              :type="showKey ? 'text' : 'password'"
              v-model="apiKey"
              class="field-input"
              placeholder="sk-..."
            />
            <button class="toggle-key-btn" @click="showKey = !showKey" :title="showKey ? '隐藏' : '显示'">
              <svg v-if="!showKey" viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
                <path d="M12 6.5c2.76 0 5 2.24 5 5 0 .51-.1 1-.24 1.46l3.06 3.06c1.39-1.23 2.49-2.77 3.18-4.53C21.27 7.11 17 4 12 4c-1.27 0-2.49.2-3.64.57l2.17 2.17c.47-.14.96-.24 1.47-.24zM2.71 3.16a.996.996 0 000 1.41l1.97 1.97A11.892 11.892 0 001 11.5C2.73 15.89 7 19 12 19c1.52 0 2.97-.3 4.31-.82l2.72 2.72a.996.996 0 101.41-1.41L4.13 3.16c-.39-.39-1.03-.39-1.42 0zM12 16.5c-2.76 0-5-2.24-5-5 0-.77.18-1.5.49-2.15l1.67 1.67C9 11.33 9 11.66 9 12c0 1.66 1.34 3 3 3 .34 0 .67 0 .98-.15l1.67 1.67c-.65.31-1.38.48-2.15.48z"/>
              </svg>
              <svg v-else viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
                <path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"/>
              </svg>
            </button>
          </div>
        </div>
        <div class="field-divider" />
        <div class="field-group">
          <label class="field-label">Base URL</label>
          <input v-model="baseUrl" type="text" class="field-input" placeholder="https://api.openai.com/v1" />
        </div>
        <div class="field-divider" />
        <div class="field-group">
          <label class="field-label">模型名称</label>
          <input v-model="modelName" type="text" class="field-input" placeholder="gpt-4o-mini" />
        </div>
      </div>

      <!-- Test connection -->
      <button class="btn-test" :disabled="testing" @click="testConnection">
        <span v-if="testing" class="test-spinner" />
        <span>{{ testing ? '测试中…' : '测试连接' }}</span>
      </button>
      <div v-if="testResult" class="test-result" :class="testResult">
        {{ testResult === 'ok' ? '连接成功' : '连接失败，请检查配置' }}
      </div>

      <!-- Save -->
      <button class="btn-save" @click="saveConfig">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M17 3H5c-1.11 0-2 .9-2 2v14c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V7l-4-4zm-5 16c-1.66 0-3-1.34-3-3s1.34-3 3-3 3 1.34 3 3-1.34 3-3 3zm3-10H5V5h10v4z"/></svg>
        保存配置
      </button>

      <transition name="fade">
        <div v-if="saved" class="save-toast">配置已保存</div>
      </transition>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from "vue";
import { useRoute } from "vue-router";
import { getLlmConfig, saveLlmConfig, testLlmConnection } from "@/shared/api.js";

const route = useRoute();
const modelType = computed(() => route.params.type === "fallback" ? "backup" : "primary");
const pageTitle = computed(() => route.params.type === "fallback" ? "备用模型配置" : "主模型配置");

const apiKey = ref("");
const baseUrl = ref("https://api.openai.com/v1");
const modelName = ref("");
const showKey = ref(false);
const testing = ref(false);
const testResult = ref(null);
const saved = ref(false);

onMounted(async () => {
  try {
    const config = await getLlmConfig();
    if (config) {
      const m = config[modelType.value];
      if (m) {
        apiKey.value = m.api_key || "";
        baseUrl.value = m.base_url || "https://api.openai.com/v1";
        modelName.value = m.model || "";
      }
    }
  } catch (e) {
    console.error("Failed to load LLM config:", e);
  }
});

async function saveConfig() {
  saved.value = false;
  try {
    await saveLlmConfig(modelType.value, {
      api_key: apiKey.value,
      base_url: baseUrl.value,
      model: modelName.value,
    });
    saved.value = true;
    setTimeout(() => { saved.value = false; }, 2500);
  } catch (e) {
    console.error("Failed to save LLM config:", e);
  }
}

async function testConnection() {
  testing.value = true;
  testResult.value = null;
  try {
    await testLlmConnection({ api_key: apiKey.value, base_url: baseUrl.value, model: modelName.value });
    testResult.value = "ok";
  } catch (e) {
    testResult.value = "fail";
  } finally {
    testing.value = false;
  }
}
</script>

<style scoped>
.llm-config-page {
  min-height: 100%;
  background: var(--bg);
  padding-bottom: 32px;
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

.config-body {
  padding: 16px;
}

/* Settings card */
.settings-card {
  background: var(--surface);
  border-radius: var(--radius-md);
  overflow: hidden;
  margin-bottom: 16px;
}
.field-group {
  padding: 16px;
}
.field-label {
  display: block;
  font-size: 13px;
  font-weight: 500;
  color: var(--text-lighter);
  margin-bottom: 8px;
}
.field-input {
  width: 100%;
  padding: 12px 14px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  font-size: 15px;
  color: var(--text);
  background: var(--bg);
  outline: none;
  transition: border-color var(--transition);
  font-family: inherit;
  box-sizing: border-box;
}
.field-input:focus {
  border-color: var(--blue);
}
.field-divider {
  height: 1px;
  background: var(--border);
  margin: 0 16px;
}

/* API key input + toggle */
.api-key-wrapper {
  display: flex;
  gap: 0;
}
.api-key-wrapper .field-input {
  border-top-right-radius: 0;
  border-bottom-right-radius: 0;
  border-right: none;
}
.toggle-key-btn {
  width: 46px;
  border: 1px solid var(--border);
  border-left: none;
  border-radius: 0 var(--radius-sm) var(--radius-sm) 0;
  background: var(--bg);
  color: var(--text-lighter);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background var(--transition), color var(--transition);
  flex-shrink: 0;
}
.toggle-key-btn:hover {
  background: var(--surface-variant);
  color: var(--text);
}

/* Test button */
.btn-test {
  width: 100%;
  padding: 12px;
  border: 1px solid var(--blue);
  border-radius: var(--radius-sm);
  background: var(--surface);
  color: var(--blue);
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all var(--transition);
  font-family: inherit;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  margin-bottom: 12px;
}
.btn-test:hover:not(:disabled) {
  background: #e8f0fe;
}
.btn-test:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.test-spinner {
  width: 16px;
  height: 16px;
  border: 2px solid var(--blue);
  border-top-color: transparent;
  border-radius: 50%;
  animation: spin 0.6s linear infinite;
}
@keyframes spin {
  to { transform: rotate(360deg); }
}
.test-result {
  text-align: center;
  padding: 10px;
  border-radius: var(--radius-sm);
  font-size: 13px;
  font-weight: 500;
  margin-bottom: 16px;
}
.test-result.ok {
  background: #e6ffed;
  color: #1a7f37;
}
.test-result.fail {
  background: #ffeef0;
  color: #d73a49;
}

/* Save button */
.btn-save {
  width: 100%;
  padding: 14px;
  border: none;
  border-radius: var(--radius-md);
  background: var(--green);
  color: #fff;
  font-size: 15px;
  font-weight: 700;
  cursor: pointer;
  transition: background var(--transition);
  font-family: inherit;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
}
.btn-save:hover {
  background: var(--green-hover);
}

/* Toast */
.save-toast {
  text-align: center;
  padding: 12px;
  margin-top: 14px;
  background: #e6ffed;
  color: #1a7f37;
  border-radius: var(--radius-sm);
  font-size: 14px;
  font-weight: 500;
}
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.3s;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
