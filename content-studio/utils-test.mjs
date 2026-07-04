import {
  buildSectionId, parseSectionId, inferPairIdFromLanguage,
  questionMatchesSection, migrateQuestionSectionIds
} from './src/utils/sectionId.js'
import {
  normalizeLanguage, normalizeQuestion, migrateQuestionFields, buildPairConfigMap, shuffleOptions
} from './src/utils/normalizeQuestion.js'
import { useValidator } from './src/composables/useValidator.js'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

let passed = 0
let failed = 0
function assert(c, m) { if (c) { console.log(`  ✅ ${m}`); passed++ } else { console.log(`  ❌ ${m}`); failed++ } }

console.log('\n=== sectionId ===')
assert(buildSectionId('zh-es', 'U01', 'S01') === 'zh-es/U01-S01', 'buildSectionId')

console.log('\n=== normalizeQuestion ===')
const t05 = normalizeQuestion(
  { type: 'T05', options: ['a', 'b'], answerIdx: 1, language: 'Espanol' },
  { targetLang: 'Espanol', pairFrom: '中文', sourceLang: '中文' }
)
assert(t05.blank === 'b', 'T05 blank from answerIdx')
assert(t05.language === 'es', 'language es')

const t07 = normalizeQuestion(
  { type: 'T07', sourceText: '你好', options: ['Hola'] },
  { pairFrom: '中文', sourceLang: '中文', targetLang: 'Espanol' }
)
assert(t07.sourceLang === 'zh', 'T07 sourceLang zh')

const t03 = normalizeQuestion({
  type: 'T03',
  left: ['hola', 'adiós'],
  right: ['你好', '再见']
}, {})
assert(t03.pairs?.length === 2 && t03.pairs[0].left === 'hola', 'T03 left/right → pairs')

const t06 = normalizeQuestion({
  type: 'T06',
  scrambledWords: ['Hola', 'mundo'],
  answer: 'Hola mundo'
}, { targetLang: 'Espanol' })
assert(t06.words?.length === 2 && t06.targetSentence === 'Hola mundo', 'T06 aliases')

const t02 = normalizeQuestion({ type: 'T02', correctIdx: 2, imageOptions: [] }, {})
assert(t02.answerIdx === 2, 'T02 correctIdx → answerIdx')

console.log('\n=== shuffleOptions ===')
const t05opts = { type: 'T05', options: ['correct', 'wrong1', 'wrong2'], answerIdx: 0 }
const t05shuffled = shuffleOptions(t05opts)
assert(t05shuffled.options.length === 3, 'T05 options count unchanged')
assert(t05shuffled.options[t05shuffled.answerIdx] === 'correct', 'T05 correct option at new answerIdx')
assert(t05shuffled.blank === undefined || t05shuffled.blank === 'correct', 'T05 blank consistent')
assert(new Set(t05shuffled.options).size === 3, 'T05 options still unique')

const t05withBlank = { type: 'T05', options: ['correct', 'wrong1', 'wrong2'], answerIdx: 0, blank: 'correct' }
const t05swb = shuffleOptions(t05withBlank)
assert(t05swb.options[t05swb.answerIdx] === 'correct', 'T05 with blank: correct at new idx')
assert(t05swb.blank === 'correct', 'T05 with blank preserved')

const t02opts = [
  { desc: 'wrong A', prompt: '...' },
  { desc: 'correct B', prompt: '...' },
  { desc: 'wrong C', prompt: '...' },
]
const t02q = { type: 'T02', imageOptions: t02opts, answerIdx: 1 }
const t02shuffled = shuffleOptions(t02q)
assert(t02shuffled.imageOptions.length === 3, 'T02 imageOptions count unchanged')
assert(t02shuffled.imageOptions[t02shuffled.answerIdx].desc === 'correct B', 'T02 correct at new idx')

const nonChoice = { type: 'T03', pairs: [{ left: 'a', right: 'b' }] }
const ncs = shuffleOptions(nonChoice)
assert(ncs === nonChoice, 'non-choice type returned as-is')

const singleOpt = { type: 'T01', options: ['only'], answerIdx: 0 }
const sos = shuffleOptions(singleOpt)
assert(sos === singleOpt, 'single option returned as-is')

console.log('\n=== questions.json validation ===')
const root = dirname(fileURLToPath(import.meta.url))
const questions = JSON.parse(readFileSync(join(root, 'data/questions.json'), 'utf8'))
const config = JSON.parse(readFileSync(join(root, 'data/system-config.json'), 'utf8'))
const pairMap = buildPairConfigMap(config.languagePairs)
const { questions: repaired } = migrateQuestionFields(questions, pairMap)
const { validateQuestion } = useValidator()
let invalid = 0
for (const q of repaired) {
  if (!validateQuestion(q).valid) invalid++
}
assert(invalid === 0, `all ${repaired.length} questions valid (invalid: ${invalid})`)
assert(repaired.every(q => q.sectionId?.includes('/')), 'all sectionIds scoped')

console.log(`\n=== ${passed} passed, ${failed} failed ===`)
process.exit(failed > 0 ? 1 : 0)