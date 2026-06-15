/**
 * es-a1-u1 端到端生产测试
 * 模拟生产流程: buildPrompt → callLLM → parseJSON → validate
 *
 * 用法: node e2e-test.mjs
 * (需要先启动: npm run dev)
 */

import { readFileSync, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const BASE = 'http://localhost:5180'

// ==================== 内联依赖 ====================
// (避免 ESM 导入问题)

const QUESTION_TYPES = {
  T01: { id: 'T01', name: '图片识词', interaction: '看图片 → 四选一', skill: '阅读 · 词汇', cognitive: '识别', tier: 1,
    extendedFields: ['imageDesc', 'options', 'answerIdx'],
    promptHint: '图片用 emoji 或简短文字描述；干扰项须为同类词；正确答案不能靠排除法得出' },
  T02: { id: 'T02', name: '听音选图', interaction: '听发音 → 选对应图', skill: '听力 · 词汇', cognitive: '识别', tier: 1,
    extendedFields: ['audioText', 'imageOptions', 'answerIdx'],
    promptHint: '需标注发音文本（TTS 播放内容）；图片描述须简洁直观；选项间不可有包含关系' },
  T03: { id: 'T03', name: '双向配对', interaction: '拖拽配对 4 组', skill: '阅读 · 记忆', cognitive: '识别', tier: 1,
    extendedFields: ['pairs'],
    promptHint: '固定 4 组配对；左右两列各自不重复；配对项须在同一语义域' },
}

const QUESTION_SCHEMAS = {
  common: { required: ['id', 'type', 'typeName', 'language', 'cefr', 'unit', 'unitTheme', 'difficulty', 'tags'],
    types: { id: 'string', type: 'string', typeName: 'string', language: 'string', cefr: 'string', unit: 'string', unitTheme: 'string', difficulty: 'number', tags: 'array' } },
  T01: { required: ['imageDesc', 'options', 'answerIdx'], types: { imageDesc: 'string', options: 'array', answerIdx: 'number' } },
  T02: { required: ['audioText', 'imageOptions', 'answerIdx'], types: { audioText: 'string', imageOptions: 'array', answerIdx: 'number' } },
  T03: { required: ['pairs'], types: { pairs: 'array' } },
}

// ==================== buildPrompt ====================

function buildPrompt({ questionType, language, cefr, unit, unitTheme, vocabulary, grammar, difficulty, count }) {
  const qt = QUESTION_TYPES[questionType]
  if (!qt) throw new Error(`Unknown question type: ${questionType}`)

  const vocabList = vocabulary ? vocabulary.join(', ') : '（未指定）'
  const grammarList = grammar ? grammar.join(', ') : '（未指定）'

  const EXAMPLE_VALUES = {
    imageDesc: '"描述图片的文字"',
    options: '["选项1", "选项2", "选项3", "选项4"]',
    answerIdx: '0',
    audioText: '"发音文本"',
    imageOptions: '["图片1描述", "图片2描述", "图片3描述", "图片4描述"]',
    pairs: '[{"left":"词语A","right":"含义1"},{"left":"词语B","right":"含义2"},{"left":"词语C","right":"含义3"},{"left":"词语D","right":"含义4"}]',
  }

  return `你是一位专业的${language === 'es' ? '西班牙语' : language}教材编写者，擅长为 CEFR ${cefr} 学习者设计练习题。

请生成 ${qt.id}（${qt.name}）类型的题目。
交互形式：${qt.interaction}
训练技能：${qt.skill}
认知层次：${qt.cognitive}

特有约束：${qt.promptHint}

主题为"${unitTheme}"。
词汇范围：${vocabList}
语法范围：${grammarList}
难度：${difficulty}（1-5）

请生成 ${count} 道题目。每道题目必须是一个合法的 JSON 对象，参考以下格式（内容替换为本任务的主题和词汇）：
{
  "id": "${language.toLowerCase()}-${cefr.toLowerCase()}-${unit.toLowerCase()}-${qt.id.toLowerCase()}-001",
  "type": "${qt.id}",
  "typeName": "${qt.name}",
  "language": "${language}",
  "cefr": "${cefr}",
  "unit": "${unit}",
  "unitTheme": "${unitTheme}",
  "difficulty": ${difficulty},
  "tags": ["主题标签1", "语法标签2"],
${qt.extendedFields.map(f => `  "${f}": ${EXAMPLE_VALUES[f] || '"示例"'}`).join(',\n')}
}

输出要求：一个 JSON 数组，包含 ${count} 个题目对象，序号从 001 开始递增。
数组中每个元素的字段结构必须与上述格式完全相同，仅替换内容值。
禁止：输出任何非 JSON 内容、markdown 代码块标记、思考过程、解释。
生成的 JSON 必须可被 JSON.parse() 正确解析。

现在直接输出 JSON 数组：`
}

// ==================== parseJSONFromResponse ====================

function parseJSONFromResponse(text) {
  let jsonStr = text.trim()
  const codeBlockMatch = jsonStr.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/)
  if (codeBlockMatch) jsonStr = codeBlockMatch[1].trim()
  try { return JSON.parse(jsonStr) } catch { /* 继续 */ }
  const arrayStart = jsonStr.indexOf('[')
  if (arrayStart !== -1) {
    const arrayEnd = jsonStr.lastIndexOf(']')
    if (arrayEnd > arrayStart) {
      try { return JSON.parse(jsonStr.substring(arrayStart, arrayEnd + 1)) } catch { /* 继续 */ }
    }
  }
  const objStart = jsonStr.indexOf('{')
  if (objStart !== -1) {
    const objEnd = jsonStr.lastIndexOf('}')
    if (objEnd > objStart) {
      try { return JSON.parse(jsonStr.substring(objStart, objEnd + 1)) } catch { /* 继续 */ }
    }
  }
  throw new Error(`JSON 解析失败`)
}

// ==================== useValidator (内联) ====================

function checkType(value, expected) {
  if (expected === 'array') return Array.isArray(value)
  return typeof value === expected
}

function validateQuestion(question) {
  const errors = []
  const warnings = []

  const common = QUESTION_SCHEMAS.common
  for (const field of common.required) {
    if (question[field] === undefined || question[field] === null || question[field] === '') {
      errors.push(`缺少必填字段: ${field}`)
    }
  }
  for (const [field, type] of Object.entries(common.types)) {
    if (question[field] !== undefined && !checkType(question[field], type)) {
      errors.push(`字段 ${field} 类型应为 ${type}，实际为 ${typeof question[field]}`)
    }
  }

  const typeSchema = QUESTION_SCHEMAS[question.type]
  if (typeSchema) {
    for (const field of typeSchema.required) {
      if (question[field] === undefined || question[field] === null) {
        errors.push(`缺少题型必填字段: ${field}`)
      }
    }
    for (const [field, type] of Object.entries(typeSchema.types)) {
      if (question[field] !== undefined && !checkType(question[field], type)) {
        errors.push(`字段 ${field} 类型应为 ${type}，实际为 ${typeof question[field]}`)
      }
    }
  }

  if (errors.length === 0) {
    validateAnswer(question, errors, warnings)
  }

  if (question.difficulty !== undefined) {
    if (question.difficulty < 1 || question.difficulty > 5) {
      warnings.push(`difficulty 应在 1-5 之间，当前为 ${question.difficulty}`)
    }
  }

  return { valid: errors.length === 0, errors, warnings }
}

function validateAnswer(q, errors, warnings) {
  switch (q.type) {
    case 'T01':
    case 'T02':
    case 'T07':
    case 'T08':
    case 'T12': {
      const opts = q.options || q.imageOptions
      if (opts) {
        if (q.answerIdx < 0 || q.answerIdx >= opts.length) {
          errors.push(`answerIdx (${q.answerIdx}) 超出选项范围 [0, ${opts.length - 1}]`)
        }
        const unique = new Set(opts.map(o => typeof o === 'string' ? o.toLowerCase() : JSON.stringify(o)))
        if (unique.size !== opts.length) {
          errors.push('存在重复选项')
        }
        if (opts.length < 3) warnings.push('选项少于 3 个')
      }
      break
    }
    case 'T03': {
      if (q.pairs) {
        if (q.pairs.length !== 4) warnings.push(`配对应有 4 组，当前 ${q.pairs.length} 组`)
        const lefts = new Set(q.pairs.map(p => p.left?.toLowerCase()))
        const rights = new Set(q.pairs.map(p => p.right?.toLowerCase()))
        if (lefts.size !== q.pairs.length) errors.push('左侧存在重复项')
        if (rights.size !== q.pairs.length) errors.push('右侧存在重复项')
      }
      break
    }
  }
}

// ==================== A1-U1 单元数据 ====================

const UNIT_DATA = {
  id: 'A1-U1',
  unit: 'U1',
  cefr: 'A1',
  title: 'Saludos y cortesía',
  titleCN: '问候与礼貌',
  questionCount: 19,
  types: ['T01', 'T02', 'T03'],
  vocabulary: [
    'hola', 'adiós', 'buenos días', 'buenas tardes', 'buenas noches',
    'gracias', 'por favor', 'perdón', 'lo siento', 'de nada',
    'hasta luego', 'hasta mañana', 'bien', 'mal', 'así así',
    '¿Cómo estás?', 'Estoy bien', 'Muy bien', '¿Y tú?',
    'disculpe', 'chao', 'nos vemos'
  ],
  grammar: ['基本问候句型', '正式/非正式用语区别']
}

// ==================== 模拟生产流程 ====================

async function produceType(type, count = 3) {
  const overGenerate = 3
  const difficulty = 1
  const MAX_BATCH = 5  // Match production batch size
  const generateCount = Math.min(count * overGenerate, 6) // Limit to 6 for e2e test speed

  console.log(`\n  Prompt 长度: 约 950 字符 (目标 ${count} 题, 生成 ${generateCount} 题/批)`)

  // 读取配置获取模型名
  let model = 'gpt-4o-mini'
  try {
    const cfgResp = await fetch(`${BASE}/api/config`)
    if (cfgResp.ok) {
      const cfg = await cfgResp.json()
      model = cfg.model || model
    }
  } catch { /* use default */ }

  // 分批生成
  const batchCount = Math.ceil(generateCount / MAX_BATCH)
  let allQuestions = []
  let allResults = []

  for (let batch = 0; batch < batchCount; batch++) {
    const thisBatchCount = Math.min(MAX_BATCH, generateCount - batch * MAX_BATCH)
    if (batchCount > 1) {
      console.log(`  📦 批次 ${batch + 1}/${batchCount} (${thisBatchCount} 题)...`)
    }

    const prompt = buildPrompt({
      questionType: type,
      language: 'es',
      cefr: 'A1',
      unit: 'U1',
      unitTheme: 'Saludos y cortesía',
      vocabulary: UNIT_DATA.vocabulary,
      grammar: UNIT_DATA.grammar,
      difficulty,
      count: thisBatchCount
    })

    // 通过代理调用 LLM API
    const body = {
      model,
      messages: [
        { role: 'system', content: '你是一个严格的 JSON 数据生成器。你的全部输出必须是一个合法的 JSON 数组。不允许输出任何非 JSON 内容，包括：解释、分析、思考过程、markdown 代码块标记（如 ```json）、问候语、总结。数组中的每个元素都必须符合给定的 JSON Schema。你必须只输出 JSON，且 JSON 必须可被 JSON.parse() 正确解析。' },
        { role: 'user', content: prompt }
      ],
      temperature: 0.1,
      max_tokens: 16384
    }

    const response = await fetch(`${BASE}/api/llm`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(180000)
    })

    if (!response.ok) {
      const errText = await response.text()
      return { success: false, error: `API ${response.status}: ${errText.substring(0, 200)}`, questions: [] }
    }

    const data = await response.json()
    const msg = data.choices?.[0]?.message || {}
    let rawContent = (msg.content || '').trim()
    const reasoningContent = msg.reasoning_content || ''

    console.log(`  API 响应: content=${rawContent.length} 字符, reasoning=${reasoningContent.length} 字符`)

    // 使用与生产代码 extractText 相同的策略: 优先 content，降级到 reasoning
    let textToParse
    if (rawContent) {
      textToParse = rawContent
    } else if (reasoningContent && reasoningContent.trim()) {
      textToParse = reasoningContent.trim()
      console.log('  ⚠️ content 为空，使用 reasoning_content 降级')
    } else {
      return { success: false, error: 'API 响应为空', questions: [] }
    }

    // 解析 JSON — 带详细定位
    let batchQuestions
    try {
      batchQuestions = parseJSONFromResponse(textToParse)
    } catch (e) {
      let detailError = e.message
      try {
        JSON.parse(textToParse)
      } catch (nativeErr) {
        detailError += ` | 原生错误: ${nativeErr.message}`
        const posMatch = nativeErr.message.match(/position\s+(\d+)/i)
        if (posMatch) {
          const pos = parseInt(posMatch[1])
          const start = Math.max(0, pos - 60)
          const end = Math.min(textToParse.length, pos + 60)
          detailError += `\n  错误位置附近: ...${JSON.stringify(textToParse.substring(start, end))}...`
        }
      }
      return {
        success: false,
        error: detailError,
        rawContent: textToParse.substring(0, 500),
        rawContentFull: textToParse,
        questions: []
      }
    }

    if (!Array.isArray(batchQuestions)) {
      batchQuestions = [batchQuestions]
    }

    allQuestions.push(...batchQuestions)

    // 校验
    const batchResults = batchQuestions.map((q, i) => {
      const v = validateQuestion(q)
      return { index: allQuestions.length - batchQuestions.length + i, id: q.id || '(无id)', ...v }
    })
    allResults.push(...batchResults)

    // Rate limit delay between batches
    if (batch < batchCount - 1) {
      await new Promise(r => setTimeout(r, 2000))
    }
  }

  const valid = allResults.filter(r => r.valid).length
  const invalid = allResults.filter(r => !r.valid).length

  console.log(`  解析结果: ${allQuestions.length} 道题目`)
  console.log(`  校验结果: ${valid} 通过, ${invalid} 失败`)

  if (invalid > 0) {
    for (const r of allResults) {
      if (!r.valid) {
        console.log(`  ❌ 题目 #${r.index} (${r.id}) 校验失败:`)
        for (const e of r.errors) {
          console.log(`      - ${e}`)
        }
        if (r.warnings.length) {
          for (const w of r.warnings) {
            console.log(`      ⚠ ${w}`)
          }
        }
      }
    }
  }

  // Print first valid question
  const firstValid = allQuestions.find((q, i) => allResults[i]?.valid)
  if (firstValid) {
    console.log(`  ✅ 第一题示例: ${JSON.stringify(firstValid, null, 2).substring(0, 300)}`)
  }

  return { success: invalid === 0, error: invalid > 0 ? `${invalid} 题校验失败` : '', questions: allQuestions.slice(0, count), results: allResults, rawContent: null }
}

// ==================== 运行 ====================

async function main() {
  console.log('='.repeat(70))
  console.log('es-a1-u1 端到端生产测试')
  console.log('='.repeat(70))
  console.log(`单元: ${UNIT_DATA.title} (${UNIT_DATA.titleCN})`)
  console.log(`题型: ${UNIT_DATA.types.join(', ')}`)
  console.log(`词汇: ${UNIT_DATA.vocabulary.length} 个`)
  console.log(`语法: ${UNIT_DATA.grammar.join(', ')}`)

  let totalPassed = 0
  let totalFailed = 0

  for (const type of UNIT_DATA.types) {
    console.log('\n' + '-'.repeat(50))
    console.log(`生成 ${type} (${QUESTION_TYPES[type].name})...`)
    console.log('-'.repeat(50))

    const result = await produceType(type, 3)

    if (result.success) {
      console.log(`  🟢 ${type} 全部通过 (${result.questions.length} 题)`)
      totalPassed++
    } else {
      console.log(`  🔴 ${type} 失败: ${result.error}`)
      totalFailed++
      if (result.rawContent) {
        console.log('\n  原始返回内容 (前 500 字符):')
        console.log(`  ${result.rawContent}`)
      }
    }
  }

  console.log('\n' + '='.repeat(70))
  console.log(`结果: ${totalPassed} 通过, ${totalFailed} 失败`)
  console.log('='.repeat(70))

  if (totalFailed > 0) process.exit(1)
}

main().catch(e => {
  console.error('测试崩溃:', e.message)
  process.exit(1)
})
