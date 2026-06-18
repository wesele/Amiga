<template>
  <div>
    <div class="flex justify-between items-center mb-4">
      <div>
        <h2 class="page-title">🪄 AI 提示词管理</h2>
        <p class="page-desc">微调 LLM 提示词以优化内容生成的质量和准确性</p>
      </div>
      <button class="btn btn-primary" @click="$router.push('/prompt-manager/edit/new')">➕ 添加提示词</button>
    </div>

    <div class="prompt-grid">
      <div v-for="(prompt, id) in prompts" :key="id" class="card prompt-card" @click="$router.push(`/prompt-manager/edit/${id}`)">
        <div class="prompt-header">
          <div class="title-row">
            <span class="category-tag">{{ prompt.category }}</span>
            <h3 class="prompt-title">{{ prompt.title }}</h3>
          </div>
          <div class="actions">
            <button class="btn btn-sm btn-danger" @click.stop="deletePrompt(id)">🗑️</button>
          </div>
        </div>
        <div class="prompt-body">
          <div class="id-label">ID: {{ id }}</div>
          <pre class="prompt-content">{{ prompt.content }}</pre>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { useRouter } from 'vue-router'
import { usePromptStorage } from '../composables/usePromptStorage.js'

const router = useRouter()
const { prompts, deletePrompt: storageDeletePrompt } = usePromptStorage()

function deletePrompt(id) {
  if (confirm(`确认删除提示词 ${id}？这可能会导致相关功能失效。`)) {
    storageDeletePrompt(id)
  }
}
</script>

<style scoped>
.prompt-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(400px, 1fr));
  gap: 16px;
}
.prompt-card {
  display: flex;
  flex-direction: column;
  cursor: pointer;
  transition: box-shadow var(--transition);
}
.prompt-card:hover {
  box-shadow: 0 4px 12px rgba(0,0,0,.1);
}
.prompt-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--border);
  margin-bottom: 12px;
}
.title-row {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.category-tag {
  font-size: 10px;
  color: var(--green);
  font-weight: 700;
  text-transform: uppercase;
}
.prompt-title {
  font-size: 16px;
  font-weight: 700;
  margin: 0;
}
.actions {
  flex-shrink: 0;
}
.prompt-body {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.id-label {
  font-family: monospace;
  font-size: 11px;
  color: var(--text-light);
}
.prompt-content {
  background: var(--bg);
  padding: 12px;
  border-radius: 6px;
  font-size: 13px;
  line-height: 1.5;
  color: var(--text);
  white-space: pre-wrap;
  word-break: break-all;
  max-height: 200px;
  overflow-y: auto;
  border: 1px solid var(--border);
}
</style>
