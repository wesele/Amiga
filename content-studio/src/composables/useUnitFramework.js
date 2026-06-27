/**
 * 单元框架模块
 * 数据持久化到服务端 data/unit-framework.json
 */
import { ref } from 'vue'
import { useLLM } from './useLLM.js'
import { usePromptStorage } from './usePromptStorage.js'
import { useAsyncOperation } from './useAsyncOperation.js'

// 工具：流式调用直到拿到完整内容
async function streamPrompt(llm, prompt, options = {}) {
  const asyncOp = useAsyncOperation()
  let accumulated = ''
  let tokens = 0
  let reasoning = 0

  await llm.callLLMStream(prompt, {
    signal: options.signal,
    temperature: 0.7,
    maxTokens: 16384,
    onContent: (token, full) => {
      accumulated = full
      tokens++
      if (tokens % 5 === 0 || tokens <= 3) {
        asyncOp.setMessage(`正在生成内容... 已接收 ${tokens} 个 token`)
      }
    },
    onReasoning: (token, full) => {
      reasoning++
      if (reasoning % 10 === 0) {
        asyncOp.setMessage(`模型思考中... (${reasoning} tokens)`)
      }
    },
    onDone: ({ content }) => { accumulated = content || '' },
    onError: (err) => { throw err }
  })

  if (!accumulated) {
    asyncOp.addLog('流式结果为空，尝试非流式...', 'warning')
    const result = await llm.callLLM(prompt, { signal: options.signal })
    accumulated = result.content
  }

  return accumulated
}

// 工具：从文本中提取并解析 JSON 数组
function extractJSON(text) {
  const m = text.match(/\[\s*\{.*\}\s*\]/s)
  if (!m) throw new Error('无法从 AI 响应中解析 JSON 数组')
  return JSON.parse(m[0])
}

const framework = ref({})

async function saveToServer() {
  try {
    await fetch('/api/data/unit-framework', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(framework.value)
    })
  } catch (e) {
    console.warn('[unit-framework] 保存到服务端失败:', e.message)
  }
}

export function useUnitFramework() {
  const llm = useLLM()
  const promptStorage = usePromptStorage()
  const asyncOp = useAsyncOperation()

  function getFramework(lang, level) {
    return framework.value[lang]?.[level]?.units || []
  }

  function setFramework(lang, level, units) {
    if (!framework.value[lang]) framework.value[lang] = {}
    framework.value[lang][level] = { units }
    saveToServer()
  }

  let _signal = null

  /**
   * 两步生成：
   * Step 1: 设计整体框架（单元数、每个单元的基本目标、词汇数、语法点、场景）
   * Step 2: 循环为每个单元生成小节（小节主题、覆盖的单词列表）
   */
  async function generateFrameworkWithAI(fromLang, toLang, level, vocabulary, options = {}) {
    const pairId = options.pairId || toLang
    _signal = options.signal || null
    const vocabList = vocabulary
      ? vocabulary.split(',').map(v => v.trim()).filter(Boolean)
      : []

    // ======= Step 1: 设计整体框架 =======
    asyncOp.addLog(`Step 1/2: 设计 ${toLang} ${level} 级别的单元框架...`, 'info')
    asyncOp.setMessage('正在设计整体框架结构...')

    const step1Prompt = buildStep1Prompt(fromLang, toLang, level, vocabList)
    asyncOp.addLog('第 1 步：调用大模型设计关卡框架...', 'info')

    const step1Raw = await streamPrompt(llm, step1Prompt, { signal: _signal })
    let units
    try {
      units = extractJSON(step1Raw)
    } catch (e) {
      asyncOp.addLog('解析框架 JSON 失败，尝试降级...', 'warning')
      const fallback = await llm.callLLM(step1Prompt, { signal: _signal })
      units = extractJSON(fallback.content)
    }

    asyncOp.addLog(`第 1 步完成，共 ${units.length} 个关卡`, 'success')

    // ======= Step 2: 循环为每个单元生成小节 =======
    let remainingVocab = [...vocabList]

    for (let i = 0; i < units.length; i++) {
      if (_signal?.aborted) {
        asyncOp.addLog(`第 ${i + 1} 个关卡生成被取消`, 'warning')
        break
      }

      const unit = units[i]
      asyncOp.addLog(`Step 2/2 - 关卡 ${i + 1}/${units.length}: ${unit.titleNative || unit.titleTarget}`, 'info')
      asyncOp.setMessage(`正在生成第 ${i + 1}/${units.length} 个关卡的细节...`)

      const step2Prompt = buildStep2Prompt(fromLang, toLang, level, unit, i + 1, vocabList, remainingVocab)
      asyncOp.addLog(`传入 ${remainingVocab.length} 个未覆盖单词供参考...`, 'info')

      const step2Raw = await streamPrompt(llm, step2Prompt, { signal: _signal })
      let sections
      try {
        sections = extractJSON(step2Raw)
      } catch (e) {
        asyncOp.addLog(`解析小节 JSON 失败，尝试降级...`, 'warning')
        const fallback = await llm.callLLM(step2Prompt, { signal: _signal })
        sections = extractJSON(fallback.content)
      }

      // 规范化小节字段
      unit.sections = sections.map((s, idx) => ({
        id: s.id || `S${String(idx + 1).padStart(2, '0')}`,
        titleNative: s.titleNative || s.titleCN || s.title || '',
        titleTarget: s.titleTarget || s.title || '',
        coveredWords: Array.isArray(s.coveredWords) ? s.coveredWords : [],
        grammarPoint: s.grammarPoint || s.grammar || '',
        scenario: s.scenario || ''
      }))

      // 从剩余词汇中移除本单元已覆盖的单词
      const thisUnitWords = new Set()
      unit.sections.forEach(sec => {
        sec.coveredWords.forEach(w => thisUnitWords.add(w))
      })
      remainingVocab = remainingVocab.filter(w => !thisUnitWords.has(w))

      asyncOp.addLog(`关卡 ${i + 1} 完成：${unit.sections.length} 个小节，覆盖 ${thisUnitWords.size} 个单词`, 'success')
    }

    // 规范化单元字段
    units.forEach((u, idx) => {
      u.id = u.id || `U${String(idx + 1).padStart(2, '0')}`
      u.titleNative = u.titleNative || u.titleCN || u.title || ''
      u.titleTarget = u.titleTarget || u.title || ''
      u.goalNative = u.goalNative || u.goalCN || u.goal || ''
      u.goalTarget = u.goalTarget || u.goal || ''
      u.vocabCount = u.vocabCount || 0
      u.grammarPoints = Array.isArray(u.grammarPoints) ? u.grammarPoints : []
      u.scenarios = Array.isArray(u.scenarios) ? u.scenarios : []
      u.sections = Array.isArray(u.sections) ? u.sections : []
    })

    asyncOp.addLog(`全部完成！共 ${units.length} 个关卡`, 'success')
    asyncOp.setMessage('保存框架数据...')

    setFramework(pairId, level, units)
    return units
  }

  function updateUnit(lang, level, unitId, updates) {
    const units = framework.value[lang]?.[level]?.units || []
    const idx = units.findIndex(u => u.id === unitId)
    if (idx >= 0) {
      units[idx] = { ...units[idx], ...updates }
      framework.value[lang][level] = { units }
      saveToServer()
    }
  }

  return {
    framework,
    getFramework,
    setFramework,
    updateUnit,
    generateFrameworkWithAI,
    saveFramework: saveToServer
  }
}

// ---- 全局初始化（main.js 调用一次） ----
export async function init() {
  try {
    const res = await fetch('/api/data/unit-framework')
    if (res.ok) {
      const data = await res.json()
      if (data && typeof data === 'object' && !Array.isArray(data)) {
        if (Object.keys(data).length > 0) {
          framework.value = data
        }
      }
    }
  } catch { /* 首次启动 */ }
}

export async function migrateKeys(languagePairs) {
  const map = buildLangToPairIdMap(languagePairs)
  const old = framework.value
  const migrated = {}
  let changed = false
  for (const [key, val] of Object.entries(old)) {
    if (map[key]) {
      migrated[map[key]] = val
      if (map[key] !== key) changed = true
    } else {
      migrated[key] = val
    }
  }
  if (changed) {
    framework.value = migrated
    saveToServer()
  }
}

function buildLangToPairIdMap(languagePairs) {
  const map = {}
  for (const pair of languagePairs) {
    if (pair.to) {
      map[pair.to] = pair.id
    }
  }
  return map
}

// ---- Prompt 构建 ----

function buildStep1Prompt(fromLang, toLang, level, vocabList) {
  const vocabText = vocabList.length > 0 ? vocabList.join(', ') : '（未指定）'
  return `你是一位专业的语言课程设计师，负责设计从 ${fromLang} 学习 ${toLang} 的 CEFR ${level} 级别课程。

【重要约束 - 语言绝对要求】
- 目标语言是 ${toLang}，所有 titleTarget、goalTarget、grammarPoints、scenarios 中涉及目标语言的内容，必须全部使用 ${toLang}，严禁使用其他语言（如西班牙语、法语等）。
- titleNative、goalNative 使用 ${fromLang}。
- grammarPoints 数组中的语法点说明用 ${fromLang}，但语法术语和例词必须用 ${toLang}。
- scenarios 数组中的场景描述用 ${fromLang}。

词汇库（全部为 ${toLang} 单词）：${vocabText}

请设计 5-8 个关卡（units），确保词汇库中的所有单词都能被覆盖。

每个关卡必须包含以下字段（使用 JSON 格式返回）：
- id: 编号，如 "U01", "U02"
- titleNative: ${fromLang} 标题（简洁概括本关卡主题）
- titleTarget: ${toLang} 标题（准确对应 ${toLang} 的学习内容，必须使用 ${toLang} 书写）
- goalNative: ${fromLang} 学习目标描述
- goalTarget: ${toLang} 学习目标描述（必须使用 ${toLang} 书写）
- vocabCount: 本关卡预计涵盖的词汇数量（数字）
- grammarPoints: 本关卡涉及的语法点列表（字符串数组，语法术语用 ${toLang}，说明用 ${fromLang}）
- scenarios: 本关卡涵盖的真实场景列表（字符串数组，用 ${fromLang} 描述）

设计原则：
1. 从简单到复杂，循序渐进
2. 每个关卡有明确的主题和场景
3. 覆盖各种日常话题（问候、购物、旅行、工作等）
4. 词汇分布均匀，不与后续关卡重叠
5. ${fromLang}标题准确传达关卡主题，${toLang}标题是实际学习者会看到的

输出要求：一个合法的 JSON 数组，包含所有关卡对象。只输出 JSON，不要 markdown。`
}

function buildStep2Prompt(fromLang, toLang, level, unit, unitIndex, allVocab, remainingVocab) {
  const remainingText = remainingVocab.length > 0 ? remainingVocab.join(', ') : '（全部覆盖）'
  const allVocabText = allVocab.length > 0 ? allVocab.join(', ') : '（未指定）'
  const grammarText = unit.grammarPoints?.join(', ') || '（未指定）'
  const scenarioText = unit.scenarios?.join(', ') || '（未指定）'

  return `你是一位专业的语言课程设计师。请为 ${toLang} ${level} 级别的课程设计"${unit.titleNative}（${unit.titleTarget}）"这一关卡的详细小节。

【重要约束 - 语言绝对要求】
- 目标语言是 ${toLang}，所有 titleTarget 中的内容必须全部使用 ${toLang}，严禁使用其他语言。
- grammarPoint 中的语法术语用 ${toLang}，说明用 ${fromLang}。
- coveredWords 必须从 ${toLang} 词汇库中选择，不得混入其他语言的单词。
- scenario 用 ${fromLang} 描述。

关卡信息：
- ${fromLang}标题：${unit.titleNative}
- ${toLang}标题：${unit.titleTarget}
- 学习目标（${fromLang}）：${unit.goalNative}
- 学习目标（${toLang}）：${unit.goalTarget}
- 预计词汇量：${unit.vocabCount}
- 语法点：${grammarText}
- 场景：${scenarioText}

全局词汇库（全部为 ${toLang} 单词）：${allVocabText}

尚未被其他关卡覆盖的剩余词汇：${remainingText}

请设计 3-5 个小节（sections）。每个小节必须包含：
- id: 编号，如 "S01", "S02"
- titleNative: ${fromLang} 小节标题
- titleTarget: ${toLang} 小节标题（必须使用 ${toLang} 书写）
- coveredWords: 本小节覆盖的词汇列表（字符串数组，请从全局词汇库中选择，仅限 ${toLang} 单词）
- grammarPoint: 本小节聚焦的语法点（字符串，语法术语用 ${toLang}）
- scenario: 本小节对应的场景（${fromLang} 描述）

设计原则：
1. 每个小节应有明确的教学主题和场景
2. 优先使用"剩余词汇"中的单词，确保全局词汇库被全面覆盖
3. 已在前置关卡覆盖过的单词可重复出现用于复习
4. 小节之间应有逻辑递进关系

输出要求：一个合法的 JSON 数组，包含所有小节对象。只输出 JSON，不要 markdown。`
}

export default useUnitFramework
