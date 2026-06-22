<template>
  <div class="llm-config-page">
    <header class="page-header">
      <button class="back-btn" @click="$router.back()">
        <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor">
          <path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/>
        </svg>
      </button>
      <h1 class="page-title">{{ t('llm.primaryTitle') }}</h1>
    </header>

    <div class="config-body">
      <!-- Source toggle -->
      <div class="settings-card">
        <div class="field-group">
          <label class="field-label">{{ t('llm.source') }}</label>
          <div class="source-options">
            <label
              class="source-option"
              :class="{ selected: mode === 'builtin' }"
            >
              <input type="radio" name="llm-source" value="builtin" v-model="mode" class="source-radio" />
              <div class="source-text">
                <span class="source-title">{{ t('llm.builtin') }}</span>
                <span class="source-sub">{{ t('llm.builtinDesc') }}</span>
              </div>
              <span v-if="mode === 'builtin'" class="source-check">✓</span>
            </label>
            <label
              class="source-option"
              :class="{ selected: mode === 'custom' }"
            >
              <input type="radio" name="llm-source" value="custom" v-model="mode" class="source-radio" />
              <div class="source-text">
                <span class="source-title">{{ t('llm.custom') }}</span>
                <span class="source-sub">{{ t('llm.customDesc') }}</span>
              </div>
              <span v-if="mode === 'custom'" class="source-check">✓</span>
            </label>
          </div>
        </div>
      </div>

      <!-- Built-in: only show a warning notice, hide connection parameters -->
      <template v-if="mode === 'builtin'">
        <div class="notice-card">
          <div class="notice-icon">!</div>
          <div class="notice-text">{{ t('llm.freeNotice') }}</div>
        </div>
      </template>

      <!-- Custom: editable form -->
      <template v-else>
        <div class="settings-card">
          <div class="field-group">
            <label class="field-label">{{ t('llm.apiKey') }}</label>
            <div class="api-key-wrapper">
              <input
                :type="showKey ? 'text' : 'password'"
                v-model="apiKey"
                class="field-input"
                placeholder="sk-..."
              />
              <button class="toggle-key-btn" @click="showKey = !showKey" type="button">
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
            <label class="field-label">{{ t('llm.baseUrl') }}</label>
            <input v-model="baseUrl" type="text" class="field-input" placeholder="https://api.openai.com/v1" />
          </div>
          <div class="field-divider" />
          <div class="field-group">
            <label class="field-label">{{ t('llm.model') }}</label>
            <input v-model="modelName" type="text" class="field-input" placeholder="gpt-4o-mini" />
          </div>
        </div>
      </template>

      <!-- Test connection -->
      <button class="btn-test" :disabled="testing" @click="testConnection">
        <span v-if="testing" class="test-spinner" />
        <span>{{ testing ? t('llm.testing') : t('llm.test') }}</span>
      </button>
      <div v-if="testResult" class="test-result" :class="testResult">
        {{ testResult === 'ok' ? t('llm.testOk') : t('llm.testFail') }}
      </div>

      <!-- Save -->
      <div v-if="error" class="error-banner">{{ error }}</div>
      <button class="btn-save" @click="saveConfig">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M17 3H5c-1.11 0-2 .9-2 2v14c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V7l-4-4zm-5 16c-1.66 0-3-1.34-3-3s1.34-3 3-3 3 1.34 3 3-1.34 3-3 3zm3-10H5V5h10v4z"/></svg>
        {{ t('llm.save') }}
      </button>

      <transition name="fade">
        <div v-if="saved" class="save-toast">{{ savedMessage }}</div>
      </transition>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from "vue";
import {
  getLlmConfig,
  saveLlmConfig,
  testLlmConnection,
  saveSetting,
} from "@/shared/api.js";
import { useI18n } from "@/shared/i18n";

const { t } = useI18n();

const mode = ref("builtin");
const apiKey = ref("");
const baseUrl = ref("https://api.openai.com/v1");
const modelName = ref("");
const builtin = ref({
  baseUrl: "",
  apiKey: "",
  model: "",
});
const showKey = ref(false);
const testing = ref(false);
const testResult = ref(null);
const saved = ref(false);
const savedMessage = ref("");
const error = ref("");

onMounted(async () => {
  try {
    const config = await getLlmConfig();
    if (config) {
      mode.value = config.mode || "builtin";
      if (config.builtin) {
        builtin.value = {
          baseUrl: config.builtin.base_url || "",
          apiKey: config.builtin.api_key || "",
          model: config.builtin.model || "",
        };
      }
      if (config.primary) {
        apiKey.value = config.primary.api_key || "";
        baseUrl.value = config.primary.base_url || "https://api.openai.com/v1";
        modelName.value = config.primary.model || "";
      }
    }
  } catch (e) {
    console.error("Failed to load LLM config:", e);
  }
});

function currentConfig() {
  if (mode.value === "builtin") {
    return {
      api_key: builtin.value.apiKey,
      base_url: builtin.value.baseUrl,
      model: builtin.value.model,
    };
  }
  return {
    api_key: apiKey.value,
    base_url: baseUrl.value,
    model: modelName.value,
  };
}

async function saveConfig() {
  saved.value = false;
  error.value = "";
  try {
    await saveSetting("llm_mode", mode.value);
    if (mode.value === "custom") {
      const cfg = currentConfig();
      if (!cfg.api_key || !cfg.base_url || !cfg.model) {
        error.value = t("llm.configEmpty");
        return;
      }
      await saveLlmConfig("primary", cfg);
      savedMessage.value = t("llm.saved");
    } else {
      savedMessage.value = t("llm.savedBuiltin");
    }
    saved.value = true;
    setTimeout(() => { saved.value = false; }, 2500);
  } catch (e) {
    console.error("Failed to save LLM config:", e);
    error.value = t("llm.saveFail");
  }
}

async function testConnection() {
  if (mode.value === "custom") {
    if (!apiKey.value || !baseUrl.value || !modelName.value) {
      testResult.value = "fail";
      return;
    }
  }
  testing.value = true;
  testResult.value = null;
  try {
    await testLlmConnection(currentConfig());
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
  margin-bottom: 12px;
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

/* Source radio */
.source-options {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.source-option {
  display: flex;
  align-items: center;
  padding: 12px 8px;
  cursor: pointer;
  border-radius: var(--radius-sm);
  transition: background var(--transition);
}
.source-option:hover {
  background: var(--surface-variant);
}
.source-radio {
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
.source-radio:checked {
  border-color: var(--blue);
}
.source-radio:checked::after {
  content: "";
  position: absolute;
  inset: 3px;
  border-radius: 50%;
  background: var(--blue);
}
.source-text {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.source-title {
  font-size: 15px;
  color: var(--text);
  font-weight: 500;
}
.source-sub {
  font-size: 12px;
  color: var(--text-lighter);
}
.source-check {
  color: var(--blue);
  font-weight: 600;
  font-size: 18px;
}

/* Notice card */
.notice-card {
  display: flex;
  gap: 12px;
  padding: 14px 16px;
  background: #fff7e6;
  color: #8a5a00;
  border-radius: var(--radius-md);
  margin-bottom: 16px;
  font-size: 13px;
  line-height: 1.5;
}
.notice-icon {
  width: 22px;
  height: 22px;
  flex-shrink: 0;
  border-radius: 50%;
  background: #ffa940;
  color: #fff;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
}
.notice-text {
  flex: 1;
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

.error-banner {
  margin-bottom: 12px;
  padding: 10px 16px;
  background: var(--red-bg);
  color: var(--red);
  border-radius: var(--radius-sm);
  font-size: 13px;
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
