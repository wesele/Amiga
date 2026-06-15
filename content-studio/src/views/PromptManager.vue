<template>
  <div>
    <div class="flex justify-between items-center mb-4">
      <div>
        <h2 class="page-title">🪄 AI 提示词管理</h2>
        <p class="page-desc">微调 LLM 提示词以优化内容生成的质量和准确性</p>
      </div>
      <button class="btn btn-primary" @click="showAddModal = true">➕ 添加提示词</button>
    </div>

    <div class="prompt-grid">
      <div v-for="(prompt, id) in prompts" :key="id" class="card prompt-card">
        <div class="prompt-header">
          <div class="title-row">
            <span class="category-tag">{{ prompt.category }}</span>
            <h3 class="prompt-title">{{ prompt.title }}</h3>
          </div>
          <div class="actions">
            <button class="btn btn-sm btn-secondary" @click="editPrompt(id, prompt)">✏️ 编辑</button>
            <button class="btn btn-sm btn-danger" @click="deletePrompt(id)">🗑️ 删除</button>
          </div>
        </div>
        <div class="prompt-body">
          <div class="id-label">ID: {{ id }}</div>
          <pre class="prompt-content">{{ prompt.content }}</pre>
        </div>
      </div>
    </div>

    <!-- 编辑模态框 -->
    <div v-if="showAddModal" class="modal-overlay" @click.self="showAddModal = false">
      <div class="modal">
        <h3 class="modal-title">{{ editingId ? '编辑提示词' : '添加提示词' }}</h3>
        <div class="modal-body">
          <div class="form-group">
            <label>提示词 ID (唯一标识)</label>
            <input v-model="form.id" :disabled="!!editingId" placeholder="例如: question-gen" />
          </div>
          <div class="form-group">
            <label>标题</label>
            <input v-model="form.title" placeholder="例如: 题目生成模板" />
          </div>
          <div class="form-group">
            <label>分类</label>
            <input v-model="form.category" placeholder="例如: 题目生产" />
          </div>
          <div class="form-group">
            <label>提示词内容 (支持 ${variable} 占位符)</label>
            <textarea v-model="form.content" rows="12" class="prompt-textarea" placeholder="请输入提示词..."></textarea>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" @click="showAddModal = false">取消</button>
          <button class="btn btn-primary" @click="savePrompt">保存</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive } from 'vue'
import { usePromptStorage } from '../composables/usePromptStorage.js'

const { prompts, savePrompt: storageSavePrompt, deletePrompt: storageDeletePrompt } = usePromptStorage()

const showAddModal = ref(false)
const editingId = ref(null)

const form = reactive({
  id: '',
  title: '',
  category: '',
  content: ''
})

function editPrompt(id, prompt) {
  editingId.value = id
  form.id = id
  form.title = prompt.title
  form.category = prompt.category
  form.content = prompt.content
  showAddModal.value = true
}

function savePrompt() {
  if (!form.id || !form.content) {
    alert('请填写 ID 和内容')
    return
  }

  storageSavePrompt(form.id, {
    title: form.title,
    category: form.category,
    content: form.content
  })
  
  closeModal()
}

function deletePrompt(id) {
  if (confirm(`确认删除提示词 ${id}？这可能会导致相关功能失效。`)) {
    storageDeletePrompt(id)
  }
}

function closeModal() {
  showAddModal.value = false
  editingId.value = null
  form.id = ''
  form.title = ''
  form.category = ''
  form.content = ''
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
}
.prompt-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
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

/* Modal Styles */
.modal-overlay {
  position: fixed;
  top: 0; left: 0; right: 0; bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 100;
  backdrop-filter: blur(4px);
}
.modal {
  background: var(--white);
  padding: 24px;
  border-radius: 12px;
  width: 600px;
  box-shadow: 0 10px 25px rgba(0, 0, 0, 0.1);
}
.modal-title {
  font-size: 18px;
  font-weight: 700;
  margin-bottom: 20px;
}
.modal-body {
  display: flex;
  flex-direction: column;
  gap: 16px;
  margin-bottom: 24px;
}
.prompt-textarea {
  width: 100%;
  padding: 12px;
  font-family: 'Consolas', monospace;
  font-size: 13px;
  line-height: 1.6;
  border: 1px solid var(--border);
  border-radius: 6px;
  resize: vertical;
}
.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
}
</style>
