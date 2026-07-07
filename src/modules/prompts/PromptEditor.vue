<template>
  <div class="editor-page">
    <PageHeader :title="isNew ? t('prompts.new') : t('prompts.edit')" variant="prompts">
      <template v-if="!isNew" #actions>
        <button class="reset-one-btn" @click="showResetDialog = true">{{ t('prompts.reset') }}</button>
      </template>
    </PageHeader>

    <div v-if="loading" class="loading-center">
      <div class="spinner" />
    </div>

    <div v-else class="editor-body">
      <div v-if="error" class="error-banner">{{ error }}</div>
      <div v-if="success" class="success-banner">{{ success }}</div>

      <div class="editor-field">
        <label>{{ t('prompts.fields.key') }}</label>
        <input
          v-model="form.key"
          class="input mono"
          :disabled="!isNew"
          :placeholder="t('prompts.fields.keyPlaceholder')"
        />
      </div>

      <div class="editor-field">
        <label>{{ t('prompts.fields.name') }}</label>
        <input v-model="form.name" class="input" :placeholder="t('prompts.fields.namePlaceholder')" />
      </div>

      <div class="editor-field">
        <label>{{ t('prompts.fields.category') }}</label>
        <input v-model="form.category" class="input" :placeholder="t('prompts.fields.categoryPlaceholder')" />
      </div>

      <div class="editor-field">
        <label>{{ t('prompts.fields.system') }}</label>
        <textarea v-model="form.system_prompt" class="textarea" rows="8" :placeholder="t('prompts.fields.systemPlaceholder')" />
      </div>

      <div class="editor-field">
        <label>{{ t('prompts.fields.user') }}</label>
        <textarea v-model="form.user_prompt_template" class="textarea code" rows="10" :placeholder="t('prompts.fields.userPlaceholder')" />
        <div class="field-hint">
          {{ t('prompts.fields.variables') }}:
          <code>TARGET_LANG</code> <code>NATIVE_LANG</code>
          <code>CEFR_LEVEL</code> <code>WORD</code>
          <code>TEXT</code> <code>CONVERSATION</code>
        </div>
      </div>

      <div class="editor-actions">
        <button class="btn-save" @click="savePrompt" :disabled="saving">
          {{ saving ? t('common.saved') + '...' : t('common.save') }}
        </button>
      </div>
    </div>

    <ConfirmDialog
      :show="showResetDialog"
      :title="t('prompts.resetOneConfirmTitle')"
      :message="t('prompts.resetOneConfirmMsg')"
      :confirmText="t('prompts.reset')"
      danger
      @confirm="resetToDefault"
      @cancel="showResetDialog = false"
    />
  </div>
</template>

<script setup>
import { ref, onMounted } from "vue";
import { useRoute, useRouter } from "vue-router";
import {
  getPrompt,
  resetPrompt as apiResetPrompt,
  savePrompt as apiSavePrompt,
} from "@/shared/backend/prompts.js";
import ConfirmDialog from "@/shared/components/ConfirmDialog.vue";
import PageHeader from "@/shared/components/PageHeader.vue";
import { useI18n } from "@/shared/i18n";

const route = useRoute();
const router = useRouter();
const { t } = useI18n();

const loading = ref(true);
const saving = ref(false);
const error = ref("");
const success = ref("");
const showResetDialog = ref(false);

const form = ref({
  key: "",
  name: "",
  category: "",
  system_prompt: "",
  user_prompt_template: "",
});

const promptKey = route.params.key;
const isNew = promptKey === "new";

async function loadPrompt() {
  if (isNew) {
    form.value = { key: "", name: "", category: "", system_prompt: "", user_prompt_template: "" };
    return;
  }
  try {
    const p = await getPrompt(promptKey);
    form.value = { ...p };
  } catch (e) {
    error.value = t("prompts.loadFail") + ": " + (typeof e === "string" ? e : e.message);
  }
}

async function savePrompt() {
  const f = form.value;
  if (!f.key.trim()) {
    error.value = t("prompts.keyRequired");
    return;
  }
  if (!f.name.trim()) {
    error.value = t("prompts.nameRequired");
    return;
  }
  saving.value = true;
  error.value = "";
  success.value = "";
  try {
    await apiSavePrompt(f.key, f.name, f.category, f.system_prompt, f.user_prompt_template);
    success.value = t("prompts.saveSuccess");
    setTimeout(() => router.replace({ name: "prompts" }), 800);
  } catch (e) {
    error.value = t("prompts.saveFail") + ": " + (typeof e === "string" ? e : e.message);
  } finally {
    saving.value = false;
  }
}

async function resetToDefault() {
  showResetDialog.value = false;
  try {
    const p = await apiResetPrompt(promptKey);
    form.value = { ...p };
    success.value = t("prompts.resetDone");
  } catch (e) {
    error.value = t("prompts.resetFail");
  }
}

onMounted(async () => {
  loading.value = true;
  await loadPrompt();
  loading.value = false;
});
</script>

<style scoped>
.editor-page {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--surface);
}

.reset-one-btn {
  font-size: 12px;
  font-weight: 600;
  padding: 4px 12px;
  border: 1.5px solid var(--red);
  border-radius: 12px;
  background: transparent;
  color: var(--red);
  cursor: pointer;
  transition: all var(--transition);
  font-family: inherit;
  white-space: nowrap;
}

.reset-one-btn:hover {
  background: var(--red-bg);
}

.loading-center {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
}

.spinner {
  width: 32px;
  height: 32px;
  border: 3px solid var(--border);
  border-top-color: var(--green);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.error-banner {
  margin: 0 20px 12px;
  padding: 10px 16px;
  background: var(--red-bg);
  color: var(--red);
  border-radius: var(--radius-sm);
  font-size: 13px;
}

.success-banner {
  margin: 0 20px 12px;
  padding: 10px 16px;
  background: #e6ffed;
  color: #1a7f37;
  border-radius: var(--radius-sm);
  font-size: 13px;
}

.editor-body {
  flex: 1;
  overflow-y: auto;
  padding: 0 20px 20px;
}

.editor-field {
  margin-bottom: 16px;
}

.editor-field label {
  display: block;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-light);
  margin-bottom: 4px;
}

.input {
  width: 100%;
  padding: 8px 12px;
  border: 1.5px solid var(--border);
  border-radius: var(--radius-xs);
  font-size: 14px;
  font-family: inherit;
  color: var(--text);
  background: var(--surface);
  outline: none;
  transition: border-color var(--transition);
  box-sizing: border-box;
}

.input:focus {
  border-color: var(--green);
}

.input.mono {
  font-family: monospace;
}

.input:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.textarea {
  width: 100%;
  padding: 8px 12px;
  border: 1.5px solid var(--border);
  border-radius: var(--radius-xs);
  font-size: 13px;
  font-family: inherit;
  color: var(--text);
  background: var(--surface);
  outline: none;
  transition: border-color var(--transition);
  resize: vertical;
  box-sizing: border-box;
  line-height: 1.5;
}

.textarea.code {
  font-family: monospace;
  font-size: 12px;
}

.textarea:focus {
  border-color: var(--green);
}

.field-hint {
  font-size: 11px;
  color: var(--text-lighter);
  margin-top: 4px;
}

.field-hint code {
  background: var(--surface-variant);
  padding: 1px 4px;
  border-radius: 3px;
  font-size: 11px;
}

.editor-actions {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
  margin-top: 8px;
}

.btn-save {
  padding: 10px 24px;
  border: none;
  border-radius: var(--radius-xs);
  background: var(--green);
  color: #fff;
  font-size: 14px;
  font-weight: 700;
  cursor: pointer;
  font-family: inherit;
  transition: background var(--transition);
}

.btn-save:hover {
  background: var(--green-hover);
}

.btn-save:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
