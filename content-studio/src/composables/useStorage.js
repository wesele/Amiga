/**
 * 数据存储模块
 * - 所有数据持久化到服务端 data/ 目录下的 JSON 文件
 * - API 配置仍走 studio.config.json（与其他数据分开管理）
 */

const DEFAULT_CONFIG = { baseUrl: '', apiKey: '', model: 'gpt-4o-mini', reviewModel: 'gpt-4o' }

// 模块级内存缓存
let _tasks = []
let _questions = []
let _productionLog = []

async function saveData(type, data) {
  try {
    await fetch(`/api/data/${type}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    })
  } catch (e) {
    console.warn(`[${type}] 保存到服务端失败:`, e.message)
  }
}

async function loadData(type, fallback) {
  try {
    const res = await fetch(`/api/data/${type}`)
    if (res.ok) {
      const data = await res.json()
      // 服务端返回 {} 时视为无数据
      if (Array.isArray(fallback) && !Array.isArray(data)) return fallback
      return data
    }
  } catch { /* 无数据 */ }
  return fallback
}

export function useStorage() {
  // ---- API 配置（仍走 /api/config → studio.config.json）----
  function getApiConfig() {
    try {
      return { ...DEFAULT_CONFIG, ...JSON.parse(localStorage.getItem('idioma-studio:api-config-cache')) }
    } catch {
      return { ...DEFAULT_CONFIG }
    }
  }

  async function fetchApiConfig() {
    try {
      const res = await fetch('/api/config')
      if (res.ok) {
        const data = { ...DEFAULT_CONFIG, ...await res.json() }
        localStorage.setItem('idioma-studio:api-config-cache', JSON.stringify(data))
        return data
      }
    } catch { /* 服务端不可用 */ }
    return getApiConfig()
  }

  async function saveApiConfig(config) {
    const data = { ...DEFAULT_CONFIG, ...config }
    localStorage.setItem('idioma-studio:api-config-cache', JSON.stringify(data))
    try {
      await fetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      })
    } catch (e) {
      console.warn('服务端配置保存失败:', e.message)
    }
  }

  // ---- 任务 ----
  function getTasks() {
    return _tasks
  }

  function saveTask(task) {
    const idx = _tasks.findIndex(t => t.taskId === task.taskId)
    if (idx >= 0) {
      _tasks[idx] = { ..._tasks[idx], ...task, updatedAt: Date.now() }
    } else {
      _tasks.push({ ...task, createdAt: Date.now(), updatedAt: Date.now() })
    }
    saveData('tasks', _tasks)
    return task
  }

  function deleteTask(taskId) {
    _tasks = _tasks.filter(t => t.taskId !== taskId)
    saveData('tasks', _tasks)
  }

  // ---- 题目 ----
  function getQuestions(filter = {}) {
    let questions = _questions
    if (filter.cefr) questions = questions.filter(q => q.cefr === filter.cefr)
    if (filter.unit) questions = questions.filter(q => q.unit === filter.unit)
    if (filter.type) questions = questions.filter(q => q.type === filter.type)
    if (filter.language) questions = questions.filter(q => q.language === filter.language)
    if (filter.taskId) questions = questions.filter(q => q._taskId === filter.taskId)
    if (filter.sectionId) questions = questions.filter(q => q.sectionId === filter.sectionId)
    return questions
  }

  function saveQuestions(newQuestions) {
    _questions = [..._questions, ...newQuestions]
    saveData('questions', _questions)
    return _questions
  }

  function deleteQuestions(ids) {
    _questions = _questions.filter(q => !ids.includes(q.id))
    saveData('questions', _questions)
  }

  function clearAllQuestions() {
    _questions = []
    saveData('questions', _questions)
  }

  // ---- 生产日志 ----
  function getProductionLog() {
    return _productionLog
  }

  function addLogEntry(entry) {
    _productionLog.unshift({ ...entry, timestamp: Date.now() })
    if (_productionLog.length > 100) _productionLog.length = 100
    saveData('production-log', _productionLog)
  }

  // ---- 导出 ----
  function exportQuestionsJSON(filter = {}) {
    const questions = getQuestions(filter)
    const clean = questions.map(({ _taskId, ...rest }) => rest)
    const blob = new Blob([JSON.stringify(clean, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    const name = filter.taskId || filter.cefr || 'all'
    a.download = `idioma-questions-${name.toLowerCase()}-${Date.now()}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  function getStats() {
    return {
      totalQuestions: _questions.length,
      totalTasks: _tasks.length,
      byCEFR: {
        A1: _questions.filter(q => q.cefr === 'A1').length,
        A2: _questions.filter(q => q.cefr === 'A2').length
      },
      byType: Object.fromEntries(
        [...new Set(_questions.map(q => q.type))].map(t => [t, _questions.filter(q => q.type === t).length])
      ),
      pendingReview: _questions.filter(q => q.status === 'pending').length,
      approved: _questions.filter(q => q.status === 'approved').length
    }
  }

  function getVocabCoverage() {
    // 使用服务端词库数据计算覆盖率
    const allText = _questions.map(q => JSON.stringify(q)).join(' ').toLowerCase()
    try {
      // 从内存中读取词库（由 useVocabStorage 管理，init 时已加载）
      const { state } = useVocabStorage()
      const vocab = state.value
      const results = []

      for (const lang of (vocab.languages || [])) {
        for (const level of Object.keys(vocab.data[lang] || {})) {
          const wordStr = vocab.data[lang][level] || ''
          const wordList = wordStr.split(',').map(w => w.trim()).filter(Boolean)
          const covered = wordList.filter(word => {
            const w = word.toLowerCase()
            if (w.includes(' ')) return allText.includes(w)
            const re = new RegExp(`\\b${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i')
            return re.test(allText)
          })
          results.push({
            lang, level,
            total: wordList.length,
            covered: covered.length,
            percent: wordList.length > 0 ? Math.round((covered.length / wordList.length) * 100) : 0,
            uncovered: wordList.filter(word => {
              const w = word.toLowerCase()
              if (w.includes(' ')) return !allText.includes(w)
              const re = new RegExp(`\\b${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i')
              return !re.test(allText)
            })
          })
        }
      }

      const totalVocab = results.reduce((s, u) => s + u.total, 0)
      const totalCovered = results.reduce((s, u) => s + u.covered, 0)
      return {
        units: results,
        totalVocab,
        totalCovered,
        totalPercent: totalVocab > 0 ? Math.round((totalCovered / totalVocab) * 100) : 0
      }
    } catch {
      return { units: [], totalVocab: 0, totalCovered: 0, totalPercent: 0 }
    }
  }

  return {
    getApiConfig, fetchApiConfig, saveApiConfig,
    getTasks, saveTask, deleteTask,
    getQuestions, saveQuestions, deleteQuestions, clearAllQuestions,
    getProductionLog, addLogEntry,
    exportQuestionsJSON, getStats, getVocabCoverage
  }
}

// ---- 全局初始化（main.js 调用一次） ----
export async function init() {
  // API config 缓存
  try {
    const res = await fetch('/api/config')
    if (res.ok) {
      const data = { ...DEFAULT_CONFIG, ...await res.json() }
      localStorage.setItem('idioma-studio:api-config-cache', JSON.stringify(data))
    }
  } catch { /* 使用缓存 */ }

  // 加载其他数据
  _tasks = await loadData('tasks', [])
  _questions = await loadData('questions', [])
  _productionLog = await loadData('production-log', [])
}

// 内部引用（getVocabCoverage 需要访问词库状态）
import { useVocabStorage } from './useVocabStorage.js'

export default useStorage
