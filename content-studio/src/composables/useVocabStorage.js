/**
 * 词库存储模块
 * 数据持久化到服务端 data/vocabulary.json
 * 结构: { 
 *   languages: ["西班牙语", "法语"], 
 *   data: { "西班牙语": { "A1": "word1, word2", ... }, ... } 
 * }
 */
import { ref } from 'vue'

const state = ref({ languages: [], data: {}, pairLangMap: {} })

function _resolveLang(langOrPairId) {
  if (state.value.pairLangMap[langOrPairId]) {
    return state.value.pairLangMap[langOrPairId]
  }
  if (state.value.data[langOrPairId]) {
    return langOrPairId
  }
  return langOrPairId
}

async function saveToServer() {
  try {
    await fetch('/api/data/vocabulary', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(state.value)
    })
  } catch (e) {
    console.warn('[vocabulary] 保存到服务端失败:', e.message)
  }
}

export function useVocabStorage() {
  // ---- 语言管理 ----
  function addLanguage(lang) {
    if (lang && !state.value.languages.includes(lang)) {
      state.value.languages.push(lang)
      state.value.data[lang] = {}
      saveToServer()
    }
  }

  function removeLanguage(lang) {
    state.value.languages = state.value.languages.filter(l => l !== lang)
    delete state.value.data[lang]
    saveToServer()
  }

  // ---- 级别管理 ----
  function getLevels(lang) {
    if (!state.value.data[lang]) return []
    return Object.keys(state.value.data[lang]).sort()
  }

  function addLevel(lang, level) {
    if (!state.value.data[lang]) state.value.data[lang] = {}
    if (!state.value.data[lang][level]) {
      state.value.data[lang][level] = ''
      saveToServer()
    }
  }

  function removeLevel(lang, level) {
    if (state.value.data[lang]) {
      delete state.value.data[lang][level]
      saveToServer()
    }
  }

  // ---- 单词管理 ----
  function getWords(lang, level) {
    const resolved = _resolveLang(lang)
    return state.value.data[resolved]?.[level] || ''
  }

  function setWords(lang, level, words) {
    const resolved = _resolveLang(lang)
    if (!state.value.data[resolved]) state.value.data[resolved] = {}
    state.value.data[resolved][level] = words
    saveToServer()
  }

  function registerPairId(pairId, targetLang) {
    if (pairId && targetLang) {
      state.value.pairLangMap[pairId] = targetLang
      saveToServer()
    }
  }

  return {
    state,
    addLanguage, removeLanguage,
    getLevels, addLevel, removeLevel,
    getWords, setWords, registerPairId,
    saveState: saveToServer
  }
}

// ---- 全局初始化（main.js 调用一次） ----
export async function init() {
  try {
    const res = await fetch('/api/data/vocabulary')
    if (res.ok) {
      const data = await res.json()
      if (data.languages && Array.isArray(data.languages)) {
        state.value = { pairLangMap: {}, ...data }
      }
    }
  } catch { /* 首次启动，使用默认值 */ }
}

export default useVocabStorage
