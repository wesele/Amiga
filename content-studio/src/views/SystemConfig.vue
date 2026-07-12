<template>
  <div>
    <div class="flex justify-between items-center mb-4">
      <div>
        <h2 class="page-title">🛠️ 语言管理</h2>
        <p class="page-desc">管理支持的语言组合及 CEFR 级别</p>
      </div>
      <button class="btn btn-primary" @click="showAddPairModal = true">➕ 添加语言组合</button>
    </div>

    <div class="grid-list">
      <div v-for="pair in config.languagePairs" :key="pair.id" class="card pair-card">
        <div class="pair-header">
        <div class="pair-info">
          <span class="pair-label">{{ pair.from }} → {{ pair.to }}</span>
          <span class="pair-id text-xs text-light">ID: {{ pair.id }}</span>
        </div>
          <div class="pair-actions">
            <button class="btn btn-sm btn-secondary" @click="editPair(pair)">✏️ 编辑</button>
            <button class="btn btn-sm btn-danger" @click="deletePair(pair.id)">🗑️ 删除</button>
          </div>
        </div>

        <div class="pair-body">
          <div class="cefr-section">
            <div class="section-title">CEFR 级别</div>
            <div class="cefr-tags">
              <span v-for="level in pair.cefrLevels" :key="level" class="cefr-tag">
                {{ level }}
                <button @click="removeLevel(pair.id, level)" class="remove-tag">✕</button>
              </span>
              <div class="add-level-input">
                <input v-model="newLevelInput[pair.id]" placeholder="例如: B1" @keyup.enter="addNewLevel(pair.id)" />
                <button @click="addNewLevel(pair.id)">添加</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 添加/编辑 语言组合 模态框 -->
    <div v-if="showAddPairModal" class="modal-overlay" @click.self="showAddPairModal = false">
      <div class="modal">
        <h3 class="modal-title">{{ editingPairId ? '编辑语言组合' : '添加语言组合' }}</h3>
        <div class="modal-body">
          <div class="form-group">
            <label>起始语言</label>
            <input v-model="pairForm.from" placeholder="例如: 中文" />
          </div>
          <div class="form-group">
            <label>目标语言（从词库中选择）</label>
            <select v-model="pairForm.to" @change="onTargetLangChange">
              <option value="" disabled>请选择目标语言...</option>
              <option v-for="lang in vocabLanguages" :key="lang" :value="lang">{{ lang }}</option>
            </select>
            <p v-if="vocabLanguages.length === 0" class="form-hint">⚠️ 词库中暂无语言，请先在「词库管理」中添加语言。</p>
            <p v-else class="form-hint">💡 选择语言后会自动填充该语言在词库中已有的 CEFR 级别。</p>
          </div>
          <div class="form-group">
            <label>CEFR 级别 (逗号分隔)</label>
            <input v-model="pairForm.cefrString" placeholder="A1, A2, B1..." />
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" @click="showAddPairModal = false">取消</button>
          <button class="btn btn-primary" @click="savePair">保存</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, computed } from 'vue'
import { useSystemConfig } from '../composables/useSystemConfig.js'
import { useVocabStorage } from '../composables/useVocabStorage.js'

const { config, addLanguagePair, updateLanguagePair, deleteLanguagePair, addCEFRLevel, removeCEFRLevel } = useSystemConfig()
const vocabStorage = useVocabStorage()

const vocabLanguages = computed(() => vocabStorage.state.value?.languages || [])

const showAddPairModal = ref(false)
const editingPairId = ref(null)
const newLevelInput = reactive({})

const pairForm = reactive({
  from: '',
  to: '',
  cefrString: 'A1, A2, B1, B2, C1, C2'
})

function onTargetLangChange() {
  // 当用户选择目标语言时，自动填充该语言在词库中已有的级别
  const levels = vocabStorage.getLevels(pairForm.to)
  if (levels.length > 0) {
    pairForm.cefrString = levels.join(', ')
  }
}

function editPair(pair) {
  editingPairId.value = pair.id
  pairForm.from = pair.from
  pairForm.to = pair.to
  pairForm.cefrString = pair.cefrLevels.join(', ')
  showAddPairModal.value = true
}

async function savePair() {
  if (!pairForm.from.trim() || !pairForm.to.trim()) {
    alert('请填写起始语言和目标语言')
    return
  }
  const levels = [...new Set(pairForm.cefrString.split(',').map(s => s.trim()).filter(Boolean))]
  if (!levels.length) {
    alert('至少配置一个 CEFR 等级')
    return
  }
  if (editingPairId.value) {
    const existing = config.value.languagePairs.find(pair => pair.id === editingPairId.value)
    if (existing && (existing.from !== pairForm.from.trim() || existing.to !== pairForm.to.trim())) {
      const [questionsRes, frameworkRes] = await Promise.all([
        fetch('/api/data/questions'),
        fetch('/api/data/unit-framework')
      ])
      if (!questionsRes.ok || !frameworkRes.ok) {
        alert('无法读取关联数据，已取消修改')
        return
      }
      const questions = questionsRes.ok ? await questionsRes.json() : []
      const framework = frameworkRes.ok ? await frameworkRes.json() : {}
      if ((Array.isArray(questions) && questions.some(question => question.pairId === existing.id)) || framework[existing.id]) {
        alert('该语言组合已有题目或课程框架，不能直接修改方向；请新建语言组合')
        return
      }
    }
  }
  
  if (editingPairId.value) {
    updateLanguagePair(editingPairId.value, {
      from: pairForm.from,
      to: pairForm.to,
      cefrLevels: levels
    })
  } else {
    addLanguagePair({
      from: pairForm.from,
      to: pairForm.to,
      cefrLevels: levels
    })
  }
  
  closeModal()
}

function closeModal() {
  showAddPairModal.value = false
  editingPairId.value = null
  pairForm.from = ''
  pairForm.to = ''
  pairForm.cefrString = 'A1, A2, B1, B2, C1, C2'
}

async function deletePair(id) {
  if (confirm('确认删除此语言组合及其所有配置？')) {
    try {
      await deleteLanguagePair(id)
      window.location.reload()
    } catch (e) {
      alert(`删除失败: ${e.message}`)
    }
  }
}

function addNewLevel(pairId) {
  const val = newLevelInput[pairId]
  if (val && val.trim()) {
    addCEFRLevel(pairId, val.trim())
    newLevelInput[pairId] = ''
  }
}

async function removeLevel(pairId, level) {
  if (!confirm(`删除 ${level} 将同时删除该等级的题目、框架和图片，继续吗？`)) return
  try {
    await removeCEFRLevel(pairId, level)
    window.location.reload()
  } catch (e) {
    alert(`删除等级失败: ${e.message}`)
  }
}
</script>

<style scoped>
.pair-card {
  margin-bottom: 16px;
  border-left: 4px solid var(--green);
}
.pair-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--border);
  margin-bottom: 12px;
}
.pair-info {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.pair-label {
  font-size: 18px;
  font-weight: 700;
  color: var(--text);
}
.cefr-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.section-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-light);
}
.cefr-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}
.cefr-tag {
  background: var(--bg);
  border: 1px solid var(--border);
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 12px;
  display: flex;
  align-items: center;
  gap: 6px;
}
.remove-tag {
  background: none;
  border: none;
  color: var(--text-light);
  cursor: pointer;
  font-size: 10px;
  padding: 0;
}
.remove-tag:hover {
  color: var(--red);
}
.add-level-input {
  display: flex;
  gap: 4px;
}
.add-level-input input {
  width: 80px;
  padding: 4px 8px;
  font-size: 12px;
  border: 1px solid var(--border);
  border-radius: 4px;
}
.add-level-input button {
  padding: 4px 8px;
  font-size: 12px;
  cursor: pointer;
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
  width: 400px;
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
.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
}
.form-hint {
  font-size: 11px;
  color: var(--text-light);
  margin-top: 4px;
}
</style>
