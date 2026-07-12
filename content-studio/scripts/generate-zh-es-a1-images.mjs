import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const dataPath = path.join(root, 'data', 'questions.json')
const configPath = path.join(root, 'studio.config.json')

const config = JSON.parse(await fs.readFile(configPath, 'utf8'))
const questions = JSON.parse(await fs.readFile(dataPath, 'utf8'))
const targets = []

for (const question of questions) {
  if (question.pairId !== 'zh-es' || question.cefr !== 'A1') continue
  if (question.type === 'T01') targets.push({ question, target: question, index: null })
  if (question.type === 'T02') {
    for (let index = 0; index < (question.imageOptions || []).length; index++) {
      targets.push({ question, target: question.imageOptions[index], index })
    }
  }
}

const missing = targets.filter(({ target }) => !target.imageSvg)
console.log(`目标插图 ${targets.length} 张，待生成 ${missing.length} 张`)

const prompt = ({ question, target, index }) => {
  const distractors = question.type === 'T02'
    ? question.imageOptions.map((option, i) => `${i === index ? 'TARGET' : 'OTHER'}: ${option.desc}; ${option.prompt}`).join('\n')
    : (question.options || []).join(' | ')
  return `Create ONE complete self-contained SVG illustration for a CEFR A1 Spanish language-learning question.
Scene description: ${target.desc || question.imageDesc}
Visual brief: ${target.prompt || question.imagePrompt}
Learning concept: ${question.type === 'T02' ? question.audioText : question.options?.[question.answerIdx]}
Other options, which must be visually distinct: ${distractors}

Output ONLY one SVG, with no markdown or explanation. Use viewBox="0 0 400 400" and width="400" height="400". Start with a white background rectangle. Use a clean flat educational vector style, thick dark outlines, bright simple colors, one centered focal subject, and 15–35 simple shape elements. No text, letters, numbers, labels, logos, watermark, speech bubbles, or gradients.`
}

function extractSvg(text) {
  const match = String(text).match(/<svg[\s\S]*?<\/svg>/i)
  if (!match) throw new Error('model did not return SVG')
  const svg = match[0].trim()
  if (!/<(rect|circle|ellipse|path|line|polygon|polyline|g)\b/i.test(svg)) throw new Error('SVG has no drawable shapes')
  if (/<(script|foreignObject|iframe|object|embed)\b|on[a-z]+\s*=/i.test(svg)) throw new Error('unsafe SVG')
  return svg
}

function findSvgText(value) {
  if (typeof value === 'string' && /<svg[\s\S]*?<\/svg>/i.test(value)) return value
  if (Array.isArray(value)) {
    for (const part of value) {
      const found = findSvgText(part)
      if (found) return found
    }
  } else if (value && typeof value === 'object') {
    for (const part of Object.values(value)) {
      const found = findSvgText(part)
      if (found) return found
    }
  }
  return ''
}

async function generateOne(item) {
  const response = await fetch(`${String(config.baseUrl).replace(/\/$/, '')}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.apiKey}` },
    body: JSON.stringify({
      model: config.model,
      temperature: 0.2,
      max_tokens: 12000,
      messages: [
        { role: 'system', content: 'You are a precise SVG illustrator. Return only valid SVG markup.' },
        { role: 'user', content: prompt(item) }
      ]
    })
  })
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${(await response.text()).slice(0, 180)}`)
  const body = await response.json()
  return extractSvg(findSvgText(body))
}

async function save() {
  await fs.writeFile(dataPath, JSON.stringify(questions, null, 2) + '\n', 'utf8')
}

let cursor = 0
let completed = targets.length - missing.length
const worker = async () => {
  while (cursor < missing.length) {
    const item = missing[cursor++]
    const name = item.index == null ? item.question.id : `${item.question.id}-opt${item.index}`
    let lastError
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        item.target.imageSvg = await generateOne(item)
        item.target.imageUrl = ''
        completed++
        await save()
        console.log(`[${completed}/${targets.length}] ${name}`)
        lastError = null
        break
      } catch (error) {
        lastError = error
        await new Promise(resolve => setTimeout(resolve, 1200 * attempt))
      }
    }
    if (lastError) console.error(`[FAILED] ${name}: ${lastError.message}`)
  }
}

await Promise.all(Array.from({ length: 20 }, worker))
await save()
const remaining = targets.filter(({ target }) => !target.imageSvg).length
console.log(`完成：${targets.length - remaining}/${targets.length}；剩余：${remaining}`)
