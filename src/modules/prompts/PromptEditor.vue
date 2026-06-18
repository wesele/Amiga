<template>
  <div class="editor-page">
    <header class="page-header">
      <button class="back-btn" @click="goBack">
        <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor">
          <path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/>
        </svg>
      </button>
      <h1 class="page-title">{{ isNew ? '新建提示词' : '编辑提示词' }}</h1>
      <button v-if="!isNew" class="reset-one-btn" @click="showResetDialog = true">重置</button>
    </header>

    <div v-if="loading" class="loading-center">
      <div class="spinner" />
    </div>

    <div v-else class="editor-body">
      <div v-if="error" class="error-banner">{{ error }}</div>
      <div v-if="success" class="success-banner">{{ success }}</div>

      <div class="editor-field">
        <label>Key</label>
        <input
          v-model="form.key"
          class="input mono"
          :disabled="!isNew"
          placeholder="唯一标识符，如 my-prompt-key"
        />
      </div>

      <div class="editor-field">
        <label>名称</label>
        <input v-model="form.name" class="input" placeholder="提示词显示名称" />
      </div>

      <div class="editor-field">
        <label>分类</label>
        <input v-model="form.category" class="input" placeholder="如：学习功能、AI对话" />
      </div>

      <div class="editor-field">
        <label>系统提示词 (System Prompt)</label>
        <textarea v-model="form.system_prompt" class="textarea" rows="8" placeholder="系统级提示词内容" />
      </div>

      <div class="editor-field">
        <label>用户提示词模板 (User Prompt Template)</label>
        <textarea v-model="form.user_prompt_template" class="textarea code" rows="10" placeholder="用户消息模板，支持 {{变量}} 替换" />
        <div class="field-hint">
          可用变量示例:
          <code>TARGET_LANG</code> <code>NATIVE_LANG</code>
          <code>CEFR_LEVEL</code> <code>WORD</code>
          <code>TEXT</code> <code>CONVERSATION</code>
        </div>
      </div>

      <div class="editor-actions">
        <button class="btn-save" @click="savePrompt" :disabled="saving">
          {{ saving ? '保存中...' : '保存' }}
        </button>
      </div>
    </div>

    <ConfirmDialog
      :show="showResetDialog"
      title="重置提示词"
      message="确认重置此提示词为默认值？"
      confirmText="重置"
      danger
      @confirm="resetToDefault"
      @cancel="showResetDialog = false"
    />
  </div>
</template>

<script setup>
import { ref, onMounted } from "vue";
import { useRoute, useRouter } from "vue-router";
import { getPrompt, savePrompt as apiSavePrompt, resetPrompt as apiResetPrompt } from "@/shared/api.js";
import ConfirmDialog from "@/shared/components/ConfirmDialog.vue";

const route = useRoute();
const router = useRouter();

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

function goBack() {
  router.back();
}

async function loadPrompt() {
  if (isNew) {
    form.value = { key: "", name: "", category: "", system_prompt: "", user_prompt_template: "" };
    return;
  }
  try {
    const p = await getPrompt(promptKey);
    form.value = { ...p };
  } catch (e) {
    error.value = "加载提示词失败: " + (typeof e === "string" ? e : e.message);
  }
}

async function savePrompt() {
  const f = form.value;
  if (!f.key.trim()) {
    error.value = "请输入 Key";
    return;
  }
  if (!f.name.trim()) {
    error.value = "请输入名称";
    return;
  }
  saving.value = true;
  error.value = "";
  success.value = "";
  try {
    await apiSavePrompt(f.key, f.name, f.category, f.system_prompt, f.user_prompt_template);
    success.value = "保存成功";
    setTimeout(() => router.push("/prompts"), 800);
  } catch (e) {
    error.value = "保存失败: " + (typeof e === "string" ? e : e.message);
  } finally {
    saving.value = false;
  }
}

async function resetToDefault() {
  showResetDialog.value = false;
  try {
    const p = await apiResetPrompt(promptKey);
    form.value = { ...p };
    success.value = "已重置为默认值";
  } catch (e) {
    error.value = "重置失败";
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

.page-header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px 20px 12px;
  flex-shrink: 0;
}

.page-title {
  font-size: 22px;
  font-weight: 800;
  margin: 0;
  color: var(--text);
  flex: 1;
}

.back-btn {
  width: 36px;
  height: 36px;
  border: none;
  background: none;
  cursor: pointer;
  color: var(--text);
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  flex-shrink: 0;
  transition: background var(--transition);
}

.back-btn:hover {
  background: var(--surface-variant);
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
