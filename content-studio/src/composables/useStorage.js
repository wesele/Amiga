/**
 * 数据存储模块
 * - 所有数据持久化到服务端 data/ 目录下的 JSON 文件
 * - API 配置仍走 studio.config.json（与其他数据分开管理）
 */

import { migrateQuestionSectionIds } from '../utils/sectionId.js'
import { migrateQuestionFields } from '../utils/normalizeQuestion.js'
import {
  loadQuestionIndex, loadQuestionShard, replaceSectionQuestions as replaceSectionRemote,
  saveQuestionShard
} from '../services/questionClient.js'
import { shouldPersistQuestionLevelClear } from '../utils/questionPersistence.js'
import { createKeyedSerialQueue } from '../utils/keyedSerialQueue.js'

const DEFAULT_CONFIG = {
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
}

// 模块级内存缓存
let _tasks = []
let _questions = []
const questionRevisions = new Map()
const questionSaveQueue = createKeyedSerialQueue()
let _productionLog = []
const saveQueues = new Map()
const saveErrors = new Map()

async function saveData(type, data) {
  try {
    const res = await fetch(`/api/data/${type}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    })
    if (!res.ok) {
      const detail = await res.json().catch(() => ({}))
      throw new Error(detail.error || `${type} 保存失败 (${res.status})`)
    }
    saveErrors.delete(type)
  } catch (e) {
    console.warn(`[${type}] 保存到服务端失败:`, e.message)
    saveErrors.set(type, e)
    throw e
  }
}

function enqueueSave(type, data) {
  const previous = saveQueues.get(type) || Promise.resolve()
  const current = previous.catch(() => {}).then(() => saveData(type, data))
  saveQueues.set(type, current)
  const cleanup = () => {
    if (saveQueues.get(type) === current) saveQueues.delete(type)
  }
  current.then(cleanup, cleanup)
  return current
}

function flushData(type) {
  return saveQueues.get(type) || Promise.resolve()
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
  async function ensureQuestionRevision(pairId, cefr) {
    const key = `${pairId}\u0000${cefr}`
    if (questionRevisions.has(key)) return questionRevisions.get(key)
    const result = await loadQuestionShard(pairId, cefr)
    questionRevisions.set(key, result.revision)
    return result.revision
  }

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
      const res = await fetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      })
      if (!res.ok) throw new Error(`API 配置保存失败 (${res.status})`)
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
    void enqueueSave('tasks', _tasks).catch(() => {})
    return task
  }

  function deleteTask(taskId) {
    _tasks = _tasks.filter(t => t.taskId !== taskId)
    void enqueueSave('tasks', _tasks).catch(() => {})
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
    if (filter.pairId) questions = questions.filter(q => q.pairId === filter.pairId)
    return questions
  }

  function saveQuestions(newQuestions) {
    const byId = new Map(_questions.map(question => [question.id, question]))
    for (const question of (Array.isArray(newQuestions) ? newQuestions : [])) {
      if (!question || typeof question !== 'object') continue
      if (question.id) byId.set(question.id, question)
    }
    _questions = [...byId.values()]
    return persistAffectedShards(newQuestions).then(() => _questions)
  }

  function deleteQuestions(ids) {
    const removed = _questions.filter(q => ids.includes(q.id))
    _questions = _questions.filter(q => !ids.includes(q.id))
    return persistAffectedShards(removed)
  }

  function clearAllQuestions() {
    const affected = [..._questions]
    _questions = []
    return persistAffectedShards(affected)
  }

  async function clearQuestionLevel(pairId, cefr) {
    const removed = _questions.filter(q => q.pairId === pairId && q.cefr === cefr)
    const key = `${pairId}\u0000${cefr}`
    if (!shouldPersistQuestionLevelClear(removed.length, questionRevisions.has(key))) return
    _questions = _questions.filter(q => q.pairId !== pairId || q.cefr !== cefr)
    await persistAffectedShards(removed.length ? removed : [{ pairId, cefr }])
  }

  function replaceQuestions(newQuestions) {
    const affected = [..._questions, ...(Array.isArray(newQuestions) ? newQuestions : [])]
    _questions = Array.isArray(newQuestions) ? [...newQuestions] : []
    return persistAffectedShards(affected)
  }

  function persistQuestions() {
    return persistAffectedShards(_questions)
  }

  function persistQuestion(question) {
    return persistAffectedShards(question ? [question] : [])
  }

  async function persistAffectedShards(questions) {
    const keys = new Set((questions || []).filter(q => q?.pairId && q?.cefr).map(q => `${q.pairId}\u0000${q.cefr}`))
    for (const key of keys) {
      const [pairId, cefr] = key.split('\u0000')
      await questionSaveQueue.enqueue(key, async () => {
        await ensureQuestionRevision(pairId, cefr)
        const shard = _questions.filter(q => q.pairId === pairId && q.cefr === cefr)
        const result = await saveQuestionShard(pairId, cefr, shard, questionRevisions.get(key))
        questionRevisions.set(key, result.revision)
      })
    }
  }

  async function replaceSectionQuestions(pairId, cefr, unitId, sectionId, questions) {
    const key = `${pairId}\u0000${cefr}`
    return questionSaveQueue.enqueue(key, async () => {
      await ensureQuestionRevision(pairId, cefr)
      const result = await replaceSectionRemote(pairId, cefr, unitId, sectionId, questions, questionRevisions.get(key))
      _questions = _questions.filter(q => !(q.pairId === pairId && q.cefr === cefr))
      _questions.push(...result.data)
      questionRevisions.set(key, result.revision)
      return result
    })
  }

  // ---- 生产日志 ----
  function getProductionLog() {
    return _productionLog
  }

  function addLogEntry(entry) {
    _productionLog.unshift({ ...entry, timestamp: Date.now() })
    if (_productionLog.length > 100) _productionLog.length = 100
    void enqueueSave('production-log', _productionLog).catch(() => {})
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
      byCEFR: Object.fromEntries(
        [...new Set(_questions.map(q => q.cefr).filter(Boolean))]
          .sort()
          .map(level => [level, _questions.filter(q => q.cefr === level).length])
      ),
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
    getQuestions, saveQuestions, replaceQuestions, deleteQuestions, clearAllQuestions, clearQuestionLevel, persistQuestions, persistQuestion, replaceSectionQuestions,
    flushData, getLastSaveError: type => saveErrors.get(type) || null,
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
  _questions = []
  const { data: questionIndex } = await loadQuestionIndex()
  for (const shard of questionIndex.shards || []) {
    const result = await loadQuestionShard(shard.pairId, shard.cefr)
    _questions.push(...result.data)
    questionRevisions.set(`${shard.pairId}\u0000${shard.cefr}`, result.revision)
  }
  _productionLog = await loadData('production-log', [])

  const { questions: sectionMigrated, changed: sectionChanged } = migrateQuestionSectionIds(_questions)
  if (sectionChanged > 0) {
    _questions = sectionMigrated
    await persistMigratedQuestions(_questions)
    console.log(`[questions] 已迁移 ${sectionChanged} 道题目的 sectionId / pairId`)
  }

  let pairConfigMap = {}
  try {
    const systemConfig = await loadData('system-config', { languagePairs: [] })
    const { buildPairConfigMap } = await import('../utils/normalizeQuestion.js')
    pairConfigMap = buildPairConfigMap(systemConfig.languagePairs)
  } catch { /* 使用空映射，normalizeLanguage 仍可做字段级归一 */ }

  const { questions: normalized, changed: normChanged, stats } = migrateQuestionFields(_questions, pairConfigMap)
  if (normChanged > 0) {
    _questions = normalized
    await persistMigratedQuestions(_questions)
    console.log(`[questions] 已归一化 ${normChanged}/${_questions.length} 道题目`, stats)
  }
}

async function persistMigratedQuestions(questions) {
  const keys = new Set(questions.filter(q => q?.pairId && q?.cefr).map(q => `${q.pairId}\u0000${q.cefr}`))
  for (const key of keys) {
    const [pairId, cefr] = key.split('\u0000')
    const result = await saveQuestionShard(
      pairId, cefr, questions.filter(q => q.pairId === pairId && q.cefr === cefr), questionRevisions.get(key)
    )
    questionRevisions.set(key, result.revision)
  }
}

// 内部引用（getVocabCoverage 需要访问词库状态）
import { useVocabStorage } from './useVocabStorage.js'

export default useStorage
