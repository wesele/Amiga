/**
 * Repair and prune questions.json
 * Run: node scripts/repair-questions.mjs [--check-only]
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { migrateQuestionFields, buildPairConfigMap } from '../src/utils/normalizeQuestion.js'
import { useValidator } from '../src/composables/useValidator.js'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const dataDir = join(root, 'data')

const questions = JSON.parse(readFileSync(join(dataDir, 'questions.json'), 'utf8'))
const systemConfig = JSON.parse(readFileSync(join(dataDir, 'system-config.json'), 'utf8'))
const pairConfigMap = buildPairConfigMap(systemConfig.languagePairs)

const { questions: repaired, changed, stats } = migrateQuestionFields(questions, pairConfigMap)
const { validateQuestion } = useValidator()

const valid = []
const removed = []

for (const q of repaired) {
  const pair = pairConfigMap[q.pairId] || {}
  const { valid: ok, errors } = validateQuestion(q)
  if (ok) {
    valid.push(q)
  } else {
    removed.push({ id: q.id, type: q.type, errors: errors.slice(0, 2) })
  }
}

const checkOnly = process.argv.includes('--check-only')

if (!checkOnly) {
  writeFileSync(join(dataDir, 'questions.json'), JSON.stringify(valid, null, 2) + '\n', 'utf8')
}

console.log('Repair stats:', stats)
console.log(`Normalized changes: ${changed}`)
console.log(`Valid: ${valid.length}, Removed: ${removed.length}`)
if (removed.length) {
  console.log('Removed:')
  for (const r of removed) console.log(`  ${r.id} (${r.type}): ${r.errors.join('; ')}`)
}
if (checkOnly) {
  process.exit(removed.length > 0 ? 1 : 0)
}
process.exit(0)