<template>
  <div class="llm-config-page">
    <PageHeader :title="t('llm.multimodalTitle')" />

    <div class="config-body">
      <p class="intro">{{ t('llm.multimodalDesc') }}</p>

      <div class="settings-card">
        <div class="field-group">
          <label class="field-label">{{ t('llm.source') }}</label>
          <div class="source-options">
            <label class="source-option" :class="{ selected: mode === 'builtin' }">
              <input type="radio" name="mm-source" value="builtin" v-model="mode" class="source-radio" />
              <div class="source-text">
                <span class="source-title">{{ t('llm.builtin') }}</span>
                <span class="source-sub">{{ t('llm.multimodalBuiltinDesc') }}</span>
              </div>
              <span v-if="mode === 'builtin'" class="source-check">✓</span>
            </label>
            <label class="source-option" :class="{ selected: mode === 'custom' }">
              <input type="radio" name="mm-source" value="custom" v-model="mode" class="source-radio" />
              <div class="source-text">
                <span class="source-title">{{ t('llm.custom') }}</span>
                <span class="source-sub">{{ t('llm.customDesc') }}</span>
              </div>
              <span v-if="mode === 'custom'" class="source-check">✓</span>
            </label>
          </div>
        </div>
      </div>

      <template v-if="mode === 'builtin'">
        <div class="notice-card">
          <div class="notice-icon">!</div>
          <div class="notice-text">{{ t('llm.multimodalBuiltinNotice') }}</div>
        </div>
      </template>

      <template v-else>
        <div class="settings-card">
          <div class="field-group">
            <label class="field-label">{{ t('llm.apiKey') }}</label>
            <input :type="showKey ? 'text' : 'password'" v-model="apiKey" class="field-input" placeholder="sk-..." />
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

      <button class="btn-test" :disabled="testing" @click="testConnection">
        <span v-if="testing" class="test-spinner" />
        <span>{{ testing ? t('llm.testing') : t('llm.test') }}</span>
      </button>
      <div v-if="testResult" class="test-result" :class="testResult">
        {{ testResult === 'ok' ? t('llm.testOk') : t('llm.testFail') }}
      </div>

      <div v-if="error" class="error-banner">{{ error }}</div>
      <button class="btn-save" @click="saveConfig">{{ t('llm.save') }}</button>
      <transition name="fade">
        <div v-if="saved" class="save-toast">{{ savedMessage }}</div>
      </transition>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from "vue";
import PageHeader from "@/shared/components/PageHeader.vue";
import {
  getMultimodalConfig,
  saveMultimodalConfig,
  testMultimodalConnection,
  saveSetting,
} from "@/shared/api.js";
import { useI18n } from "@/shared/i18n";

const { t } = useI18n();
const mode = ref("builtin");
const apiKey = ref("");
const baseUrl = ref("https://api.openai.com/v1");
const modelName = ref("");
const builtin = ref({ baseUrl: "", apiKey: "", model: "" });
const showKey = ref(false);
const testing = ref(false);
const testResult = ref(null);
const saved = ref(false);
const savedMessage = ref("");
const error = ref("");

onMounted(async () => {
  try {
    const config = await getMultimodalConfig();
    mode.value = config.mode || "builtin";
    if (config.builtin) {
      builtin.value = {
        baseUrl: config.builtin.base_url || "",
        apiKey: config.builtin.api_key || "",
        model: config.builtin.model || "",
      };
    }
    if (config.custom) {
      apiKey.value = config.custom.api_key || "";
      baseUrl.value = config.custom.base_url || "https://api.openai.com/v1";
      modelName.value = config.custom.model || "";
    }
  } catch (e) {
    console.error("Failed to load multimodal config:", e);
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
    await saveSetting("multimodal_mode", mode.value);
    if (mode.value === "custom") {
      const cfg = currentConfig();
      if (!cfg.api_key || !cfg.base_url || !cfg.model) {
        error.value = t("llm.configEmpty");
        return;
      }
      await saveMultimodalConfig(cfg);
      savedMessage.value = t("llm.saved");
    } else {
      savedMessage.value = t("llm.savedBuiltin");
    }
    saved.value = true;
    setTimeout(() => { saved.value = false; }, 2500);
  } catch (e) {
    console.error("Failed to save multimodal config:", e);
    error.value = t("llm.saveFail");
  }
}

async function testConnection() {
  if (mode.value === "custom" && (!apiKey.value || !baseUrl.value || !modelName.value)) {
    testResult.value = "fail";
    return;
  }
  testing.value = true;
  testResult.value = null;
  try {
    const result = await testMultimodalConnection(currentConfig());
    testResult.value = result.success ? "ok" : "fail";
  } catch {
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
.config-body { padding: 16px; }
.intro {
  margin: 0 0 16px;
  font-size: 13px;
  line-height: 1.5;
  color: var(--text-light);
}
.settings-card {
  background: var(--surface);
  border-radius: var(--radius-md);
  overflow: hidden;
  margin-bottom: 16px;
}
.field-group { padding: 16px; }
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
  font-family: inherit;
  box-sizing: border-box;
}
.field-divider {
  height: 1px;
  background: var(--border);
  margin: 0 16px;
}
.source-options { display: flex; flex-direction: column; gap: 4px; }
.source-option {
  display: flex;
  align-items: center;
  padding: 12px 8px;
  cursor: pointer;
  border-radius: var(--radius-sm);
}
.source-radio {
  appearance: none;
  width: 20px;
  height: 20px;
  border: 2px solid var(--outline-variant);
  border-radius: 50%;
  margin-right: 14px;
  flex-shrink: 0;
}
.source-radio:checked { border-color: var(--blue); }
.source-radio:checked::after {
  content: "";
  display: block;
  width: 10px;
  height: 10px;
  margin: 3px;
  border-radius: 50%;
  background: var(--blue);
}
.source-text { flex: 1; display: flex; flex-direction: column; gap: 2px; }
.source-title { font-size: 15px; color: var(--text); font-weight: 500; }
.source-sub { font-size: 12px; color: var(--text-lighter); }
.source-check { color: var(--blue); font-weight: 600; }
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
  border-radius: 50%;
  background: #ffa940;
  color: #fff;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
}
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
  font-family: inherit;
  margin-bottom: 12px;
}
.test-spinner {
  width: 16px;
  height: 16px;
  border: 2px solid var(--blue);
  border-top-color: transparent;
  border-radius: 50%;
  animation: spin 0.6s linear infinite;
  display: inline-block;
  vertical-align: middle;
  margin-right: 8px;
}
@keyframes spin { to { transform: rotate(360deg); } }
.test-result {
  text-align: center;
  padding: 10px;
  border-radius: var(--radius-sm);
  font-size: 13px;
  margin-bottom: 16px;
}
.test-result.ok { background: #e6ffed; color: #1a7f37; }
.test-result.fail { background: #ffeef0; color: #d73a49; }
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
  font-family: inherit;
}
.error-banner {
  margin-bottom: 12px;
  padding: 10px 16px;
  background: var(--red-bg);
  color: var(--red);
  border-radius: var(--radius-sm);
  font-size: 13px;
}
.save-toast {
  text-align: center;
  padding: 12px;
  margin-top: 14px;
  background: #e6ffed;
  color: #1a7f37;
  border-radius: var(--radius-sm);
}
</style>
