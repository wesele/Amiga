<template>
  <div class="llm-config-page" :class="{ 'tv-content-pane': isTvMode }">
    <PageHeader :title="t('llm.primaryTitle')" />

    <div class="config-body">
      <!-- Source toggle (Segmented Control) -->
      <div class="settings-card source-selector-card">
        <div class="field-group">
          <label class="field-label">{{ t('llm.source') }}</label>
          <div class="segmented-control" role="radiogroup" :aria-label="t('llm.source')">
            <label
              class="source-option"
              :class="{ selected: mode === 'builtin' }"
              tabindex="0"
              role="radio"
              :aria-checked="mode === 'builtin'"
              @keydown.enter.prevent="mode = 'builtin'; saveConfig()"
              @keydown.space.prevent="mode = 'builtin'; saveConfig()"
              @click="mode = 'builtin'; saveConfig()"
            >
              <input type="radio" name="llm-source" value="builtin" v-model="mode" @change="saveConfig" class="source-radio" tabindex="-1" />
              <span class="source-title">{{ t('llm.builtin') }}</span>
            </label>
            <label
              class="source-option"
              :class="{ selected: mode === 'custom' }"
              tabindex="0"
              role="radio"
              :aria-checked="mode === 'custom'"
              @keydown.enter.prevent="mode = 'custom'; saveConfig()"
              @keydown.space.prevent="mode = 'custom'; saveConfig()"
              @click="mode = 'custom'; saveConfig()"
            >
              <input type="radio" name="llm-source" value="custom" v-model="mode" @change="saveConfig" class="source-radio" tabindex="-1" />
              <span class="source-title">{{ t('llm.custom') }}</span>
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
        <div class="settings-card custom-fields-card">
          <div class="field-group">
            <label class="field-label">{{ t('llm.provider') }}</label>
            <select v-model="provider" @change="onProviderChange" class="field-input provider-select">
              <option value="openai">OpenAI</option>
              <option value="gemini">Gemini</option>
              <option value="deepseek">DeepSeek</option>
              <option value="nvidia_nim">NVIDIA NIM</option>
            </select>
          </div>
          <div class="field-group">
            <label class="field-label">{{ t('llm.apiKey') }}</label>
            <div class="api-key-wrapper">
              <input
                :type="showKey ? 'text' : 'password'"
                v-model="apiKey"
                @change="onApiParamsChange"
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
          <div class="field-group">
            <label class="field-label">{{ t('llm.baseUrl') }}</label>
            <input v-model="baseUrl" @change="onApiParamsChange" type="text" class="field-input" placeholder="https://api.openai.com/v1" />
          </div>
          <div class="field-group">
            <label class="field-label">{{ t('llm.model') }}</label>
            <div class="model-input-wrapper">
              <input v-model="modelName" @change="saveConfig" list="model-options" type="text" class="field-input" placeholder="gpt-4o-mini" />
              <button class="fetch-models-btn" @click="loadModels" type="button" :disabled="fetchingModels">
                <span v-if="fetchingModels" class="btn-spinner" />
                <svg v-else viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
                  <path d="M19 8l-4 4h3c0 3.31-2.69 6-6 6-1.01 0-1.97-.25-2.8-.7l-1.46 1.46C8.97 19.54 10.43 20 12 20c4.42 0 8-3.58 8-8h3l-4-4zM6 12c0-3.31 2.69-6 6-6 1.01 0 1.97.25 2.8.7l1.46-1.46C15.03 4.46 13.57 4 12 4c-4.42 0-8 3.58-8 8H1l4 4 4-4H6z"/>
                </svg>
              </button>
            </div>
            <datalist id="model-options">
              <option v-for="m in modelList" :key="m" :value="m" />
            </datalist>
          </div>
        </div>
      </template>

      <button
        type="button"
        class="settings-card thinking-card"
        :aria-pressed="disableThinking"
        @click="disableThinking = !disableThinking; saveConfig()"
      >
        <div class="thinking-copy">
          <span class="thinking-title">{{ t('llm.thinking') }}</span>
          <span class="thinking-desc">{{ t('llm.thinkingDesc') }}</span>
        </div>
        <span class="switch-control" aria-hidden="true">
          <span class="switch-track" :class="{ on: disableThinking }" />
        </span>
      </button>

      <!-- Action buttons -->
      <div class="action-buttons">
        <button class="btn-test" :disabled="testing" @click="testConnection">
          <span v-if="testing" class="test-spinner" />
          <span>{{ testing ? t('llm.testing') : t('llm.test') }}</span>
        </button>
      </div>

      <div v-if="testResult" class="test-result" :class="testResult">
        {{ testResult === 'ok' ? t('llm.testOk') : t('llm.testFail') }}
      </div>
      <div v-if="error" class="error-banner">{{ error }}</div>

      <transition name="fade">
        <div v-if="saved" class="save-toast">{{ savedMessage }}</div>
      </transition>
    </div>

    <!-- Metrics Alert Modal -->
    <ConfirmDialog
      :show="showMetricsModal"
      :title="t('llm.testMetrics')"
      :message="metricsMessage"
      alert-only
      @confirm="showMetricsModal = false"
    />
  </div>
</template>

<script setup>
import { computed, ref, onMounted } from "vue";
import PageHeader from "@/shared/components/PageHeader.vue";
import ConfirmDialog from "@/shared/components/ConfirmDialog.vue";
import {
  getLlmConfig,
  saveLlmConfig,
  testLlmConnection,
} from "@/shared/backend/llm.js";
import {
  saveSetting,
} from "@/shared/backend/settings.js";
import { fetchModels } from "@/shared/api.js";
import { useI18n } from "@/shared/i18n";
import { isTvMode } from "@/shared/appMode.js";

const { t } = useI18n();

const mode = ref("builtin");
const apiKey = ref("");
const baseUrl = ref("https://api.openai.com/v1");
const modelName = ref("");
const provider = ref("openai");
const builtinThinkingEnabled = ref(false);
const customThinkingEnabled = ref(false);
const disableThinking = computed({
  get: () => mode.value === "builtin" ? builtinThinkingEnabled.value : customThinkingEnabled.value,
  set: (value) => {
    if (mode.value === "builtin") builtinThinkingEnabled.value = value;
    else customThinkingEnabled.value = value;
  },
});
const builtin = ref({
  baseUrl: "",
  apiKey: "",
  model: "",
  provider: "nvidia_nim",
  thinkingEnabled: false,
});
const showKey = ref(false);
const testing = ref(false);
const testResult = ref(null);
const saved = ref(false);
const savedMessage = ref("");
const error = ref("");

const showMetricsModal = ref(false);
const metricsMessage = ref("");

const modelList = ref([]);
const fetchingModels = ref(false);

const PROVIDER_DEFAULTS = {
  openai: {
    baseUrl: "https://api.openai.com/v1",
  },
  gemini: {
    baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai/v1",
  },
  deepseek: {
    baseUrl: "https://api.deepseek.com/v1",
  },
  nvidia_nim: {
    baseUrl: "https://integrate.api.nvidia.com/v1",
  },
};

async function loadModels() {
  const trimmedUrl = (baseUrl.value || "").trim();
  const trimmedKey = (apiKey.value || "").trim();

  if (!trimmedUrl || !trimmedKey) {
    error.value = t("llm.fetchModelsEmpty");
    return;
  }
  fetchingModels.value = true;
  error.value = "";
  try {
    const list = await fetchModels(trimmedUrl, trimmedKey);
    modelList.value = list || [];
  } catch (e) {
    console.error("Failed to load models list:", e);
    error.value = t("llm.fetchModelsFail") + ": " + (e.message || e);
  } finally {
    fetchingModels.value = false;
  }
}

async function onApiParamsChange() {
  await saveConfig();
  await loadModels();
}

async function onProviderChange() {
  const defaults = PROVIDER_DEFAULTS[provider.value];
  if (defaults) {
    const currentUrl = (baseUrl.value || "").trim();
    const isDefaultUrl = Object.values(PROVIDER_DEFAULTS).some(d => d.baseUrl === currentUrl) || !currentUrl;
    if (isDefaultUrl) {
      baseUrl.value = defaults.baseUrl;
    }
  }
  await saveConfig();
  await loadModels();
}

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
          provider: config.builtin.provider || "nvidia_nim",
          thinkingEnabled: !!config.builtin.thinking_enabled,
        };
      }
      if (config.primary) {
        apiKey.value = config.primary.api_key || "";
        baseUrl.value = config.primary.base_url || "https://api.openai.com/v1";
        modelName.value = config.primary.model || "";
        provider.value = config.primary.provider || "openai";
      }
      builtinThinkingEnabled.value = builtin.value.thinkingEnabled;
      customThinkingEnabled.value = !!config.primary?.thinking_enabled;
    }
    if (apiKey.value && baseUrl.value) {
      loadModels();
    }
    
    // UI Automated testing hook for screenshot generation
    const urlParams = new URLSearchParams(window.location.search);
    const testStep = urlParams.get("test_step");
    if (testStep) {
      setTimeout(async () => {
        if (testStep === "custom") {
          mode.value = "custom";
        } else if (testStep === "gemini") {
          mode.value = "custom";
          provider.value = "gemini";
          await onProviderChange();
        } else if (testStep === "deepseek") {
          mode.value = "custom";
          provider.value = "deepseek";
          await onProviderChange();
        } else if (testStep === "empty_error") {
          mode.value = "custom";
          apiKey.value = "";
          await loadModels();
        } else if (testStep === "complete") {
          mode.value = "custom";
          apiKey.value = "sk-mock-key-123456";
          baseUrl.value = "https://api.openai.com/v1";
          await loadModels();
          modelName.value = "gpt-4o-mini";
        } else if (testStep === "test_metrics") {
          mode.value = "custom";
          apiKey.value = "sk-mock-key-123456";
          baseUrl.value = "https://api.openai.com/v1";
          modelName.value = "gpt-4o-mini";
          testConnection();
        }
      }, 500);
    }
  } catch (e) {
    console.error("Failed to load LLM config:", e);
  }
});

function currentConfig() {
  if (mode.value === "builtin") {
    return {
      api_key: (builtin.value.apiKey || "").trim(),
      base_url: (builtin.value.baseUrl || "").trim(),
      model: (builtin.value.model || "").trim(),
      provider: builtin.value.provider,
      thinking_enabled: disableThinking.value,
    };
  }
  return {
    api_key: (apiKey.value || "").trim(),
    base_url: (baseUrl.value || "").trim(),
    model: (modelName.value || "").trim(),
    provider: provider.value,
    thinking_enabled: disableThinking.value,
  };
}

async function saveConfig() {
  saved.value = false;
  error.value = "";
  try {
    await saveSetting("llm_mode", mode.value);
    if (mode.value === "custom") {
      const cfg = currentConfig();
      await saveLlmConfig("primary", cfg);
      if (!cfg.api_key || !cfg.base_url || !cfg.model) {
        error.value = t("llm.configEmpty");
      } else {
        error.value = "";
        savedMessage.value = t("llm.saved");
        saved.value = true;
        setTimeout(() => { saved.value = false; }, 2500);
      }
    } else {
      await saveSetting("builtin_thinking_enabled", disableThinking.value ? "true" : "false");
      savedMessage.value = t("llm.savedBuiltin");
      saved.value = true;
      setTimeout(() => { saved.value = false; }, 2500);
    }
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
    const res = await testLlmConnection(currentConfig());
    if (res.success) {
      testResult.value = "ok";
      const ttftVal = res.time_to_first_token_ms ?? 0;
      const thinkSpeedVal = res.thinking_speed ?? 0;
      const decodeSpeedVal = res.decode_speed ?? 0;
      const thinkTokensVal = res.thinking_tokens ?? 0;
      const completionTokensVal = res.completion_tokens ?? 0;
      metricsMessage.value = `${t('llm.ttft')}: ${ttftVal} ms\n` +
                             `${t('llm.thinkingSpeed')}: ${thinkSpeedVal.toFixed(1)} tokens/s\n` +
                             `${t('llm.decodeSpeed')}: ${decodeSpeedVal.toFixed(1)} tokens/s\n` +
                             `${t('llm.thinkingTokens')}: ${thinkTokensVal} tokens\n` +
                             `${t('llm.completionTokens')}: ${completionTokensVal} tokens`;
      showMetricsModal.value = true;
    } else {
      testResult.value = "fail";
    }
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
  padding-bottom: 24px;
}

.config-body {
  padding: 12px;
}

/* Settings card */
.settings-card {
  background: var(--surface);
  border-radius: var(--radius-md);
  overflow: visible;
  margin-bottom: 12px;
}
.field-group {
  padding: 10px 14px;
}
/* Model input + fetch button */
.model-input-wrapper {
  display: flex;
  gap: 0;
}
.model-input-wrapper .field-input {
  border-top-right-radius: 0;
  border-bottom-right-radius: 0;
  border-right: none;
}
.fetch-models-btn {
  width: 40px;
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
.fetch-models-btn:hover {
  background: var(--border);
  color: var(--blue);
}
.fetch-models-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.btn-spinner {
  width: 16px;
  height: 16px;
  border: 2px solid var(--border);
  border-top-color: var(--blue);
  border-radius: 50%;
  animation: test-spin 0.8s linear infinite;
}
.field-label {
  display: block;
  font-size: 13px;
  font-weight: 500;
  color: var(--text-lighter);
  margin-bottom: 6px;
}
.field-input {
  width: 100%;
  padding: 10px 12px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  font-size: 14px;
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
.provider-select { appearance: auto; }
.thinking-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 14px;
  box-sizing: border-box;
  width: 100%;
  border: 0;
  font: inherit;
  text-align: left;
  cursor: pointer;
  color: inherit;
}
.thinking-copy { min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.thinking-title { color: var(--text); font-size: 14px; font-weight: 700; }
.thinking-desc { color: var(--text-lighter); font-size: 11px; line-height: 1.4; }
.switch-control { position: relative; width: 44px; height: 24px; flex: 0 0 auto; pointer-events: none; }
.switch-track { display: block; width: 100%; height: 100%; border-radius: 999px; background: var(--border); transition: background var(--transition); position: relative; }
.switch-track::after { content: ""; position: absolute; width: 18px; height: 18px; top: 3px; left: 3px; border-radius: 50%; background: #fff; box-shadow: 0 1px 4px rgba(0,0,0,.2); transition: transform var(--transition); }
.switch-track.on { background: var(--blue); }
.switch-track.on::after { transform: translateX(20px); }

/* Segmented Control */
.segmented-control {
  display: flex;
  background: var(--bg);
  border-radius: var(--radius-sm);
  padding: 3px;
  border: 1px solid var(--border);
  gap: 2px;
}
.source-option {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 8px 12px;
  cursor: pointer;
  border-radius: calc(var(--radius-sm) - 2px);
  transition: all var(--transition);
  outline: none;
  font-size: 14px;
  font-weight: 500;
  color: var(--text-lighter);
  position: relative;
  user-select: none;
}
.source-option:hover {
  background: var(--surface-variant);
}
.source-option.selected {
  background: var(--surface);
  color: var(--blue);
  box-shadow: 0 1px 3px rgba(0,0,0,0.08);
}
.source-option:focus-visible,
.thinking-card:focus-visible,
.btn-test:focus-visible,
.btn-save:focus-visible,
.toggle-key-btn:focus-visible,
.field-input:focus-visible,
.provider-select:focus-visible {
  z-index: 2;
  outline: 3px solid #1cb0f6 !important;
  outline-offset: 2px;
  box-shadow: 0 0 0 4px rgba(28, 176, 246, 0.2) !important;
  transform: none !important;
}
.source-option:focus-visible,
.thinking-card:focus-visible {
  background: var(--green-bg);
  outline-offset: -3px;
  box-shadow: inset 0 0 0 1px rgba(28, 176, 246, 0.22) !important;
}
.source-radio {
  position: absolute;
  opacity: 0;
  width: 0;
  height: 0;
  pointer-events: none;
}
.source-title {
  font-size: 14px;
  font-weight: 500;
}

/* Notice card */
.notice-card {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 12px;
  background: #fff7e6;
  color: #8a5a00;
  border-radius: var(--radius-sm);
  margin-bottom: 12px;
  font-size: 12px;
  line-height: 1.4;
  border: 1px solid #ffe58f;
}
.notice-icon {
  width: 16px;
  height: 16px;
  flex-shrink: 0;
  border-radius: 50%;
  background: #ffa940;
  color: #fff;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
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
  width: 40px;
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

/* Action buttons */
.action-buttons {
  display: flex;
  gap: 12px;
  margin-top: 14px;
  margin-bottom: 10px;
}

/* Test button */
.btn-test {
  flex: 1;
  height: 42px;
  border: 1px solid var(--blue);
  border-radius: var(--radius-md);
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
  gap: 6px;
  box-sizing: border-box;
}
.btn-test:hover:not(:disabled) {
  background: #e8f0fe;
}
.btn-test:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.test-spinner {
  width: 14px;
  height: 14px;
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
  padding: 8px;
  border-radius: var(--radius-sm);
  font-size: 13px;
  font-weight: 500;
  margin-bottom: 10px;
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
  flex: 1;
  height: 42px;
  border: none;
  border-radius: var(--radius-md);
  background: var(--green);
  color: #fff;
  font-size: 14px;
  font-weight: 700;
  cursor: pointer;
  transition: background var(--transition);
  font-family: inherit;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  box-sizing: border-box;
}
.btn-save:hover {
  background: var(--green-hover);
}

.error-banner {
  margin-bottom: 10px;
  padding: 8px 12px;
  background: var(--red-bg);
  color: var(--red);
  border-radius: var(--radius-sm);
  font-size: 12px;
}

/* Toast */
.save-toast {
  text-align: center;
  padding: 10px;
  margin-top: 10px;
  background: #e6ffed;
  color: #1a7f37;
  border-radius: var(--radius-sm);
  font-size: 13px;
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
