/**
 * 图片生成模块 — LLM 生成 SVG，浏览器栅格化为 JPEG，服务端持久化
 */
import { useLLM } from './useLLM.js'
import { usePromptStorage } from './usePromptStorage.js'

const SVG_SYSTEM_PROMPT = `You are an expert SVG illustrator for language-learning apps.
Output ONLY a complete, valid SVG element starting with <svg and ending with </svg>.
No markdown fences, no explanation, no text labels inside the image.
Style: modern flat vector illustration, consistent thick line art (3-4px strokes),
vibrant educational colors, white background (#FFFFFF), centered subject, no drop shadows.`

const DEFAULT_SVG_PROMPT = `Create an SVG illustration for a language-learning exercise.

Description: \${desc}
Visual reference: \${prompt}

Requirements:
- viewBox="0 0 400 400" width="400" height="400"
- xmlns="http://www.w3.org/2000/svg"
- White background rectangle covering the full canvas
- Single clear subject, visually distinct, suitable for A1-A2 learners
- No text, letters, numbers, or watermarks in the image
- Use simple geometric shapes and paths only
- Maximum ~30 SVG elements for clarity

Output ONLY the <svg>...</svg> code.`

const DANGEROUS_SVG_RE = new RegExp(
  '<script[\\s>]|</' + 'script>|on\\w+\\s*=|javascript:|data:text/html|foreignObject|<iframe|<embed|<object',
  'i'
)

export function extractSvg(text) {
  if (!text) throw new Error('LLM 响应为空')
  const cleaned = text
    .replace(/```svg\s*/gi, '')
    .replace(/```xml\s*/gi, '')
    .replace(/```\s*/g, '')
    .trim()

  const match = cleaned.match(/<svg[\s\S]*?<\/svg>/i)
  if (!match) throw new Error('无法从 LLM 响应中提取 SVG')
  return match[0]
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

  return s
}

export function svgToJpegDataUrl(svg, size = 400, quality = 0.92) {
  return new Promise((resolve, reject) => {
    const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' })
    const objectUrl = URL.createObjectURL(blob)
    const img = new Image()

    img.onload = () => {
      try {
        const canvas = document.createElement('canvas')
        canvas.width = size
        canvas.height = size
        const ctx = canvas.getContext('2d')
        ctx.fillStyle = '#ffffff'
        ctx.fillRect(0, 0, size, size)
        ctx.drawImage(img, 0, 0, size, size)
        resolve(canvas.toDataURL('image/jpeg', quality))
      } catch (e) {
        reject(e)
      } finally {
        URL.revokeObjectURL(objectUrl)
      }
    }

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl)
      reject(new Error('SVG 渲染失败，图形可能无效'))
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
  return data.url
}

function fillTemplate(template, vars) {
  return template.replace(/\$\{(\w+)\}/g, (_, key) => vars[key] ?? '')
}

export function useImageGen() {
  const llm = useLLM()
  const promptStorage = usePromptStorage()

  async function generateSvg(desc, prompt = '', options = {}) {
    const template = promptStorage.getPrompt('image-svg-gen') || DEFAULT_SVG_PROMPT
    const userPrompt = fillTemplate(template, {
      desc: desc || 'educational illustration',
      prompt: prompt || desc || 'simple flat vector object'
    })

    const result = await llm.callLLM(userPrompt, {
      systemPrompt: SVG_SYSTEM_PROMPT,
      temperature: 0.4,
      maxTokens: 8192,
      signal: options.signal
    })

    const raw = result.content || result.reasoning || ''
    const svg = sanitizeSvg(extractSvg(raw))
    return svg
  }

  /**
   * 生成 SVG → JPEG → 持久化，返回 { svg, url }
   */
  async function generateAndPersist(desc, prompt, filename, options = {}) {
    const svg = await generateSvg(desc, prompt, options)
    const dataUrl = await svgToJpegDataUrl(svg)
    const url = await persistImage(filename, dataUrl)
    return { svg, url }
  }

  return {
    generateSvg,
    generateAndPersist,
    extractSvg,
    sanitizeSvg,
    svgToJpegDataUrl,
    persistImage
  }
}

export default useImageGen