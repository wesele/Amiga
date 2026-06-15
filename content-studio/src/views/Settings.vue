<template>
  <div>
    <h2 class="page-title">🔑 API 设置</h2>
    <p class="page-desc">配置 LLM API 连接信息（支持任何 OpenAI 兼容 API）</p>

    <div class="card mb-4">
      <h3>🌐 API 连接配置</h3>

      <div class="form-group">
        <label>API Base URL</label>
        <input v-model="config.baseUrl" placeholder="https://api.openai.com/v1" />
        <p class="text-sm text-light mt-2">
          OpenAI: https://api.openai.com/v1 | DeepSeek: https://api.deepseek.com/v1 |
          通义千问: https://dashscope.aliyuncs.com/compatible-mode/v1
        </p>
      </div>

      <div class="form-group">
        <label>API Key</label>
        <input v-model="config.apiKey" type="password" placeholder="sk-..." />
      </div>

      <div class="grid-2">
        <div class="form-group">
          <label>生产模型（成本优先）</label>
          <input v-model="config.model" placeholder="gpt-4o-mini" />
        </div>
        <div class="form-group">
          <label>审查模型（质量优先）</label>
          <input v-model="config.reviewModel" placeholder="gpt-4o" />
        </div>
      </div>

      <div class="flex gap-2 mt-3">
        <button class="btn btn-primary" @click="save">💾 保存配置</button>
        <button class="btn btn-blue" @click="testApi" :disabled="testing">
          {{ testing ? '⏳ 测试中...' : '🔗 测试连接' }}
        </button>
      </div>

      <div v-if="testResult" class="mt-3" :class="testResult.success ? 'alert alert-success' : 'alert alert-error'">
        {{ testResult.success ? '✅' : '❌' }} {{ testResult.message }}
      </div>
    </div>

    <div class="card">
      <h3>ℹ️ 使用说明</h3>
      <ul style="padding-left: 20px; font-size: 13px; line-height: 1.8;">
        <li>本系统仅依赖 <code>/chat/completions</code> 接口，与具体模型解耦</li>
        <li>支持 OpenAI、DeepSeek、通义千问、Moonshot 等任何兼容 OpenAI 协议的 API</li>
        <li>API Key 存储在 <code>studio.config.json</code> 配置文件中，请勿将此文件提交到公开仓库</li>
        <li>建议使用低成本模型（如 gpt-4o-mini）进行批量生产，高能力模型（如 gpt-4o）进行质量审查</li>
      </ul>
    </div>

    <div class="card mt-4">
      <h3>🗄️ 数据管理</h3>
      <div class="flex gap-2">
        <button class="btn btn-secondary" @click="exportAllData">📥 导出全部数据</button>
        <button class="btn btn-secondary" @click="importData">📤 导入数据</button>
        <button class="btn btn-danger" @click="clearData">🗑️ 清空所有题目</button>
      </div>
      <input ref="importInput" type="file" accept=".json" style="display:none" @change="handleImport" />
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useStorage } from '../composables/useStorage.js'
import { useLLM } from '../composables/useLLM.js'

const storage = useStorage()
const llm = useLLM()

const config = ref({
  baseUrl: '',
  apiKey: '',
  model: 'gpt-4o-mini',
  reviewModel: 'gpt-4o'
})

const testing = ref(false)
const testResult = ref(null)
const importInput = ref(null)
let saveTimer = null

async function save() {
  await storage.saveApiConfig(config.value)
  testResult.value = { success: true, message: '配置已保存到配置文件' }
  clearTimeout(saveTimer)
  saveTimer = setTimeout(() => { testResult.value = null }, 3000)
}

async function testApi() {
  clearTimeout(saveTimer)
  await save()
  clearTimeout(saveTimer)
  testResult.value = null
  testing.value = true
  try {
    testResult.value = await llm.testConnection()
  } catch (e) {
    testResult.value = { success: false, message: e.message }
  } finally {
    testing.value = false
  }
}

function exportAllData() {
  const data = {
    apiConfig: storage.getApiConfig(),
    questions: storage.getQuestions(),
    exportedAt: new Date().toISOString()
  }
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `idioma-studio-backup-${Date.now()}.json`
  a.click()
  URL.revokeObjectURL(url)
}

function importData() {
  importInput.value?.click()
}

function handleImport(e) {
  const file = e.target.files[0]
  if (!file) return

  const reader = new FileReader()
  reader.onload = (ev) => {
    try {
      const data = JSON.parse(ev.target.result)
      if (data.questions) {
        // 清空旧题目后导入新题目（写入服务端）
        storage.clearAllQuestions()
        storage.saveQuestions(data.questions)
      }
      testResult.value = { success: true, message: `导入成功: ${data.questions?.length || 0} 道题目` }
    } catch (err) {
      testResult.value = { success: false, message: '导入失败: ' + err.message }
    }
  }
  reader.readAsText(file)
  e.target.value = ''
}

function clearData() {
  if (confirm('确认清空所有题目数据？此操作不可恢复。')) {
    storage.clearAllQuestions()
    testResult.value = { success: true, message: '已清空所有题目' }
  }
}

onMounted(async () => {
  config.value = await storage.fetchApiConfig()
})
</script>

<style scoped>
.page-title { font-size: 24px; font-weight: 700; margin-bottom: 4px; }
.page-desc { color: var(--text-light); margin-bottom: 24px; }
code {
  background: var(--bg);
  padding: 2px 6px;
  border-radius: 4px;
  font-size: 12px;
  font-family: 'Consolas', monospace;
}
</style>
