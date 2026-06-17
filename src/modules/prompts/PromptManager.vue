<template>
  <div class="prompt-page">
    <header class="page-header">
      <button class="back-btn" @click="goBack">
        <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor">
          <path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/>
        </svg>
      </button>
      <h1 class="page-title">提示词管理</h1>
      <button class="reset-all-btn" @click="resetAll">全部重置</button>
    </header>

    <div v-if="loading" class="loading-center">
      <div class="spinner" />
    </div>

    <template v-else>
      <div v-if="error" class="error-banner">{{ error }}</div>

      <div class="category-group" v-for="(group, c) in grouped" :key="c">
        <div class="category-title">{{ c }}</div>
        <div
          v-for="p in group"
          :key="p.key"
          class="prompt-card"
          :class="{ editing: editingKey === p.key }"
        >
          <div v-if="editingKey !== p.key" class="prompt-summary" @click="editPrompt(p)">
            <div class="prompt-name">{{ p.name }}</div>
            <div class="prompt-key">{{ p.key }}</div>
            <div class="prompt-preview">{{ p.system_prompt }}</div>
          </div>

          <div v-else class="prompt-editor">
            <div class="editor-field">
              <label>名称</label>
              <input v-model="editForm.name" class="input" />
            </div>
            <div class="editor-field">
              <label>分类</label>
              <input v-model="editForm.category" class="input" />
            </div>
            <div class="editor-field">
              <label>系统提示词 (System Prompt)</label>
              <textarea v-model="editForm.system_prompt" class="textarea" rows="3" />
            </div>
            <div class="editor-field">
              <label>用户提示词模板 (User Prompt)</label>
              <textarea v-model="editForm.user_prompt_template" class="textarea code" rows="6" />
              <div class="field-hint">可用变量: <code>{% raw %}{{CEFR_LEVEL}}{% endraw %}</code> <code>{% raw %}{{WORD}}{% endraw %}</code> <code>{% raw %}{{TEXT}}{% endraw %}</code> 等</div>
            </div>
            <div class="editor-actions">
              <button class="btn-cancel" @click="cancelEdit">取消</button>
              <button class="btn-reset-one" @click="resetSingle(editForm.key)">重置</button>
              <button class="btn-save" @click="saveEdit">保存</button>
            </div>
          </div>
        </div>
      </div>

      <div v-if="Object.keys(grouped).length === 0" class="empty-state">暂无提示词</div>
    </template>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from "vue";
import { useRouter } from "vue-router";
import { getAllPrompts, savePrompt, resetPrompt as apiResetPrompt, resetAllPrompts as apiResetAll } from "@/shared/api.js";

const router = useRouter();
const loading = ref(true);
const error = ref("");
const prompts = ref([]);
const editingKey = ref("");
const editForm = ref({ key: "", name: "", category: "", system_prompt: "", user_prompt_template: "" });

const grouped = computed(() => {
  const g = {};
  for (const p of prompts.value) {
    const c = p.category || "未分类";
    if (!g[c]) g[c] = [];
    g[c].push(p);
  }
  return g;
});

function goBack() {
  router.push("/profile");
}

function editPrompt(p) {
  editingKey.value = p.key;
  editForm.value = { ...p };
}

function cancelEdit() {
  editingKey.value = "";
}

async function saveEdit() {
  const f = editForm.value;
  try {
    await savePrompt(f.key, f.name, f.category, f.system_prompt, f.user_prompt_template);
    const idx = prompts.value.findIndex(p => p.key === f.key);
    if (idx >= 0) prompts.value[idx] = { ...f, updated_at: new Date().toISOString() };
    editingKey.value = "";
  } catch (e) {
    error.value = "保存失败: " + (typeof e === "string" ? e : e.message);
  }
}

async function resetSingle(key) {
  try {
    const p = await apiResetPrompt(key);
    const idx = prompts.value.findIndex(x => x.key === key);
    if (idx >= 0) prompts.value[idx] = p;
    editingKey.value = "";
  } catch (e) {
    error.value = "重置失败";
  }
}

async function resetAll() {
  if (!confirm("确认重置所有提示词为默认值？")) return;
  try {
    await apiResetAll();
    await loadPrompts();
    editingKey.value = "";
  } catch (e) {
    error.value = "重置失败";
  }
}

async function loadPrompts() {
  try {
    prompts.value = await getAllPrompts();
  } catch (e) {
    error.value = "加载失败";
    prompts.value = [];
  }
}

onMounted(async () => {
  loading.value = true;
  await loadPrompts();
  loading.value = false;
});
</script>

<style scoped>
.prompt-page {
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

.reset-all-btn {
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

.reset-all-btn:hover {
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

.empty-state {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-lighter);
  font-size: 14px;
}

.category-group {
  padding: 0 20px 12px;
}

.category-title {
  font-size: 14px;
  font-weight: 700;
  color: var(--text-light);
  margin-bottom: 8px;
  padding: 0 4px;
}

.prompt-card {
  border: 1.5px solid var(--border);
  border-radius: var(--radius-md);
  margin-bottom: 10px;
  overflow: hidden;
  transition: border-color var(--transition);
}

.prompt-card.editing {
  border-color: var(--green);
}

.prompt-summary {
  padding: 14px 16px;
  cursor: pointer;
  transition: background var(--transition);
}

.prompt-summary:hover {
  background: var(--surface-variant);
}

.prompt-name {
  font-size: 15px;
  font-weight: 700;
  color: var(--text);
  margin-bottom: 2px;
}

.prompt-key {
  font-size: 11px;
  color: var(--text-lighter);
  font-weight: 500;
  margin-bottom: 6px;
  font-family: monospace;
}

.prompt-preview {
  font-size: 12px;
  color: var(--text-light);
  line-height: 1.4;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.prompt-editor {
  padding: 14px 16px;
}

.editor-field {
  margin-bottom: 12px;
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
  margin-top: 4px;
}

.btn-cancel {
  padding: 8px 16px;
  border: 1.5px solid var(--border);
  border-radius: var(--radius-xs);
  background: var(--surface);
  color: var(--text-light);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  font-family: inherit;
  transition: all var(--transition);
}

.btn-cancel:hover {
  background: var(--surface-variant);
}

.btn-reset-one {
  padding: 8px 16px;
  border: 1.5px solid var(--red);
  border-radius: var(--radius-xs);
  background: transparent;
  color: var(--red);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  font-family: inherit;
  transition: all var(--transition);
}

.btn-reset-one:hover {
  background: var(--red-bg);
}

.btn-save {
  padding: 8px 20px;
  border: none;
  border-radius: var(--radius-xs);
  background: var(--green);
  color: #fff;
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
  font-family: inherit;
  transition: background var(--transition);
}

.btn-save:hover {
  background: var(--green-hover);
}
</style>
