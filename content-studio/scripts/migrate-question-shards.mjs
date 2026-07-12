import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const source = join(root, 'data', 'questions.json')
const target = join(root, 'data', 'questions')
if (!existsSync(source)) throw new Error(`迁移源不存在: ${source}`)

const questions = JSON.parse(readFileSync(source, 'utf8'))
if (!Array.isArray(questions)) throw new Error('questions.json 必须是数组')

const shards = new Map()
for (const question of questions) {
  if (typeof question.unitTheme === 'number') question.unitTheme = String(question.unitTheme)
  if (!question.pairId || !question.cefr) throw new Error(`题目 ${question.id || '(无 id)'} 缺少 pairId/cefr`)
  const key = `${question.pairId}/${question.cefr}`
  if (!shards.has(key)) shards.set(key, [])
  shards.get(key).push(question)
}

mkdirSync(target, { recursive: true })
const index = { version: 1, shards: [] }
for (const [key, data] of [...shards.entries()].sort(([a], [b]) => a.localeCompare(b))) {
  const [pairId, cefr] = key.split('/')
  const file = `${pairId}/${cefr}.json`
  const path = join(target, file)
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, JSON.stringify(data, null, 2) + '\n', 'utf8')
  index.shards.push({ pairId, cefr, file })
}
writeFileSync(join(target, 'index.json'), JSON.stringify(index, null, 2) + '\n', 'utf8')
console.log(`已迁移 ${questions.length} 道题目到 ${index.shards.length} 个分片`)
