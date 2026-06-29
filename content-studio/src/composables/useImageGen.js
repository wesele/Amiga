/**
 * 图片生成模块 — LLM 生成 SVG，浏览器栅格化为 JPEG，服务端持久化
 */
import { useLLM } from './useLLM.js'
import { usePromptStorage } from './usePromptStorage.js'

const EXAMPLE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400" width="400" height="400">
<rect width="400" height="400" fill="#FFFFFF"/>
<circle cx="200" cy="200" r="70" fill="#4A90D9" stroke="#333333" stroke-width="4"/>
<ellipse cx="200" cy="120" rx="30" ry="14" fill="#4CAF50" stroke="#333333" stroke-width="3"/>
</svg>`

const SVG_SYSTEM_PROMPT = `You are an SVG illustrator. You must output one complete, renderable SVG element.
Never use placeholder text like "..." inside tags. Use real coordinates and colors.`

const DEFAULT_SVG_PROMPT = `Here is a valid SVG example (flat vector educational style):

${EXAMPLE_SVG}

Create a NEW complete SVG in the same style for this language-learning image:
Description: \${desc}
Visual details: \${prompt}

Rules:
- Reply with ONLY one <svg>...</svg> element, no markdown, no explanation
- Keep xmlns, viewBox="0 0 400 400", white background <rect>
- Flat vector, thick strokes (3-4px), bright colors, centered subject
- Use real path/rect/circle data — NEVER output placeholder "..." 
- No text, letters, numbers, or watermarks in the image
- Maximum 25 elements`

const RETRY_SUFFIX = `

IMPORTANT: Your previous response was invalid or incomplete.
Output a COMPLETE new <svg> with real shape coordinates (copy the example structure above).`

const DANGEROUS_SVG_RE = new RegExp(
  '<script[\\s>]|</' + 'script>|on\\w+\\s*=|javascript:|data:text/html|foreignObject|<iframe|<embed|<object',
  'i'
)

export function isPlausibleSvg(svg) {
  if (!svg || svg.length < 80) return false
  if (/<svg>\s*\.\.\.\s*<\/svg>/i.test(svg)) return false
  return /<(path|rect|circle|ellipse|line|polyline|polygon|g)\b/i.test(svg)
}

export function extractSvg(text) {
  if (!text) throw new Error('LLM 响应为空')
  const cleaned = text
    .replace(/```svg\s*/gi, '')
    .replace(/```xml\s*/gi, '')
    .replace(/```\s*/g, '')
    .trim()

  const candidates = [...cleaned.matchAll(/<svg[\s\S]*?<\/svg>/gi)]
    .map(m => m[0])
    .filter(isPlausibleSvg)

  if (candidates.length > 0) {
    return candidates.reduce((best, cur) => (cur.length > best.length ? cur : best))
  }

  const greedy = cleaned.match(/<svg[\s\S]*<\/svg>/i)
  if (greedy && isPlausibleSvg(greedy[0])) return greedy[0]

  throw new Error('无法提取有效 SVG（模型可能只输出了占位符或说明文字）')
}

export function tryExtractSvg(text) {
  try {
    return extractSvg(text)
  } catch {
    return null
  }
}

export function sanitizeSvg(svg) {
  let s = svg.trim()
  if (!/^<svg[\s>]/i.test(s)) throw new Error('无效的 SVG 格式')
  if (DANGEROUS_SVG_RE.test(s)) throw new Error('SVG 包含不安全内容，已拒绝')

  if (!/xmlns=/i.test(s)) {
    s = s.replace(/<svg/i, '<svg xmlns="http://www.w3.org/2000/svg"')
  }
  if (!/viewBox=/i.test(s)) {
    s = s.replace(/<svg/i, '<svg viewBox="0 0 400 400"')
  }
  if (!/<rect[^>]*fill=["']#(?:fff|ffffff|FFF|FFFFFF)/i.test(s)) {
    s = s.replace(/<svg([^>]*)>/i, '<svg$1><rect width="400" height="400" fill="#FFFFFF"/>')
  }

  return s
}

export function bustCache(url) {
  if (!url) return ''
  const path = url.split('?')[0]
  return `${path}?v=${Date.now()}`
}

export function svgToJpegDataUrl(svg, size = 400, quality = 0.92, timeoutMs = 15000) {
  return new Promise((resolve, reject) => {
    const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' })
    const objectUrl = URL.createObjectURL(blob)
    const img = new Image()
    let settled = false

    const timer = setTimeout(() => {
      if (settled) return
      settled = true
      URL.revokeObjectURL(objectUrl)
      reject(new Error('SVG 渲染超时'))
    }, timeoutMs)

    const finish = (fn) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      URL.revokeObjectURL(objectUrl)
      fn()
    }

    img.onload = () => {
      try {
        const canvas = document.createElement('canvas')
        canvas.width = size
        canvas.height = size
        const ctx = canvas.getContext('2d')
        ctx.fillStyle = '#ffffff'
        ctx.fillRect(0, 0, size, size)
        ctx.drawImage(img, 0, 0, size, size)
        finish(() => resolve(canvas.toDataURL('image/jpeg', quality)))
      } catch (e) {
        finish(() => reject(e))
      }
    }

    img.onerror = () => {
      finish(() => reject(new Error('SVG 渲染失败，图形可能无效')))
    }

    img.src = objectUrl
  })
}

export async function persistImage(filename, dataUrl) {
  const res = await fetch('/api/images', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ filename, dataUrl })
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || `图片保存失败 (${res.status})`)
  }
  const data = await res.json()
  return bustCache(data.url)
}

function fillTemplate(template, vars) {
  return template.replace(/\$\{(\w+)\}/g, (_, key) => vars[key] ?? '')
}

export function useImageGen() {
  const llm = useLLM()
  const promptStorage = usePromptStorage()

  function pickSvgSource(result) {
    const content = result?.content?.trim() || ''
    const reasoning = result?.reasoning?.trim() || ''
    if (content && tryExtractSvg(content)) return content
    if (reasoning && tryExtractSvg(reasoning)) return reasoning
    return content || reasoning
  }

  function parseSvgFromResult(result) {
    const raw = pickSvgSource(result)
    if (!raw) throw new Error('LLM 未返回内容')
    return sanitizeSvg(extractSvg(raw))
  }

  async function callLlm(userPrompt, llmOpts, options) {
    options.onProgress?.('正在调用 LLM 生成 SVG...')
    let result = await llm.callLLM(userPrompt, llmOpts)
    if (tryExtractSvg(pickSvgSource(result))) return result

    options.onProgress?.('非流式无有效 SVG，尝试流式接收...', 'warning')
    let tokens = 0
    result = await llm.callLLMStream(userPrompt, {
      ...llmOpts,
      onContent: (_token, full) => {
        tokens++
        if (tokens % 8 === 0 || tokens <= 3) {
          options.onProgress?.(`正在接收 SVG... (${full.length} 字符)`)
        }
      },
      onReasoning: (_token, full) => {
        if (full.length % 500 < 50) {
          options.onProgress?.(`模型思考中... (${full.length} 字符)`)
        }
      }
    })
    return result
  }

  async function generateSvg(desc, prompt = '', options = {}) {
    const baseTemplate = promptStorage.getPrompt('image-svg-gen') || DEFAULT_SVG_PROMPT
    const vars = {
      desc: desc || 'educational illustration',
      prompt: prompt || desc || 'simple flat vector object'
    }

    const llmOpts = {
      systemPrompt: SVG_SYSTEM_PROMPT,
      temperature: 0.2,
      maxTokens: 4096,
      signal: options.signal
    }

    let lastError = null
    for (let attempt = 1; attempt <= 2; attempt++) {
      const template = attempt === 1 ? baseTemplate : baseTemplate + RETRY_SUFFIX
      const userPrompt = fillTemplate(template, vars)

      try {
        const result = await callLlm(userPrompt, llmOpts, options)
        const svg = parseSvgFromResult(result)
        if (isPlausibleSvg(svg)) return svg
        throw new Error('SVG 校验未通过（内容过短或缺少图形元素）')
      } catch (e) {
        lastError = e
        if (e.name === 'AbortError') throw e
        if (attempt < 2) {
          options.onProgress?.(`第 ${attempt} 次生成失败: ${e.message}，正在重试...`, 'warning')
        }
      }
    }
    throw lastError || new Error('SVG 生成失败')
  }

  async function generateAndPersist(desc, prompt, filename, options = {}) {
    const svg = await generateSvg(desc, prompt, options)
    options.onProgress?.('正在将 SVG 转为 JPEG...')
    const dataUrl = await svgToJpegDataUrl(svg)
    options.onProgress?.('正在保存图片文件...')
    const url = await persistImage(filename, dataUrl)
    return { svg, url }
  }

  return {
    generateSvg,
    generateAndPersist,
    extractSvg,
    sanitizeSvg,
    isPlausibleSvg,
    bustCache,
    svgToJpegDataUrl,
    persistImage
  }
}

export default useImageGen