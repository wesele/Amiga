<template>
  <div>
    <div class="flex justify-between items-center mb-4">
      <div>
        <h2 class="page-title">🧩 题型管理</h2>
        <p class="page-desc">定义和描述系统中支持的题目类型及其适用范围</p>
      </div>
      <button class="btn btn-primary" @click="showAddModal = true">➕ 添加新题型</button>
    </div>

    <div class="type-grid">
      <div v-for="type in types" :key="type.id" class="card type-card">
        <div class="type-header">
          <div class="type-title-row">
            <span class="type-id">{{ type.id }}</span>
            <h3 class="type-name">{{ type.title }}</h3>
          </div>
          <div class="type-actions">
            <button class="btn btn-sm btn-secondary" @click="editType(type)">✏️ 编辑</button>
            <button class="btn btn-sm btn-danger" @click="deleteType(type.id)">🗑️ 删除</button>
          </div>
        </div>

        <div class="type-body">
          <div class="level-row">
            <span class="label">适用级别：</span>
            <div class="level-tags">
              <span v-for="l in type.levels" :key="l" class="tag tag-blue">{{ l }}</span>
            </div>
          </div>
          <div class="desc-row">
            <span class="label">描述：</span>
            <p class="type-desc">{{ type.description }}</p>
          </div>
        </div>
      </div>
    </div>

    <!-- 添加/编辑 模态框 -->
    <div v-if="showAddModal" class="modal-overlay" @click.self="showAddModal = false">
      <div class="modal">
        <h3 class="modal-title">{{ editingId ? '编辑题型' : '添加题型' }}</h3>
        <div class="modal-body">
          <div class="form-group">
            <label>题型 ID (例如: T13)</label>
            <input v-model="form.id" :disabled="!!editingId" placeholder="TXX" />
          </div>
          <div class="form-group">
            <label>标题</label>
            <input v-model="form.title" placeholder="例如: 句子填空" />
          </div>
          <div class="form-group">
            <label>适用级别范围</label>
            <div class="checkbox-group">
              <label v-for="l in allCEFR" :key="l" class="checkbox-label">
                <input type="checkbox" :value="l" v-model="form.levels" /> {{ l }}
              </label>
            </div>
          </div>
          <div class="form-group">
            <label>详细描述</label>
            <textarea v-model="form.description" rows="4" placeholder="描述该题型的交互方式、考察技能等..."></textarea>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" @click="showAddModal = false">取消</button>
          <button class="btn btn-primary" @click="saveType">保存</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive } from 'vue'
import { useQuestionTypeStorage } from '../composables/useQuestionTypeStorage.js'

const { types, updateType, deleteType: storageDeleteType, addType } = useQuestionTypeStorage()

const allCEFR = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2']
const showAddModal = ref(false)
const editingId = ref(null)

const form = reactive({
  id: '',
  title: '',
  levels: [],
  description: ''
})

function editType(type) {
  editingId.value = type.id
  form.id = type.id
  form.title = type.title
  form.levels = [...type.levels]
  form.description = type.description
  showAddModal.value = true
}

function saveType() {
  if (!form.id || !form.title) {
    alert('请填写 ID 和标题')
    return
  }

  if (types.some(type => type.id === form.id && type.id !== editingId.value)) {
    alert('题型 ID 已存在，请使用新的 ID')
    return
  }

  const typeData = {
    id: form.id,
    title: form.title,
    levels: form.levels,
    description: form.description
  }

  if (editingId.value) {
    updateType(editingId.value, typeData)
  } else {
    if (!addType(typeData)) {
      alert('题型 ID 已存在，请使用新的 ID')
      return
    }
  }
  
  closeModal()
}

async function deleteType(id) {
  if (confirm(`确认删除题型 ${id}？`)) {
    const res = await fetch('/api/data/questions')
    if (!res.ok) {
      alert('无法读取题目数据，已取消删除')
      return
    }
    const questions = res.ok ? await res.json() : []
    if (Array.isArray(questions) && questions.some(question => question.type === id)) {
      alert(`题型 ${id} 仍被题目使用，不能删除`)
      return
    }
    storageDeleteType(id)
  }
}

function closeModal() {
  showAddModal.value = false
  editingId.value = null
  form.id = ''
  form.title = ''
  form.levels = []
  form.description = ''
}
</script>

<style scoped>
.type-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(350px, 1fr));
  gap: 16px;
}
.type-card {
  display: flex;
  flex-direction: column;
}
.type-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--border);
  margin-bottom: 12px;
}
.type-title-row {
  display: flex;
  align-items: center;
  gap: 10px;
}
.type-id {
  background: var(--bg);
  color: var(--text-light);
  font-family: monospace;
  padding: 2px 6px;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 600;
}
.type-name {
  font-size: 16px;
  font-weight: 700;
}
.type-body {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.level-row, .desc-row {
  display: flex;
  gap: 8px;
  font-size: 13px;
}
.label {
  font-weight: 600;
  color: var(--text-light);
  white-space: nowrap;
  min-width: 70px;
}
.level-tags {
  display: flex;
  gap: 4px;
  flex-wrap: wrap;
}
.type-desc {
  color: var(--text);
  margin: 0;
  line-height: 1.5;
  flex: 1;
}

/* Modal Styles */
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
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
  width: 450px;
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
.checkbox-group {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  padding: 8px 0;
}
.checkbox-label {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 13px;
  cursor: pointer;
}
.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
}
</style>
