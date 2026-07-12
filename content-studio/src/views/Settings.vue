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

      <div class="model-toolbar">
        <div>
          <h3 class="section-title model-title">🤖 模型选择</h3>
          <p class="text-sm text-light">可从服务商获取模型列表，也可以直接输入自定义模型名。</p>
        </div>
        <button class="btn btn-secondary btn-fetch-models" @click="fetchModels" :disabled="modelsLoading">
          {{ modelsLoading ? '⏳ 获取中...' : '🔄 获取可用模型' }}
        </button>
      </div>
      <p v-if="modelStatus" class="model-status" :class="{ error: modelError }">{{ modelStatus }}</p>

      <datalist id="available-models">
        <option v-for="model in modelOptions" :key="model" :value="model" />
      </datalist>
      <div class="grid-3">
        <div class="form-group">
          <label>生产模型（成本优先）</label>
          <input v-model="config.model" list="available-models" placeholder="gpt-4o-mini" autocomplete="off" />
        </div>
        <div class="form-group">
          <label>生图模型（单独配置）</label>
          <input v-model="config.imageModel" list="available-models" placeholder="gpt-4o-mini" autocomplete="off" />
        </div>
        <div class="form-group">
          <label>审查模型（质量优先）</label>
          <input v-model="config.reviewModel" list="available-models" placeholder="gpt-4o" autocomplete="off" />
        </div>
      </div>

      <h3 class="section-title">🎛️ 内容生成参数</h3>
      <p class="text-sm text-light parameter-help">留空的参数不会发送给模型，由服务商使用默认值。</p>
      <div class="parameter-grid">
        <div class="form-group">
          <label>Temperature</label>
          <input v-model.number="config.temperature" type="number" min="0" max="2" step="0.1" placeholder="0.3" />
          <p class="field-help">越低越稳定，越高越有创造性（0～2）</p>
        </div>
        <div class="form-group">
          <label>Top P</label>
          <input v-model.number="config.topP" type="number" min="0" max="1" step="0.05" placeholder="留空" />
          <p class="field-help">核采样范围（0～1）</p>
        </div>
        <div class="form-group">
          <label>最大输出 Token</label>
          <input v-model.number="config.maxTokens" type="number" min="1" step="1" placeholder="留空" />
          <p class="field-help">限制单次生成的最大输出长度</p>
        </div>
        <div class="form-group">
          <label>Frequency Penalty</label>
          <input v-model.number="config.frequencyPenalty" type="number" min="-2" max="2" step="0.1" placeholder="留空" />
          <p class="field-help">减少相同词语重复（-2～2）</p>
        </div>
        <div class="form-group">
          <label>Presence Penalty</label>
          <input v-model.number="config.presencePenalty" type="number" min="-2" max="2" step="0.1" placeholder="留空" />
          <p class="field-help">鼓励引入新主题（-2～2）</p>
        </div>
      </div>

      <h3 class="section-title structure-title">📐 内容结构与产量</h3>
      <div class="parameter-grid">
        <div class="form-group">
          <label>关卡数量</label>
          <div class="range-inputs">
            <input v-model.number="config.minUnits" type="number" min="1" max="50" step="1" aria-label="最少关卡数" />
            <span>至</span>
            <input v-model.number="config.maxUnits" type="number" min="1" max="50" step="1" aria-label="最多关卡数" />
          </div>
          <p class="field-help">每次生成课程框架的关卡范围</p>
        </div>
        <div class="form-group">
          <label>每关小节数量</label>
          <div class="range-inputs">
            <input v-model.number="config.minSectionsPerUnit" type="number" min="1" max="20" step="1" aria-label="每关最少小节数" />
            <span>至</span>
            <input v-model.number="config.maxSectionsPerUnit" type="number" min="1" max="20" step="1" aria-label="每关最多小节数" />
          </div>
          <p class="field-help">每个关卡生成的小节范围</p>
        </div>
        <div class="form-group">
          <label>每小节题目数量</label>
          <input v-model.number="config.questionsPerSection" type="number" min="1" max="50" step="1" />
          <p class="field-help">全课程、单元和单小节生成统一使用</p>
        </div>
        <div class="form-group">
          <label>每小节混合题型上限</label>
          <input v-model.number="config.maxQuestionTypesPerSection" type="number" min="1" max="12" step="1" />
          <p class="field-help">从当前 CEFR 可用题型中随机选取</p>
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
import { useValidator } from '../composables/useValidator.js'

const storage = useStorage()
const llm = useLLM()
const { validateQuestion } = useValidator()

const config = ref({
  baseUrl: '',
  apiKey: '',
  model: 'gpt-4o-mini',
  imageModel: 'gpt-4o-mini',
  reviewModel: 'gpt-4o',
  temperature: 0.3,
  topP: null,
  maxTokens: null,
  frequencyPenalty: null,
  presencePenalty: null,
  minUnits: 5,
  maxUnits: 8,
  minSectionsPerUnit: 3,
  maxSectionsPerUnit: 5,
  questionsPerSection: 5,
  maxQuestionTypesPerSection: 3
})

const testing = ref(false)
const testResult = ref(null)
const modelOptions = ref([])
const modelsLoading = ref(false)
const modelStatus = ref('')
const modelError = ref(false)
const importInput = ref(null)
let saveTimer = null

async function fetchModels() {
  modelStatus.value = ''
  modelError.value = false
  modelsLoading.value = true
  try {
    const res = await fetch('/api/models', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        baseUrl: config.value.baseUrl,
        apiKey: config.value.apiKey
      })
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(data.error || `获取模型列表失败 (${res.status})`)

    const items = Array.isArray(data)
      ? data
      : Array.isArray(data.data)
        ? data.data
        : Array.isArray(data.models)
          ? data.models
          : []
    const ids = items
      .map(item => typeof item === 'string' ? item : item?.id || item?.model)
      .filter(Boolean)
    modelOptions.value = [...new Set(ids.map(String))]
    modelStatus.value = modelOptions.value.length
      ? `已获取 ${modelOptions.value.length} 个模型，可在输入框中输入关键字过滤。`
      : '服务商没有返回可用模型，请检查接口地址或手动输入模型名。'
    modelError.value = modelOptions.value.length === 0
  } catch (e) {
    modelError.value = true
    modelStatus.value = e.message || '获取模型列表失败'
  } finally {
    modelsLoading.value = false
  }
}

async function save() {
  const integerFields = ['minUnits', 'maxUnits', 'minSectionsPerUnit', 'maxSectionsPerUnit', 'questionsPerSection', 'maxQuestionTypesPerSection']
  for (const field of integerFields) config.value[field] = Math.max(1, Math.round(Number(config.value[field]) || 1))
  if (config.value.minUnits > config.value.maxUnits) {
    testResult.value = { success: false, message: '关卡数量的最小值不能大于最大值' }
    return false
  }
  if (config.value.minSectionsPerUnit > config.value.maxSectionsPerUnit) {
    testResult.value = { success: false, message: '每关小节数量的最小值不能大于最大值' }
    return false
  }
  await storage.saveApiConfig(config.value)
  testResult.value = { success: true, message: '配置已保存到配置文件' }
  clearTimeout(saveTimer)
  saveTimer = setTimeout(() => { testResult.value = null }, 3000)
  return true
}

async function testApi() {
  clearTimeout(saveTimer)
  if (!await save()) return
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

const BACKUP_TYPES = ['tasks', 'questions', 'production-log', 'system-config', 'vocabulary', 'unit-framework', 'prompts', 'question-types']

async function fetchStudioData(type) {
  const res = await fetch(`/api/data/${type}`)
  if (!res.ok) throw new Error(`读取 ${type} 失败 (${res.status})`)
  return res.json()
}

async function postStudioData(type, data) {
  const res = await fetch(`/api/data/${type}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  })
  if (!res.ok) {
    const detail = await res.json().catch(() => ({}))
    throw new Error(detail.error || `写入 ${type} 失败 (${res.status})`)
  }
}

function imageNamesFromQuestions(questions) {
  const names = new Set()
  for (const question of questions || []) {
    const targets = question.type === 'T01'
      ? [question]
      : question.type === 'T02' && Array.isArray(question.imageOptions)
        ? question.imageOptions
        : []
    for (const target of targets) {
      const filename = target.imageUrl?.split('/').pop()?.split('?')[0]
      if (filename) names.add(filename)
    }
  }
  return [...names]
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}

async function exportAllData() {
  try {
    const values = await Promise.all(BACKUP_TYPES.map(type => fetchStudioData(type)))
    const snapshot = Object.fromEntries(BACKUP_TYPES.map((type, index) => [type, values[index]]))
    const imageFiles = []
    for (const filename of imageNamesFromQuestions(snapshot.questions)) {
      const res = await fetch(`/api/images/${encodeURIComponent(filename)}`)
      if (res.ok) imageFiles.push({ filename, dataUrl: await blobToDataUrl(await res.blob()) })
    }
    const apiConfig = storage.getApiConfig()
    const data = {
      version: 2,
      exportedAt: new Date().toISOString(),
      apiConfig: { ...apiConfig, apiKey: '' },
      apiKeyExcluded: true,
      ...snapshot,
      images: imageFiles
    }
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `idioma-studio-backup-${Date.now()}.json`
    a.click()
    URL.revokeObjectURL(url)
    testResult.value = { success: true, message: `已导出完整数据（${imageFiles.length} 张图片，API Key 未导出）` }
  } catch (e) {
    testResult.value = { success: false, message: `导出失败: ${e.message}` }
  }
}

function importData() {
  importInput.value?.click()
}

async function handleImport(e) {
  const file = e.target.files[0]
  if (!file) return

  const reader = new FileReader()
  reader.onload = async (ev) => {
    try {
      const data = JSON.parse(ev.target.result)
      if (!Array.isArray(data.questions)) throw new Error('备份缺少 questions 数组')
      const questionIds = data.questions.map(question => question?.id)
      if (questionIds.some(id => typeof id !== 'string' || !id.trim()) || new Set(questionIds).size !== questionIds.length) {
        throw new Error('题目 ID 缺失或重复，已拒绝导入')
      }
      const invalidQuestions = data.questions.filter(question => !validateQuestion(question).valid)
      if (invalidQuestions.length) throw new Error(`有 ${invalidQuestions.length} 道题目未通过结构校验，已拒绝导入`)
      if (!confirm(`将覆盖当前题目及课程数据，导入 ${data.questions.length} 道题目。继续吗？`)) return
      for (const image of (Array.isArray(data.images) ? data.images : [])) {
        if (!image?.filename || !image?.dataUrl) continue
        const imageRes = await fetch('/api/images', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ filename: image.filename, dataUrl: image.dataUrl })
        })
        if (!imageRes.ok) throw new Error(`图片恢复失败: ${image.filename}`)
      }
      for (const type of BACKUP_TYPES) {
        if (type === 'questions' || data[type] === undefined) continue
        await postStudioData(type, data[type])
      }
      await storage.replaceQuestions(data.questions)
      if (data.apiConfig) {
        const current = storage.getApiConfig()
        await storage.saveApiConfig({ ...current, ...data.apiConfig, apiKey: data.apiConfig.apiKey || current.apiKey })
      }
      testResult.value = { success: true, message: `导入成功: ${data.questions.length} 道题目，正在刷新页面` }
      setTimeout(() => window.location.reload(), 500)
      return
      /*
      if (false && data.questions) {
        // 清空旧题目后导入新题目（写入服务端）
        storage.clearAllQuestions()
        storage.saveQuestions(data.questions)
      }
      testResult.value = { success: true, message: `导入成功: ${data.questions?.length || 0} 道题目` }
      */
    } catch (err) {
      testResult.value = { success: false, message: '导入失败: ' + err.message }
    }
  }
  reader.readAsText(file)
  e.target.value = ''
}

async function clearData() {
  if (confirm('确认清空所有题目数据？此操作不可恢复。')) {
    try {
      await storage.clearAllQuestions()
    } catch (e) {
      testResult.value = { success: false, message: `清空失败: ${e.message}` }
      return
    }
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
.section-title { margin-top: 24px; margin-bottom: 4px; }
.model-toolbar {
  margin-top: 24px;
  margin-bottom: 12px;
  display: flex;
  align-items: end;
  justify-content: space-between;
  gap: 16px;
}
.model-title { margin: 0 0 4px; }
.btn-fetch-models { white-space: nowrap; }
.model-status {
  margin: 0 0 12px;
  color: var(--green);
  font-size: 12px;
}
.model-status.error { color: #b91c1c; }
.structure-title { margin-bottom: 14px; }
.parameter-help { margin-bottom: 14px; }
.parameter-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0 16px;
}
.field-help {
  color: var(--text-light);
  font-size: 12px;
  margin-top: 5px;
}
.range-inputs { display: flex; align-items: center; gap: 8px; }
.range-inputs input { min-width: 0; }
@media (max-width: 600px) {
  .parameter-grid { grid-template-columns: 1fr; }
  .model-toolbar { align-items: stretch; flex-direction: column; gap: 8px; }
  .btn-fetch-models { align-self: flex-start; }
}
</style>
