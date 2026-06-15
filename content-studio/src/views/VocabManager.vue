<template>
  <div class="vocab-manager">
    <div class="flex justify-between items-center mb-4">
      <div>
        <h2 class="page-title">📖 词库管理</h2>
        <p class="page-desc">维护各语言级别对应的核心词汇表</p>
      </div>
    </div>

    <div class="vocab-layout">
      <!-- 左侧：语言 & 级别 导航 -->
      <aside class="vocab-sidebar">
        <div v-for="lang in state.languages" :key="lang" class="lang-group">
          <div class="lang-header">
            <span class="lang-name">{{ lang }}</span>
            <button @click="deleteLanguage(lang)" class="btn-icon btn-danger" title="删除语言">🗑️</button>
          </div>
          
          <div class="level-list">
            <div 
              v-for="level in getLevels(lang)" 
              :key="level" 
              class="level-item" 
              :class="{ active: selectedLang === lang && selectedLevel === level }"
              @click="selectLevel(lang, level)"
            >
              {{ level }}
              <button @click.stop="removeLevel(lang, level)" class="btn-icon btn-sm">✕</button>
            </div>
            <div class="level-add">
              <input v-model="newLevelInput[lang]" placeholder="B1" @keyup.enter="addNewLevel(lang)" />
              <button @click="addNewLevel(lang)">+</button>
            </div>
          </div>
        </div>
        <div class="sidebar-footer">
          <button class="btn btn-secondary w-full" @click="showAddLangModal = true">➕ 添加语言</button>
        </div>
      </aside>

      <!-- 右侧：词汇编辑区 -->
      <main class="vocab-editor">
        <div v-if="selectedLevel" class="editor-container">
          <div class="editor-header">
            <h3>{{ selectedLang }} · {{ selectedLevel }}</h3>
            <button class="btn btn-primary" @click="saveCurrentVocab">💾 保存词库</button>
          </div>
          <textarea 
            v-model="currentWords" 
            placeholder="请输入单词，使用英文逗号分隔..."
            class="vocab-textarea"
          ></textarea>
          <div class="vocab-stats">
            共 {{ wordCount }} 个单词
          </div>
        </div>
        <div v-else class="editor-placeholder">
          <div class="placeholder-content">
            <span class="placeholder-icon">📚</span>
            <p>请从左侧选择一个语言级别以编辑词库</p>
          </div>
        </div>
      </main>
    </div>

    <!-- 添加语言 模态框 -->
    <div v-if="showAddLangModal" class="modal-overlay" @click.self="showAddLangModal = false">
      <div class="modal">
        <h3 class="modal-title">添加语言</h3>
        <div class="modal-body">
          <div class="form-group">
            <label>语言名称</label>
            <input v-model="newLangName" placeholder="例如: 西班牙语" />
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" @click="showAddLangModal = false">取消</button>
          <button class="btn btn-primary" @click="saveLanguage">保存</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, reactive } from 'vue'
import { useVocabStorage } from '../composables/useVocabStorage.js'

const { 
  state, addLanguage, removeLanguage, getLevels, 
  addLevel, removeLevel: storageRemoveLevel, getWords, setWords 
} = useVocabStorage()

const selectedLang = ref('')
const selectedLevel = ref('')
const currentWords = ref('')
const showAddLangModal = ref(false)
const newLangName = ref('')
const newLevelInput = reactive({})

const wordCount = computed(() => {
  if (!currentWords.value) return 0
  return currentWords.value.split(',').filter(w => w.trim()).length
})

function selectLevel(lang, level) {
  selectedLang.value = lang
  selectedLevel.value = level
  currentWords.value = getWords(lang, level)
}

function saveCurrentVocab() {
  if (selectedLang.value && selectedLevel.value) {
    setWords(selectedLang.value, selectedLevel.value, currentWords.value)
    alert('词库保存成功！')
  }
}

function addNewLevel(lang) {
  const val = newLevelInput[lang]
  if (val && val.trim()) {
    addLevel(lang, val.trim())
    newLevelInput[lang] = ''
  }
}

function removeLevel(lang, level) {
  if (confirm(`确认删除级别 ${level}？相关词库将被清除。`)) {
    storageRemoveLevel(lang, level)
    if (selectedLevel.value === level) {
      selectedLevel.value = ''
      currentWords.value = ''
    }
  }
}

function deleteLanguage(lang) {
  if (confirm(`确认删除语言 ${lang}？所有相关级别和词库将被清除。`)) {
    removeLanguage(lang)
    if (selectedLang.value === lang) {
      selectedLang.value = ''
      selectedLevel.value = ''
      currentWords.value = ''
    }
  }
}

function saveLanguage() {
  if (newLangName.value && newLangName.value.trim()) {
    addLanguage(newLangName.value.trim())
    showAddLangModal.value = false
    newLangName.value = ''
  } else {
    alert('请输入语言名称')
  }
}
</script>

<style scoped>
.vocab-layout {
  display: grid;
  grid-template-columns: 300px 1fr;
  gap: 24px;
  height: calc(100vh - 120px);
  min-height: 600px;
}

.vocab-sidebar {
  background: var(--white);
  border: 1px solid var(--border);
  border-radius: 12px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.lang-group {
  border-bottom: 1px solid var(--border);
}

.lang-header {
  background: var(--bg);
  padding: 12px 16px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-weight: 700;
}

.lang-name {
  font-size: 14px;
  color: var(--text);
}

.level-list {
  padding: 8px 0;
}

.level-item {
  padding: 8px 16px 8px 24px;
  font-size: 13px;
  cursor: pointer;
  display: flex;
  justify-content: space-between;
  align-items: center;
  transition: all 0.2s;
  color: var(--text-light);
}

.level-item:hover {
  background: var(--green-bg);
  color: var(--text);
}

.level-item.active {
  background: var(--green-bg);
  color: var(--green);
  font-weight: 600;
  border-right: 3px solid var(--green);
}

.level-add {
  display: flex;
  padding: 8px 16px;
  gap: 4px;
}

.level-add input {
  flex: 1;
  padding: 4px 8px;
  font-size: 12px;
  border: 1px solid var(--border);
  border-radius: 4px;
}

.level-add button {
  width: 24px;
  padding: 0;
  font-size: 16px;
}

.sidebar-footer {
  padding: 16px;
  background: var(--white);
}

.vocab-editor {
  background: var(--white);
  border: 1px solid var(--border);
  border-radius: 12px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  position: relative;
}

.editor-container {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.editor-header {
  padding: 16px 24px;
  border-bottom: 1px solid var(--border);
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.editor-header h3 {
  font-size: 18px;
  font-weight: 700;
}

.vocab-textarea {
  flex: 1;
  padding: 24px;
  font-size: 16px;
  line-height: 1.6;
  border: none;
  outline: none;
  resize: none;
  font-family: 'Consolas', monospace;
}

.vocab-stats {
  padding: 12px 24px;
  border-top: 1px solid var(--border);
  font-size: 12px;
  color: var(--text-light);
  text-align: right;
  background: var(--bg);
}

.editor-placeholder {
  flex: 1;
  display: flex;
  justify-content: center;
  align-items: center;
  text-align: center;
  color: var(--text-light);
}

.placeholder-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
}

.placeholder-icon {
  font-size: 48px;
}

.btn-icon {
  background: none;
  border: none;
  cursor: pointer;
  padding: 2px 4px;
  font-size: 12px;
  border-radius: 4px;
}

.btn-icon.btn-danger:hover {
  background: var(--red-bg);
}

.btn-icon.btn-sm {
  font-size: 10px;
  color: var(--text-light);
}

.btn-icon.btn-sm:hover {
  color: var(--red);
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
</style>

