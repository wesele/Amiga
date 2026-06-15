/**
 * 集成测试
 * 1. 验证所有题型 Prompt 中的 JSON 模板是合法 JSON
 * 2. 验证 parseJSONFromResponse 能处理各种边界情况
 * 3. 验证 Vite 服务 + API 端点可用
 * 4. 端到端调用 LLM API（如果可达）
 *
 * 用法: node integration-test.mjs
 */

import { readFileSync, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))

let passed = 0
let failed = 0

function assert(condition, msg) {
  if (condition) {
    console.log(`  ✅ ${msg}`)
    passed++
  } else {
    console.log(`  ❌ ${msg}`)
    failed++
  }
}

// ============================================================
// 第一部分: 测试 buildPrompt — 所有题型的 JSON 模板都是合法 JSON
// ============================================================
console.log('\n' + '='.repeat(60))
console.log('第一部分: Prompt JSON 模板合法性检查')
console.log('='.repeat(60))

import('./src/data/question-types.js').then(async ({ buildPrompt, QUESTION_TYPES }) => {
  const types = Object.keys(QUESTION_TYPES)
  console.log(`共 ${types.length} 种题型: ${types.join(', ')}`)

  for (const type of types) {
    const prompt = buildPrompt({
      questionType: type,
      language: 'es',
      cefr: 'A1',
      unit: 'U1',
      unitTheme: 'Saludos y cortesía',
      vocabulary: ['hola', 'adiós', 'gracias'],
      grammar: ['问候'],
      difficulty: 1,
      count: 3
    })

    // 从 prompt 中提取 JSON 模板（"参考以下格式：" 后面的 JSON 对象）
    const jsonMatch = prompt.match(/\{[\s\S]*?\n\}/)
    if (!jsonMatch) {
      console.log(`  ❌ ${type}: 未找到 JSON 模板`)
      failed++
      continue
    }

    const jsonTemplate = jsonMatch[0]

    // 检查是否包含非法 JSON 语法
    const hasInvalid = jsonTemplate.includes('/*') || jsonTemplate.includes('...')
    if (hasInvalid) {
      console.log(`  ❌ ${type}: JSON 模板包含非法语法 (/* 或 ...)`)
      console.log(`     模板内容:\n${jsonTemplate}`)
      failed++
      continue
    }

    // 用 JSON.parse 验证
    try {
      JSON.parse(jsonTemplate)
      console.log(`  ✅ ${type}: JSON 模板合法`)
      passed++
    } catch (e) {
      console.log(`  ❌ ${type}: JSON 模板不合法 - ${e.message}`)
      console.log(`     模板内容:\n${jsonTemplate}`)
      failed++

      // 尝试逐行检查问题
      const lines = jsonTemplate.split('\n')
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i]
        const trimmed = line.trim()
        if (trimmed && !trimmed.endsWith(',') && !trimmed.endsWith('{') && !trimmed.endsWith('}') && !trimmed.endsWith('[') && !trimmed.endsWith(']')) {
          // 检查是否是数组/对象内的最后一项
          const nextLine = i < lines.length - 1 ? lines[i + 1].trim() : ''
          if (nextLine !== '}' && nextLine !== ']' && !nextLine.startsWith('}') && !nextLine.startsWith(']')) {
            console.log(`     行 ${i + 1}: 缺少逗号? "${trimmed}"`)
          }
        }
      }
    }
  }

  // ============================================================
  // 第二部分: 测试 parseJSONFromResponse
  // ============================================================
  console.log('\n' + '='.repeat(60))
  console.log('第二部分: JSON 解析器边界测试')
  console.log('='.repeat(60))

  // 内联 parseJSONFromResponse 的逻辑（避免依赖 useStorage）
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

  const testCases = [
    // [输入, 期望类型, 描述]
    ['[{"id":"test"}]', 'array', '纯 JSON 数组'],
    ['{"id":"test"}', 'object', '纯 JSON 对象'],
    ['```json\n[{"id":"test"}]\n```', 'array', 'markdown 代码块'],
    ['```\n[{"id":"test"}]\n```', 'array', 'markdown 代码块(无语言标记)'],
    ['思考过程...\n[{"id":"test"}]\n以上就是答案', 'array', '带前后文本的 JSON'],
    ['[{"id":"test1"},{"id":"test2"}]', 'array(2)', '多元素数组'],
    ['{"items":[{"id":"test"}]}', 'object', '嵌套 JSON'],
    ['  \n\n  [{"id":"test"}]\n\n  ', 'array', '带空白字符'],
    ['以下是 3 道题目：\n\n```json\n[\n  {"id":"es-a1-u1-t01-001","type":"T01","typeName":"图片识词","language":"es","cefr":"A1","unit":"U1","unitTheme":"Saludos y cortesía","difficulty":1,"tags":["saludos","cortesía"],"imageDesc":"👋","options":["hola","adiós","gracias","por favor"],"answerIdx":0},\n  {"id":"es-a1-u1-t01-002","type":"T01","typeName":"图片识词","language":"es","cefr":"A1","unit":"U1","unitTheme":"Saludos y cortesía","difficulty":1,"tags":["saludos","despedidas"],"imageDesc":"🙋","options":["buenos días","buenas tardes","buenas noches","hasta luego"],"answerIdx":3}\n]\n```', 'array(2)', '真实场景完整输出'],
  ]

  for (const [input, expected, desc] of testCases) {
    try {
      const result = parseJSONFromResponse(input)
      let ok = false
      if (expected === 'array') ok = Array.isArray(result) && result.length === 1
      else if (expected === 'array(2)') ok = Array.isArray(result) && result.length === 2
      else if (expected === 'object') ok = !Array.isArray(result) && typeof result === 'object'
      if (ok) {
        console.log(`  ✅ ${desc}`)
        passed++
      } else {
        console.log(`  ❌ ${desc}: 期望 ${expected}, 实际 ${Array.isArray(result) ? 'array' : typeof result}`)
        failed++
      }
    } catch (e) {
      console.log(`  ❌ ${desc}: 解析失败 - ${e.message}`)
      failed++
    }
  }

  // 测试非法输入
  const badInputs = ['', '不是 JSON', '{"broken": val}', '[1,2,']
  for (const input of badInputs) {
    try {
      parseJSONFromResponse(input)
      console.log(`  ❌ 应抛出异常但未抛出: "${input.substring(0, 20)}"`)
      failed++
    } catch {
      console.log(`  ✅ 正确拒绝非法输入: "${input.substring(0, 20)}"`)
      passed++
    }
  }

  // ============================================================
  // 第三部分: Vite 服务 + API 端点测试
  // ============================================================
  console.log('\n' + '='.repeat(60))
  console.log('第三部分: Vite 服务 + API 端点')
  console.log('='.repeat(60))

  const BASE = 'http://localhost:5180'

  try {
    const configResp = await fetch(`${BASE}/api/config`)
    assert(configResp.ok, `/api/config 返回 ${configResp.status}`)
    const configData = await configResp.json()
    assert(configData.baseUrl && configData.apiKey !== undefined, 'config 包含 baseUrl 和 apiKey')
    console.log(`    baseUrl: ${configData.baseUrl}`)
    console.log(`    model: ${configData.model}`)
  } catch (e) {
    console.log(`  ❌ 无法连接 Vite 服务 (${BASE}) - ${e.message}`)
    console.log('  请先运行: npm run dev')
    failed++
    // 跳过后续测试
    printSummary()
    process.exit(failed > 0 ? 1 : 0)
  }

  // ============================================================
  // 第四部分: LLM API 端到端调用（如果可达）
  // ============================================================
  console.log('\n' + '='.repeat(60))
  console.log('第四部分: LLM API 端到端调用')
  console.log('='.repeat(60))

  // 尝试通过 Vite 代理调用 LLM API
  const configData = await (await fetch(`${BASE}/api/config`)).json()
  const model = configData.model || 'gpt-4o-mini'
  const testBody = {
    model,
    messages: [
      { role: 'system', content: '你是一个 JSON 生成器。只输出 JSON。' },
      { role: 'user', content: '生成 1 道西班牙语 A1 图片识词题。返回 JSON 数组，包含 type, typeName, language, cefr, unit, unitTheme, difficulty, tags, imageDesc, options, answerIdx。直接输出 JSON。' }
    ],
    temperature: 0.1,
    max_tokens: 1000,
    stream: false
  }

  console.log('调用 /api/llm (非流式)...')
  try {
    const start = Date.now()
    const response = await fetch(`${BASE}/api/llm`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(testBody),
      signal: AbortSignal.timeout(30000)
    })
    const elapsed = Date.now() - start

    if (response.ok) {
      console.log(`  ✅ API 响应 ${response.status} (${elapsed}ms)`)
      const data = await response.json()
      const content = data.choices?.[0]?.message?.content || ''
      console.log(`  content 长度: ${content.length} 字符`)

      // 验证 content 是合法 JSON
      try {
        JSON.parse(content)
        console.log('  ✅ content 是合法 JSON')
        passed++
      } catch {
        // 尝试用 parseJSONFromResponse 解析
        try {
          const parsed = parseJSONFromResponse(content)
          console.log('  ✅ 通过应急解析成功提取 JSON')
          console.log(`  类型: ${Array.isArray(parsed) ? 'array' : 'object'}`)
          passed++
        } catch {
          console.log(`  ❌ content 不是合法 JSON，前 200 字符:`)
          console.log(`    ${content.substring(0, 200)}`)
          failed++
        }
      }
    } else {
      const errText = await response.text()
      console.log(`  ⚠️ API 返回 ${response.status}: ${errText.substring(0, 200)}`)
      // 非致命 - API 可能不可达
      console.log('  (跳过，API 可能不可达)')
    }
  } catch (e) {
    console.log(`  ⚠️ API 调用失败: ${e.message}`)
    console.log('  (跳过，API 可能不可达)')
  }

  // ============================================================
  // 第五部分: 通过代理测试流式调用
  // ============================================================
  console.log('\n' + '='.repeat(60))
  console.log('第五部分: SSE 流式代理测试')
  console.log('='.repeat(60))

  const streamBody = { ...testBody, stream: true }
  console.log('调用 /api/llm (流式)...')
  try {
    const start = Date.now()
    const response = await fetch(`${BASE}/api/llm`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(streamBody),
      signal: AbortSignal.timeout(60000)
    })

    if (response.ok && response.body) {
      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      let sseContent = ''
      let sseReasoning = ''
      let eventCount = 0
      let printedEvents = 0
      const MAX_PRINT = 3

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        // 使用与生产代码相同的 buffer 策略
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          const trimmed = line.trim()
          if (!trimmed || trimmed.startsWith(':')) continue
          if (!trimmed.startsWith('data: ')) continue

          const data = trimmed.slice(6)
          if (data === '[DONE]') continue

          try {
            const parsed = JSON.parse(data)
            if (parsed.error) {
              console.log(`  ⚠️ SSE error: ${parsed.error.message || JSON.stringify(parsed.error)}`)
              continue
            }
            const delta = parsed.choices?.[0]?.delta
            if (!delta) continue

            if (delta.content) sseContent += delta.content
            if (delta.reasoning_content) sseReasoning += delta.reasoning_content

            eventCount++
            if (printedEvents < MAX_PRINT && (delta.content || delta.reasoning_content)) {
              const info = { content: delta.content || '', reasoning: (delta.reasoning_content || '').substring(0, 50) }
              console.log(`    前 ${printedEvents + 1} 个事件: ${JSON.stringify(info)}`)
              printedEvents++
            }
          } catch { /* skip non-JSON */ }
        }
      }

      // 处理 buffer 剩余
      if (buffer.trim()) {
        const trimmed = buffer.trim()
        if (trimmed.startsWith('data: ')) {
          const data = trimmed.slice(6)
          if (data !== '[DONE]') {
            try {
              const parsed = JSON.parse(data)
              const delta = parsed.choices?.[0]?.delta
              if (delta?.content) sseContent += delta.content
              if (delta?.reasoning_content) sseReasoning += delta.reasoning_content
              eventCount++
            } catch { /* skip */ }
          }
        }
      }

      const elapsed = Date.now() - start
      console.log(`  ✅ SSE 流接收完成 (${eventCount} data events, ${elapsed}ms)`)
      console.log(`  content 长度: ${sseContent.length}, reasoning 长度: ${sseReasoning.length}`)

      // 使用 extractText 相同的策略: 优先 content，降级到 reasoning
      const finalContent = sseContent.trim() || sseReasoning.trim()
      if (finalContent) {
        try {
          JSON.parse(finalContent)
          console.log('  ✅ SSE 提取文本是合法 JSON')
          passed++
        } catch {
          try {
            const parsed = parseJSONFromResponse(finalContent)
            console.log('  ✅ 通过应急解析成功提取 JSON')
            passed++
          } catch {
            console.log(`  ❌ SSE 提取文本不是合法 JSON，前 300 字符:`)
            console.log(`    ${finalContent.substring(0, 300)}`)
            failed++
          }
        }
      } else {
        console.log('  ⚠️ SSE content 和 reasoning 均为空')
        // 打印最后几行 buffer 帮助调试
        console.log('  最后 buffer (200字符):', buffer.substring(-200))
      }
    } else {
      const errText = response.ok ? '无 response.body' : await response.text()
      console.log(`  ⚠️ 流式响应异常: ${response.status} ${errText.substring(0, 100)}`)
      console.log('  (跳过)')
    }
  } catch (e) {
    console.log(`  ⚠️ 流式调用失败: ${e.message}`)
    console.log('  (跳过，API 可能不可达)')
  }

  // ============================================================
  // 汇总
  // ============================================================
  printSummary()
}).catch(e => {
  console.error('❌ 导入失败:', e.message)
  process.exit(1)
})

function printSummary() {
  console.log('\n' + '='.repeat(60))
  console.log(`测试结果: ${passed} 通过, ${failed} 失败`)
  console.log('='.repeat(60))
  if (failed > 0) process.exit(1)
}
