/**
 * LLM API 调用模块
 * 支持标准 OpenAI 兼容 API 的流式/非流式调用，兼容推理模型思考模式
 * 通过 Vite dev server 代理 (/api/llm) 转发请求，绕过 CORS 限制
 */

import { useStorage } from './useStorage.js'

const SYSTEM_PROMPT_JSON = `你是一个 JSON 数据生成器。你可以在 reasoning 中思考分析题目要求，但最终的 JSON 数组必须放在 content 中输出。
content 中只允许输出 JSON 数组，不允许包含任何解释、分析、思考过程、markdown 代码块标记或其它非 JSON 内容。
每个题目对象都要符合给定的字段格式要求。
JSON 必须完整、合法，可被 JSON.parse() 正确解析。`

export function useLLM() {
  const storage = useStorage()

  // ==================== 内部工具函数 ====================

  function getConfig() {
    const config = storage.getApiConfig()
    if (!config.baseUrl || !config.apiKey) {
      throw new Error('请先在 API 设置页面配置 Base URL 和 API Key')
    }
    return config
  }

  function buildRequestBody(config, prompt, options = {}) {
    const body = {
      model: options.model || config.model || 'gpt-4o-mini',
      messages: [
        { role: 'system', content: options.systemPrompt || SYSTEM_PROMPT_JSON },
        { role: 'user', content: prompt }
      ],
      temperature: options.temperature ?? 0.7
    }
    if (!options.omitMaxTokens) {
      body.max_tokens = options.maxTokens ?? 4096
    }
    if (options.jsonMode) {
      body.response_format = { type: 'json_object' }
    }
    if (options.stream) {
      body.stream = true
    }
    return body
  }

  // ==================== SSE 流式解析 ====================

  /**
   * 解析 SSE 流，逐 chunk 回调
   * @param {ReadableStream} body - fetch response body
   * @param {object} callbacks - { onContent, onReasoning, onDone, onError }
   */
  async function parseSSEStream(body, callbacks) {
    const reader = body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''

    const accumulated = { content: '', reasoning: '' }

    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })

        // 按行分割处理 SSE data events
        const lines = buffer.split('\n')
        buffer = lines.pop() || '' // 最后一行可能不完整，留到下次

        for (const line of lines) {
          const trimmed = line.trim()
          if (!trimmed || trimmed.startsWith(':')) continue // 注释行

          // 兼容 SSE data: 前缀（可选空格）
          let data
          if (trimmed.startsWith('data: ')) {
            data = trimmed.slice(6)
          } else if (trimmed.startsWith('data:')) {
            data = trimmed.slice(5).trimStart()
          } else {
            continue
          }

          if (data === '[DONE]') {
            callbacks.onDone?.(accumulated)
            return accumulated
          }

          try {
            const parsed = JSON.parse(data)

            // 错误处理
            if (parsed.error) {
              const errMsg = parsed.error?.message || JSON.stringify(parsed.error)
              callbacks.onError?.(new Error(`API 流式错误: ${errMsg}`))
              return accumulated
            }

            const delta = parsed.choices?.[0]?.delta
            if (!delta) continue

            // 标准 content 字段
            if (delta.content) {
              accumulated.content += delta.content
              callbacks.onContent?.(delta.content, accumulated.content)
            }

            // 推理模型 reasoning_content 字段 (DeepSeek R1/v4, OpenAI o1/o3 等)
            if (delta.reasoning_content) {
              accumulated.reasoning += delta.reasoning_content
              callbacks.onReasoning?.(delta.reasoning_content, accumulated.reasoning)
            }
          } catch {
            // 非标准 JSON，跳过
          }
        }
      }

      // 流自然结束 — 冲洗 decoder 并处理残留 buffer
      buffer += decoder.decode()
      if (buffer.trim()) {
        const remaining = buffer.trim()
        let data
        if (remaining.startsWith('data: ')) data = remaining.slice(6)
        else if (remaining.startsWith('data:')) data = remaining.slice(5).trimStart()
        if (data && data !== '[DONE]') {
          try {
            const parsed = JSON.parse(data)
            if (!parsed.error) {
              const delta = parsed.choices?.[0]?.delta
              if (delta?.content) {
                accumulated.content += delta.content
                callbacks.onContent?.(delta.content, accumulated.content)
              }
              if (delta?.reasoning_content) {
                accumulated.reasoning += delta.reasoning_content
                callbacks.onReasoning?.(delta.reasoning_content, accumulated.reasoning)
              }
            }
          } catch { /* last buffer not valid JSON, ignore */ }
        }
      }
      callbacks.onDone?.(accumulated)
      return accumulated
    } catch (e) {
      callbacks.onError?.(e)
      return accumulated
    }
  }

  // ==================== 流式调用 ====================

  /**
   * 流式调用 LLM API
   * @param {string} prompt - 用户提示词
   * @param {object} options - 配置项
   * @param {function} options.onContent - (token, fullContent) => void 每收到内容 token 时调用
   * @param {function} options.onReasoning - (token, fullReasoning) => void 每收到思考 token 时调用
   * @param {function} options.onDone - ({ content, reasoning }) => void 流完成时调用
   * @param {function} options.onError - (error) => void 出错时调用
   * @returns {Promise<{ content: string, reasoning: string }>}
   */
  async function callLLMStream(prompt, options = {}) {
    const config = getConfig()
    const body = buildRequestBody(config, prompt, { ...options, stream: true })

    const response = await fetch('/api/llm', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: options.signal // Add signal
    })

    if (!response.ok) {
      const errData = await response.json().catch(() => null)
      const errMsg = errData?.error?.message || errData?.error || response.statusText
      throw new Error(`API 调用失败 (${response.status}): ${errMsg}`)
    }

    if (!response.body) {
      throw new Error('API 未返回流式响应体')
    }

    return parseSSEStream(response.body, {
      onContent: options.onContent,
      onReasoning: options.onReasoning,
      onDone: options.onDone,
      onError: options.onError
    })
  }

  // ==================== 非流式调用 ====================

  /**
   * 非流式调用 LLM API
   * @param {string} prompt - 用户提示词
   * @param {object} options - 配置项
   * @returns {Promise<{ content: string, reasoning: string }>}
   */
  async function callLLM(prompt, options = {}) {
    const config = getConfig()
    const body = buildRequestBody(config, prompt, options)

    const response = await fetch('/api/llm', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: options.signal // Add signal
    })

    if (!response.ok) {
      const errData = await response.json().catch(() => null)
      const errMsg = errData?.error?.message || errData?.error || response.statusText
      throw new Error(`API 调用失败 (${response.status}): ${errMsg}`)
    }

    const data = await response.json()
    const message = data.choices?.[0]?.message
    if (!message) {
      throw new Error('API 响应格式异常：缺少 choices[0].message')
    }

    return {
      content: message.content?.trim() || '',
      reasoning: message.reasoning_content?.trim() || ''
    }
  }

  // ==================== JSON 输出调用 ====================

  /**
   * 从 LLM 响应中提取有效文本（优先 content，降级到 reasoning）
   */
  function extractText(result) {
    const { content, reasoning } = result
    // content 有内容优先使用
    if (content && content.trim()) return content.trim()
    // content 为空但 reasoning 有内容 → 推理模型把所有输出放在了 reasoning
    if (reasoning && reasoning.trim()) return reasoning.trim()
    throw new Error('API 响应为空：content 和 reasoning_content 均无内容')
  }

  /**
   * 调用 LLM 并解析 JSON 输出
   * 支持流式（带进度回调）和非流式两种模式
   * 流式失败时自动降级到非流式
   *
   * @param {string} prompt - 用户提示词
   * @param {object} options - 配置项
   * @param {function} options.onStreamProgress - (content, reasoning) => void 流式进度回调
   * @returns {Promise<object>} 解析后的 JSON 数据
   */
  async function callLLMForJSON(prompt, options = {}) {
    const { onStreamProgress, ...llmOptions } = options

    const jsonOptions = {
      ...llmOptions,
      systemPrompt: SYSTEM_PROMPT_JSON,
      temperature: 0.1,
      maxTokens: 16384
    }

    let result
    let fromStream = false
    if (onStreamProgress) {
      result = await callLLMStream(prompt, {
        ...jsonOptions,
        signal: llmOptions.signal,
        onContent: (token, full) => onStreamProgress(full, ''),
        onReasoning: (token, full) => onStreamProgress('', full),
      })
      fromStream = true
    } else {
      result = await callLLM(prompt, { ...jsonOptions, signal: llmOptions.signal })
    }

    let text
    try {
      text = extractText(result)
    } catch {
      // 流式返回为空（网络中断/API 错误等），降级到非流式
      if (fromStream) {
        result = await callLLM(prompt, jsonOptions)
        text = extractText(result)
        fromStream = false
      } else {
        throw new Error('API 响应为空：流式和非流式均无返回内容')
      }
    }

    try {
      return parseJSONFromResponse(text)
    } catch (parseErr) {
      // 流式返回了内容但无法解析（截断/格式错误），降级到非流式
      if (fromStream) {
        result = await callLLM(prompt, jsonOptions)
        text = extractText(result)
        fromStream = false
        return parseJSONFromResponse(text)
      }
      throw parseErr
    }
  }

  // ==================== JSON 解析 ====================

  /**
   * 从 LLM 响应文本中提取 JSON
   * 支持：纯 JSON、markdown code block、混合文本中的 JSON、推理模型思考+JSON
   */
  function parseJSONFromResponse(text) {
    let jsonStr = text.trim()

    // 1. 去除 markdown 代码块（兼容多种格式）
    const codeBlockMatch = jsonStr.match(/```(?:json)?[\s\n]*([\s\S]*?)```/)
    if (codeBlockMatch) {
      jsonStr = codeBlockMatch[1].trim()
    }

    // 2. 直接解析
    try { return JSON.parse(jsonStr) } catch { /* 继续 */ }

    // 3. 使用嵌套计数找最外层平衡的 JSON 结构
    const extracted = extractBalancedJSON(jsonStr)
    if (extracted) {
      try { return JSON.parse(extracted) } catch { /* 继续 */ }
    }

    // 4. 查找 JSON 数组（lastIndexOf 回退）
    const arrayStart = jsonStr.indexOf('[')
    if (arrayStart !== -1) {
      const arrayEnd = jsonStr.lastIndexOf(']')
      if (arrayEnd > arrayStart) {
        try { return JSON.parse(jsonStr.substring(arrayStart, arrayEnd + 1)) } catch { /* 继续 */ }
      }
    }

    // 5. 查找 JSON 对象（lastIndexOf 回退）
    const objStart = jsonStr.indexOf('{')
    if (objStart !== -1) {
      const objEnd = jsonStr.lastIndexOf('}')
      if (objEnd > objStart) {
        try { return JSON.parse(jsonStr.substring(objStart, objEnd + 1)) } catch { /* 继续 */ }
      }
    }

    // 6. 最终回退：去除尾部逗号后重试数组/对象提取
    const stripped = jsonStr.replace(/,\s*(?=\s*[}\]])/g, '')
    const arrS2 = stripped.indexOf('[')
    if (arrS2 !== -1) {
      const arrE2 = stripped.lastIndexOf(']')
      if (arrE2 > arrS2) {
        try { return JSON.parse(stripped.substring(arrS2, arrE2 + 1)) } catch { /* 继续 */ }
      }
    }
    const objS2 = stripped.indexOf('{')
    if (objS2 !== -1) {
      const objE2 = stripped.lastIndexOf('}')
      if (objE2 > objS2) {
        try { return JSON.parse(stripped.substring(objS2, objE2 + 1)) } catch { /* 继续 */ }
      }
    }

    throw new Error(`无法从响应中解析 JSON。原始响应前500字符:\n${text.substring(0, 500)}`)
  }

  /**
   * 使用嵌套深度计数提取最外层平衡 JSON（数组或对象）
   */
  function extractBalancedJSON(str) {
    // 找出最先出现的开括号，从那里开始计数（确保提取最外层结构）
    const arrayIdx = str.indexOf('[')
    const objIdx = str.indexOf('{')
    if (arrayIdx === -1 && objIdx === -1) return null

    const startIdx = arrayIdx === -1 ? objIdx : objIdx === -1 ? arrayIdx : Math.min(arrayIdx, objIdx)
    const isArray = str[startIdx] === '['

    let depth = 0
    let inString = false
    let escaped = false
    for (let i = startIdx; i < str.length; i++) {
      const ch = str[i]
      if (escaped) { escaped = false; continue }
      if (ch === '\\' && inString) { escaped = true; continue }
      if (ch === '"') { inString = !inString; continue }
      if (inString) continue
      if (ch === '{' || ch === '[') depth++
      else if (ch === '}' || ch === ']') {
        depth--
        if (depth === 0) return str.substring(startIdx, i + 1)
      }
    }
    return null
  }

  // ==================== 连接测试 ====================

  /**
   * 测试 API 连接（使用流式调用验证）
   */
  async function testConnection() {
    try {
      const config = getConfig()
      let receivedText = ''

      await callLLMStream('请只回复"连接成功"四个字。', {
        model: config.model || 'gpt-4o-mini',
        systemPrompt: '',
        maxTokens: 50,
        onContent: (token) => { receivedText += token },
      })

      const text = receivedText.trim() || '(无响应内容)'
      return { success: true, message: `✅ 连接成功（流式）！模型回复: ${text.substring(0, 100)}` }
    } catch (streamErr) {
      // 流式失败，降级到非流式
      try {
        const result = await callLLM('请只回复"连接成功"四个字。', {
          systemPrompt: '',
          maxTokens: 50
        })
        const text = extractText(result).substring(0, 100)
        return { success: true, message: `✅ 连接成功（非流式）！模型回复: ${text}` }
      } catch (e) {
        return { success: false, message: `流式: ${streamErr.message}\n非流式: ${e.message}` }
      }
    }
  }

  return {
    callLLM,
    callLLMStream,
    callLLMForJSON,
    testConnection,
    parseJSONFromResponse
  }
}

export default useLLM
