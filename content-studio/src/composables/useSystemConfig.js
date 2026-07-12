/**
 * 系统配置模块
 * 管理语言组合及其对应的 CEFR 级别
 * 数据持久化到服务端 data/system-config.json
 */
import { ref } from 'vue'
import { enqueueJsonSave } from '../utils/dataPersistence.js'

const DEFAULT_CONFIG = {
  languagePairs: [
    {
      id: 'zh-es',
      from: '中文',
      to: '西班牙语',
      cefrLevels: ['A1', 'A2']
    }
  ],
  activePairId: 'zh-es'
}

const config = ref({ ...DEFAULT_CONFIG })

async function saveToServer() {
  try {
    await enqueueJsonSave('system-config', config.value)
  } catch (e) {
    console.warn('[system-config] 保存到服务端失败:', e.message)
  }
}

export function useSystemConfig() {
  // ---- 语言组合管理 ----
  function addLanguagePair(pair) {
    const newPair = {
      id: `pair_${Date.now()}`,
      ...pair,
      cefrLevels: pair.cefrLevels || ['A1', 'A2']
    }
    config.value.languagePairs.push(newPair)
    saveToServer()
    return newPair
  }

  function updateLanguagePair(id, updates) {
    const idx = config.value.languagePairs.findIndex(p => p.id === id)
    if (idx >= 0) {
      config.value.languagePairs[idx] = { ...config.value.languagePairs[idx], ...updates }
      saveToServer()
    }
  }

  async function deleteLanguagePair(id) {
    const pair = config.value.languagePairs.find(p => p.id === id)
    if (!pair) return false
    const remainingPairs = config.value.languagePairs.filter(p => p.id !== id)
    const [questionsRes, frameworkRes, vocabularyRes] = await Promise.all([
      fetch('/api/data/questions'),
      fetch('/api/data/unit-framework'),
      fetch('/api/data/vocabulary')
    ])
    if (!questionsRes.ok || !frameworkRes.ok || !vocabularyRes.ok) throw new Error('读取关联数据失败')
    const questions = await questionsRes.json()
    const framework = await frameworkRes.json()
    const vocabulary = await vocabularyRes.json()
    const removedQuestions = Array.isArray(questions)
      ? questions.filter(q => q.pairId === id || String(q.sectionId || '').startsWith(`${id}/`))
      : []
    const nextQuestions = Array.isArray(questions)
      ? questions.filter(q => q.pairId !== id && !String(q.sectionId || '').startsWith(`${id}/`))
      : []
    const nextFramework = { ...(framework || {}) }
    delete nextFramework[id]
    const nextVocabulary = { ...(vocabulary || {}), pairLangMap: { ...(vocabulary?.pairLangMap || {}) } }
    delete nextVocabulary.pairLangMap[id]
    if (!remainingPairs.some(p => p.to === pair.to)) {
      nextVocabulary.languages = (nextVocabulary.languages || []).filter(lang => lang !== pair.to)
      if (nextVocabulary.data) {
        nextVocabulary.data = { ...nextVocabulary.data }
        delete nextVocabulary.data[pair.to]
      }
    }
    await Promise.all([
      enqueueJsonSave('questions', nextQuestions),
      enqueueJsonSave('unit-framework', nextFramework),
      enqueueJsonSave('vocabulary', nextVocabulary)
    ])
    const imageNames = new Set()
    for (const question of removedQuestions) {
      const targets = question.type === 'T01'
        ? [question]
        : question.type === 'T02' && Array.isArray(question.imageOptions)
          ? question.imageOptions
          : []
      for (const target of targets) {
        const filename = target.imageUrl?.split('/').pop()?.split('?')[0]
        if (filename) imageNames.add(filename)
      }
    }
    if (imageNames.size) {
      await fetch('/api/images/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filenames: [...imageNames] })
      })
    }
    config.value.languagePairs = remainingPairs
    if (config.value.activePairId === id) config.value.activePairId = remainingPairs[0]?.id || ''
    await saveToServer()
    return true
  }

  // ---- CEFR 级别管理 ----
  function addCEFRLevel(pairId, level) {
    const pair = config.value.languagePairs.find(p => p.id === pairId)
    if (pair && !pair.cefrLevels.includes(level)) {
      pair.cefrLevels.push(level)
      pair.cefrLevels.sort()
      saveToServer()
    }
  }

  async function removeCEFRLevel(pairId, level) {
    const pair = config.value.languagePairs.find(p => p.id === pairId)
    if (!pair) return false
    const [questionsRes, frameworkRes] = await Promise.all([
      fetch('/api/data/questions'),
      fetch('/api/data/unit-framework')
    ])
    if (!questionsRes.ok || !frameworkRes.ok) throw new Error('读取等级关联数据失败')
    const questions = await questionsRes.json()
    const framework = await frameworkRes.json()
    const removedQuestions = Array.isArray(questions)
      ? questions.filter(q => q.pairId === pairId && q.cefr === level)
      : []
    const nextQuestions = Array.isArray(questions)
      ? questions.filter(q => !(q.pairId === pairId && q.cefr === level))
      : []
    const nextFramework = { ...(framework || {}) }
    if (nextFramework[pairId]) {
      nextFramework[pairId] = { ...nextFramework[pairId] }
      delete nextFramework[pairId][level]
    }
    await Promise.all([
      enqueueJsonSave('questions', nextQuestions),
      enqueueJsonSave('unit-framework', nextFramework)
    ])
    const imageNames = new Set()
    for (const question of removedQuestions) {
      const targets = question.type === 'T01'
        ? [question]
        : question.type === 'T02' && Array.isArray(question.imageOptions)
          ? question.imageOptions
          : []
      for (const target of targets) {
        const filename = target.imageUrl?.split('/').pop()?.split('?')[0]
        if (filename) imageNames.add(filename)
      }
    }
    if (imageNames.size) {
      await fetch('/api/images/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filenames: [...imageNames] })
      })
    }
    pair.cefrLevels = pair.cefrLevels.filter(l => l !== level)
    await saveToServer()
    return true
  }

  function updateCEFRLevels(pairId, levels) {
    const pair = config.value.languagePairs.find(p => p.id === pairId)
    if (pair) {
      pair.cefrLevels = [...levels].sort()
      saveToServer()
    }
  }

  async function saveConfig() {
    await saveToServer()
  }

  return {
    config,
    addLanguagePair, updateLanguagePair, deleteLanguagePair,
    addCEFRLevel, removeCEFRLevel, updateCEFRLevels,
    saveConfig
  }
}

// ---- 全局初始化（main.js 调用一次） ----
export async function init() {
  try {
    const res = await fetch('/api/data/system-config')
    if (res.ok) {
      const data = await res.json()
      if (data.languagePairs) {
        config.value = { ...DEFAULT_CONFIG, ...data }
      }
    }
  } catch { /* 首次启动，使用默认值 */ }
}

export default useSystemConfig
