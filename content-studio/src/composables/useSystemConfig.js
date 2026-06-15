/**
 * 系统配置模块
 * 管理语言组合及其对应的 CEFR 级别
 * 数据持久化到服务端 data/system-config.json
 */
import { ref } from 'vue'

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
    await fetch('/api/data/system-config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config.value)
    })
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

  function deleteLanguagePair(id) {
    config.value.languagePairs = config.value.languagePairs.filter(p => p.id !== id)
    if (config.value.activePairId === id) {
      config.value.activePairId = config.value.languagePairs[0]?.id || ''
    }
    saveToServer()
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

  function removeCEFRLevel(pairId, level) {
    const pair = config.value.languagePairs.find(p => p.id === pairId)
    if (pair) {
      pair.cefrLevels = pair.cefrLevels.filter(l => l !== level)
      saveToServer()
    }
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
