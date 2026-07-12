/**
 * 题型存储模块
 * 数据持久化到服务端 data/question-types.json
 * 结构: [ { id: 'T01', title: '...', levels: ['A1', 'A2'], description: '...' }, ... ]
 */
import { ref } from 'vue'
import { QUESTION_TYPES, CEFR_TYPE_MAP } from '../data/question-types.js'
import { enqueueJsonSave } from '../utils/dataPersistence.js'

function buildDefaultTypes() {
  return Object.entries(QUESTION_TYPES).map(([id, info]) => {
    const levels = []
    Object.entries(CEFR_TYPE_MAP).forEach(([level, typeIds]) => {
      if (typeIds.includes(id) && !level.includes('-')) {
        levels.push(level)
      }
    })
    return {
      id,
      title: info.name,
      levels: levels.length > 0 ? levels : ['A1', 'A2'],
      description: `交互形式：${info.interaction}。训练技能：${info.skill}。认知层次：${info.cognitive}。约束：${info.promptHint}`
    }
  })
}

const types = ref([])

async function saveToServer() {
  try {
    await enqueueJsonSave('question-types', types.value)
  } catch (e) {
    console.warn('[question-types] 保存到服务端失败:', e.message)
  }
}

export function useQuestionTypeStorage() {
  function updateType(id, updates) {
    const idx = types.value.findIndex(t => t.id === id)
    if (idx >= 0) {
      types.value[idx] = { ...types.value[idx], ...updates }
      saveToServer()
    }
  }

  function deleteType(id) {
    types.value = types.value.filter(t => t.id !== id)
    saveToServer()
  }

  function addType(type) {
    if (!type?.id || types.value.some(item => item.id === type.id)) return false
    types.value.push(type)
    saveToServer()
    return true
  }

  return {
    types,
    updateType,
    deleteType,
    addType,
    saveTypes: saveToServer
  }
}

// ---- 全局初始化（main.js 调用一次） ----
export async function init() {
  try {
    const res = await fetch('/api/data/question-types')
    if (res.ok) {
      const data = await res.json()
      if (Array.isArray(data) && data.length > 0) {
        const defaults = buildDefaultTypes()
        const stored = new Map(data.filter(item => item?.id).map(item => [item.id, item]))
        const builtins = defaults.map(def => {
          const saved = stored.get(def.id)
          if (!saved) return def
          return {
            ...def,
            ...saved,
            levels: def.levels
          }
        })
        const custom = data.filter(item => item?.id && !QUESTION_TYPES[item.id])
        types.value = [...builtins, ...custom]
        if (JSON.stringify(types.value) !== JSON.stringify(data)) await saveToServer()
        return
      }
    }
  } catch { /* 无数据 */ }
  // 服务端无数据时用代码中的默认定义初始化并保存
  types.value = buildDefaultTypes()
  await saveToServer()
}

export default useQuestionTypeStorage
