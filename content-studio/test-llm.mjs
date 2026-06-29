/**
 * LLM API 调试工具
 * 直接调用 API（绕过 Vite 代理），打印原始返回，测试 JSON 解析
 * 用法: node test-llm.mjs
 */

import { readFileSync, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const CONFIG_FILE = resolve(__dirname, 'studio.config.json')

// 读取配置
function readConfig() {
  const defaults = { baseUrl: '', apiKey: '', model: 'gpt-4o-mini' }
  if (existsSync(CONFIG_FILE)) {
    return { ...defaults, ...JSON.parse(readFileSync(CONFIG_FILE, 'utf-8')) }
  }
  return defaults
}

// ========== 测试 1: 非流式调用，看原始 JSON 响应 ==========
async function testNonStreaming() {
  console.log('\n' + '='.repeat(70))
  console.log('【测试1】非流式调用 — 查看原始 API 响应结构')
  console.log('='.repeat(70))

  const config = readConfig()
  const url = config.baseUrl.replace(/\/+$/, '') + '/chat/completions'

  const body = {
    model: config.model,
    messages: [
      { role: 'system', content: '你是一个 JSON 数据生成器。只输出 JSON，不输出任何其他内容。' },
      { role: 'user', content: '生成 1 道西班牙语 A1 图片识词题。返回一个 JSON 数组，每个元素包含: type, typeName, language, cefr, unit, unitTheme, difficulty, tags, imageDesc, options(4项), answerIdx。直接输出 JSON，不要 markdown 代码块。' }
    ],
    temperature: 0.1
  }

  console.log('\n请求 URL:', url)
  console.log('请求模型:', config.model)
  console.log('请求 body:\n', JSON.stringify(body, null, 2))

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.apiKey}`
      },
      body: JSON.stringify(body)
    })

    console.log('\n响应状态:', response.status, response.statusText)
    console.log('响应 Headers:', JSON.stringify([...response.headers.entries()], null, 2))

    const rawText = await response.text()
    console.log('\n原始响应文本（前 2000 字符）:')
    console.log(rawText.substring(0, 2000))

    // 尝试解析为 JSON
    try {
      const json = JSON.parse(rawText)
      console.log('\n✅ 响应整体是合法 JSON')

      const message = json.choices?.[0]?.message
      if (message) {
        console.log('\nchoices[0].message:')
        console.log('  role:', message.role)
        console.log('  content (前500字符):', (message.content || '').substring(0, 500))
        if (message.reasoning_content) {
          console.log('  reasoning_content (前500字符):', message.reasoning_content.substring(0, 500))
        }

        // 尝试解析 content 中的 JSON
        const content = (message.content || '').trim()
        if (content) {
          try {
            const parsed = JSON.parse(content)
            console.log('\n✅ content 中的 JSON 解析成功!')
            console.log('  类型:', Array.isArray(parsed) ? '数组' : '对象')
            console.log('  长度:', Array.isArray(parsed) ? parsed.length : 1)
            console.log('  内容:', JSON.stringify(parsed, null, 2).substring(0, 1000))
          } catch {
            console.log('\n❌ content 中的文本不是合法 JSON')

            // 尝试用 parseJSONFromResponse 的逻辑解析
            console.log('\n尝试应急解析...')
            // 查找 JSON 数组
            const arrStart = content.indexOf('[')
            const arrEnd = content.lastIndexOf(']')
            if (arrStart !== -1 && arrEnd > arrStart) {
              try {
                const extracted = JSON.parse(content.substring(arrStart, arrEnd + 1))
                console.log('✅ 通过 [] 提取成功!')
                console.log('  内容:', JSON.stringify(extracted, null, 2).substring(0, 1000))
              } catch {
                console.log('❌ [] 提取也失败')
              }
            }
          }
        } else {
          console.log('\n⚠️ content 为空!')
        }
      } else {
        console.log('\n⚠️ 响应中没有 choices[0].message')
        console.log('完整响应:', JSON.stringify(json, null, 2).substring(0, 2000))
      }
    } catch {
      console.log('\n❌ 响应整体不是合法 JSON')
      console.log('原始内容 (前1000字符):', rawText.substring(0, 1000))
    }
  } catch (e) {
    console.error('\n❌ 请求失败:', e.message)
  }
}

// ========== 测试 2: 模拟项目中完整的 prompt 生成 ==========
async function testRealPrompt() {
  console.log('\n' + '='.repeat(70))
  console.log('【测试2】使用项目中真实的 buildPrompt 生成的提示词调用')
  console.log('='.repeat(70))

  // 模拟 buildPrompt 的逻辑（避免 import ESM 问题）
  const QUESTION_TYPES = {
    T01: {
      id: 'T01', name: '图片识词',
      interaction: '看图片 → 四选一',
      skill: '阅读 · 词汇',
      cognitive: '识别',
      tier: 1,
      extendedFields: ['imageDesc', 'options', 'answerIdx'],
      promptHint: '图片用 emoji 或简短文字描述；干扰项须为同类词；正确答案不能靠排除法得出'
    }
  }

  const language = 'es'
  const cefr = 'A1'
  const unit = 'U1'
  const unitTheme = 'Saludos y cortesía'
  const qt = QUESTION_TYPES.T01
  const difficulty = 1
  const count = 3
  const vocabulary = ['hola', 'adiós', 'gracias', 'buenos días', 'buenas noches']
  const grammar = ['基本问候句型', '正式/非正式用语区别']

  const vocabList = vocabulary.join(', ')
  const grammarList = grammar.join(', ')
  const arrayFields = ['options', 'imageOptions', 'words', 'pairs', 'tags', 'acceptedAnswers', 'commonMistakes', 'scoringDimensions']

  const prompt = `你是一位专业的${language === 'es' ? '西班牙语' : language}教材编写者，擅长为 CEFR ${cefr} 学习者设计练习题。

请生成 ${qt.id}（${qt.name}）类型的题目。
交互形式：${qt.interaction}
训练技能：${qt.skill}
认知层次：${qt.cognitive}

特有约束：${qt.promptHint}

主题为"${unitTheme}"。
词汇范围：${vocabList}
语法范围：${grammarList}
难度：${difficulty}（1-5）

请生成 ${count} 道题目。每道题目必须是一个 JSON 对象，格式如下：
{
  "id": "${language.toLowerCase()}-${cefr.toLowerCase()}-${unit.toLowerCase()}-${qt.id.toLowerCase()}-001",
  "type": "${qt.id}",
  "typeName": "${qt.name}",
  "language": "${language}",
  "cefr": "${cefr}",
  "unit": "${unit}",
  "unitTheme": "${unitTheme}",
  "difficulty": ${difficulty},
  "tags": ["主题标签1", "语法点标签2"],
${qt.extendedFields.map(f => {
    if (f === 'answerIdx') return `  "${f}": 0`
    if (arrayFields.includes(f)) return `  "${f}": [/* 填写具体内容 */]`
    return `  "${f}": "/* 填写具体内容 */"`
  }).join(',\n')}
}

输出要求：一个 JSON 数组，包含 ${count} 个题目对象，序号从 001 开始递增。
禁止输出 JSON 以外的任何内容。不要输出 markdown 代码块标记（如 \`\`\`json）。
不要输出任何思考过程、解释或前言后语。
tags 字段必须填写与本题相关的具体主题词和语法点，不要使用占位符。
生成的 JSON 必须可被 JSON.parse() 正确解析。

现在直接输出 JSON 数组：`

  const config = readConfig()
  const url = config.baseUrl.replace(/\/+$/, '') + '/chat/completions'

  const body = {
    model: config.model,
    messages: [
      { role: 'system', content: '你是一个严格的 JSON 数据生成器。你的全部输出必须是一个合法的 JSON 数组。不允许输出任何非 JSON 内容，包括：解释、分析、思考过程、markdown 代码块标记（如 ```json）、问候语、总结。数组中的每个元素都必须符合给定的 JSON Schema。你必须只输出 JSON，且 JSON 必须可被 JSON.parse() 正确解析。' },
      { role: 'user', content: prompt }
    ],
    temperature: 0.1
  }

  console.log('请求模型:', config.model)
  console.log('\n完整 Prompt (前500字符):\n' + prompt.substring(0, 500))
  console.log('\n... (prompt 共 ' + prompt.length + ' 字符)')
  console.log('\nPrompt 中 JSON 示例部分:')
  const exampleStart = prompt.indexOf('{')
  const exampleEnd = prompt.lastIndexOf('}') + 1
  console.log(prompt.substring(exampleStart, exampleEnd))

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.apiKey}`
      },
      body: JSON.stringify(body)
    })

    const rawText = await response.text()
    console.log('\n响应状态:', response.status)
    console.log('\n完整原始响应文本:')
    console.log(rawText)

    // 解析并提取 content
    try {
      const json = JSON.parse(rawText)
      const content = (json.choices?.[0]?.message?.content || '').trim()
      console.log('\n' + '='.repeat(50))
      console.log('提取的 content:')
      console.log(content)

      if (content) {
        // 检查 content 是否以 markdown 代码块开头
        if (content.startsWith('```')) {
          console.log('\n⚠️ content 以 markdown 代码块开头!')
        }

        try {
          const parsed = JSON.parse(content)
          console.log('\n✅ JSON 解析成功!')
          console.log(JSON.stringify(parsed, null, 2))
        } catch (e) {
          console.log('\n❌ JSON 解析失败:', e.message)
          console.log('\ncontent 原始内容 (前300字符):')
          console.log(content.substring(0, 300))

          // 尝试清除 markdown 代码块
          const cleaned = content.replace(/```(?:json)?\s*\n?([\s\S]*?)\n?```/g, '$1').trim()
          console.log('\n清除代码块后:')
          console.log(cleaned.substring(0, 300))
          try {
            const p = JSON.parse(cleaned)
            console.log('\n✅ 清除代码块后解析成功!')
          } catch {
            console.log('\n❌ 清除代码块后仍然解析失败')

            // 尝试 [] 提取
            const as = cleaned.indexOf('[')
            const ae = cleaned.lastIndexOf(']')
            if (as !== -1 && ae > as) {
              try {
                const p2 = JSON.parse(cleaned.substring(as, ae + 1))
                console.log('✅ 通过 [] 提取后解析成功!')
                console.log(JSON.stringify(p2, null, 2))
              } catch {
                console.log('❌ [] 提取后仍然失败')
              }
            }
          }
        }
      }
    } catch {
      console.log('响应不是合法 JSON')

      // 可能是流式响应，尝试 SSE 解析
      const lines = rawText.split('\n')
      let content = ''
      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed.startsWith('data: ')) continue
        const data = trimmed.slice(6)
        if (data === '[DONE]') continue
        try {
          const parsed = JSON.parse(data)
          const delta = parsed.choices?.[0]?.delta
          if (delta?.content) content += delta.content
        } catch { /* skip */ }
      }
      if (content) {
        console.log('\n从 SSE 流中提取的内容:')
        console.log(content)
      }
    }
  } catch (e) {
    console.error('\n❌ 请求失败:', e.message)
  }
}

// ========== 运行 ==========
async function main() {
  console.log('LLM API 调试工具')
  console.log('时间:', new Date().toISOString())

  const config = readConfig()
  console.log('配置:', JSON.stringify({ ...config, apiKey: config.apiKey ? '***' : '' }, null, 2))

  if (!config.baseUrl || !config.apiKey) {
    console.error('请先在 studio.config.json 中配置 baseUrl 和 apiKey')
    process.exit(1)
  }

  await testNonStreaming()
  await testRealPrompt()
}

main().catch(console.error)
