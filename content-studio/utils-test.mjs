import {
  buildSectionId, parseSectionId, inferPairIdFromLanguage,
  questionMatchesSection, migrateQuestionSectionIds
} from './src/utils/sectionId.js'
import {
  normalizeLanguage, normalizeQuestion, migrateQuestionFields, buildPairConfigMap, shuffleOptions
} from './src/utils/normalizeQuestion.js'
import { useValidator } from './src/composables/useValidator.js'
import { buildLLMRequestBody } from './src/composables/useLLM.js'
import { CEFR_TYPE_MAP } from './src/data/question-types.js'
import { missingQuestionCount } from './src/utils/questionGeneration.js'
import { isTransientConcurrencyError, runAdaptivePool } from './src/utils/adaptivePool.js'
import { shouldPersistQuestionLevelClear } from './src/utils/questionPersistence.js'
import { createKeyedSerialQueue } from './src/utils/keyedSerialQueue.js'
import { calculateGenerationStats } from './src/utils/generationStats.js'
import { useAsyncOperation } from './src/composables/useAsyncOperation.js'
import { useStorage } from './src/composables/useStorage.js'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { readdirSync } from 'node:fs'

let passed = 0
let failed = 0
function assert(c, m) { if (c) { console.log(`  ✅ ${m}`); passed++ } else { console.log(`  ❌ ${m}`); failed++ } }

console.log('\n=== LLM request parameters ===')
const llmBody = buildLLMRequestBody({
  model: 'test-model', temperature: 0.4, topP: 0.9, maxTokens: 2048,
  frequencyPenalty: null, presencePenalty: 0
}, 'hello', { stream: true })
assert(llmBody.temperature === 0.4 && llmBody.top_p === 0.9, 'configured sampling parameters are mapped')
assert(llmBody.max_tokens === 2048 && llmBody.presence_penalty === 0, 'configured token and penalty parameters are mapped')
assert(!('frequency_penalty' in llmBody), 'empty parameters are omitted')
assert(llmBody.stream === true && llmBody.model === 'test-model', 'request options are preserved')

console.log('\n=== sectionId ===')
assert(buildSectionId('zh-es', 'U01', 'S01') === 'zh-es/U01-S01', 'buildSectionId')

console.log('\n=== incremental question generation ===')
assert(missingQuestionCount(0, 5) === 5, 'empty section generates full target')
assert(missingQuestionCount(3, 5) === 2, 'partially filled section only generates the difference')
assert(missingQuestionCount(5, 5) === 0, 'full section is skipped')
assert(missingQuestionCount(8, 5) === 0, 'overfilled section is preserved')

console.log('\n=== question level clearing ===')
assert(!shouldPersistQuestionLevelClear(0, false), 'missing empty shard needs no persistence')
assert(shouldPersistQuestionLevelClear(0, true), 'existing empty shard keeps revision validation')
assert(shouldPersistQuestionLevelClear(1, false), 'loaded questions must be persisted when cleared')

console.log('\n=== keyed serial queue ===')
const serialQueue = createKeyedSerialQueue()
const serialOrder = []
await Promise.all([
  serialQueue.enqueue('zh-es/B1', async () => { await Promise.resolve(); serialOrder.push('first') }),
  serialQueue.enqueue('zh-es/B1', async () => { serialOrder.push('second') })
])
assert(serialOrder.join(',') === 'first,second', 'writes for one question shard are serialized')

console.log('\n=== generation stats ===')
const generationStats = calculateGenerationStats({
  pairId: 'zh-es', cefr: 'B1', questionsPerSection: 2,
  units: [{ id: 'U01', sections: [{ id: 'S01' }, { id: 'S02' }] }],
  questions: [
    { id: 'q1', pairId: 'zh-es', cefr: 'B1', sectionId: 'zh-es/U01-S01', type: 'T01', imageSvg: '<svg />' },
    { id: 'q2', pairId: 'zh-es', cefr: 'B1', sectionId: 'zh-es/U01-S01', type: 'T02', imageOptions: [{ imageUrl: '/one.jpg' }, {}, {}, {}] },
    { id: 'q3', pairId: 'zh-es', cefr: 'B1', sectionId: 'zh-es/U01-S01', type: 'T03' },
    { id: 'other', pairId: 'zh-es', cefr: 'A2', sectionId: 'zh-es/U01-S01', type: 'T01', imageSvg: '<svg />' }
  ]
})
assert(generationStats.generatedQuestions === 3 && generationStats.totalQuestions === 5, 'question stats follow framework targets and preserve overfilled sections')
assert(generationStats.generatedImages === 2 && generationStats.totalImages === 5, 'image stats count T01 and every T02 image slot')

console.log('\n=== adaptive concurrency ===')
assert(isTransientConcurrencyError(new Error('HTTP 429 rate limit')), '429 is transient')
assert(!isTransientConcurrencyError(new Error('JSON schema invalid')), 'schema error is deterministic')
let attempts = 0
const concurrencyChanges = []
const workerStates = []
const poolResult = await runAdaptivePool([1, 2, 3], async value => {
  if (value === 2 && attempts++ === 0) throw new Error('HTTP 429')
  return value * 2
}, {
  maxConcurrency: 3, maxRetries: 1, recoverySuccesses: 10, retryDelayMs: 1,
  describeTask: value => `task-${value}`,
  onConcurrencyChange: n => concurrencyChanges.push(n),
  onWorkerState: (id, state) => workerStates.push({ id, ...state })
})
assert(poolResult.results.join(',') === '2,4,6', 'transient task is retried without duplication')
assert(concurrencyChanges.includes(2), 'transient failure reduces concurrency')
assert(workerStates.some(state => state.status === 'running' && state.task.startsWith('task-')), 'worker reports its current task')
assert(workerStates.some(state => state.status === 'retrying' && state.attempt === 1), 'worker reports retry progress')
assert(workerStates.some(state => state.status === 'completed'), 'worker reports completion')
assert(workerStates.some(state => state.status === 'completed' && state.percent === 100), 'completed worker reports full progress')
let validationAttempts = 0
const validationRetry = await runAdaptivePool(['T11'], async () => {
  if (validationAttempts++ === 0) {
    const error = new Error('missing scoringDimensions')
    error.retryable = true
    throw error
  }
  return 'valid'
}, { maxConcurrency: 1, maxRetries: 1, retryDelayMs: 1 })
assert(validationRetry.results[0] === 'valid' && validationAttempts === 2, 'validation failures can retry without reducing concurrency')
const cancelController = new AbortController()
let abortCleanupFinished = false
const cancelledPool = runAdaptivePool([1, 2], async value => {
  if (value === 1) return 'saved'
  return new Promise((resolve, reject) => cancelController.signal.addEventListener('abort', () => {
    abortCleanupFinished = true
    reject(new DOMException('Aborted', 'AbortError'))
  }, { once: true }))
}, { maxConcurrency: 2, signal: cancelController.signal })
await Promise.resolve()
cancelController.abort()
await cancelledPool.catch(error => assert(error.name === 'AbortError', 'cancelled pool reports AbortError after runners settle'))
assert(abortCleanupFinished, 'cancel waits for in-flight runner cleanup')

console.log('\n=== new question shard revision ===')
const originalFetch = globalThis.fetch
const fetchCalls = []
globalThis.fetch = async (url, options = {}) => {
  fetchCalls.push({ url: String(url), method: options.method || 'GET', revision: options.headers?.['If-Match'] })
  if (!options.method) return new Response(JSON.stringify({ data: [], revision: 'empty-revision' }), { status: 200 })
  return new Response(JSON.stringify({ data: options.method === 'PUT' ? JSON.parse(options.body).questions : [], revision: 'saved-revision' }), { status: 200 })
}
const revisionStorage = useStorage()
await revisionStorage.replaceSectionQuestions('test-new-pair', 'B1', 'U01', 'S01', [{
  id: 'test-new-pair-B1-U01-S01-001', pairId: 'test-new-pair', cefr: 'B1', unit: 'U01', sectionId: 'test-new-pair/U01-S01'
}])
globalThis.fetch = originalFetch
assert(fetchCalls.length === 2 && fetchCalls[0].method === 'GET', 'missing shard revision is loaded before first write')
assert(fetchCalls[1].revision === 'empty-revision', 'first shard write uses the server empty revision')
const asyncProgress = useAsyncOperation()
asyncProgress.start('test', { label: '题目生成总进度', unit: '道', total: 5 })
asyncProgress.advanceProgress(true, 2)
asyncProgress.advanceProgress(false, 1)
assert(asyncProgress.progress.value.current === 3, 'overall progress counts finalized tasks')
assert(asyncProgress.progress.value.generated === 2 && asyncProgress.progress.value.failed === 1, 'overall progress separates success and failure')
asyncProgress.cancel()

console.log('\n=== normalizeQuestion ===')
const scopedB1 = normalizeQuestion(
  { type: 'T01', pairId: 'wrong-pair', cefr: 'A2', sectionId: 'wrong/section' },
  { pairId: 'zh-es', level: 'B1', sectionId: 'zh-es/U05-S03', unit: 'U05' }
)
assert(
  scopedB1.pairId === 'zh-es' && scopedB1.cefr === 'B1' && scopedB1.sectionId === 'zh-es/U05-S03' && scopedB1.unit === 'U05',
  'generation context overrides model-owned question scope fields'
)
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

console.log('\n=== question shards validation ===')
const root = dirname(fileURLToPath(import.meta.url))
const questionIndex = JSON.parse(readFileSync(join(root, 'data/questions/index.json'), 'utf8'))
const questions = questionIndex.shards.flatMap(shard =>
  JSON.parse(readFileSync(join(root, 'data/questions', shard.file), 'utf8'))
)
const config = JSON.parse(readFileSync(join(root, 'data/system-config.json'), 'utf8'))
const pairMap = buildPairConfigMap(config.languagePairs)
const pairDefinitions = Object.fromEntries(config.languagePairs.map(pair => [pair.id, pair]))
const { questions: repaired } = migrateQuestionFields(questions, pairMap)
const { validateQuestion } = useValidator()
let invalid = 0
for (const q of repaired) {
  if (!validateQuestion(q).valid) invalid++
}
assert(invalid === 0, `all ${repaired.length} questions valid (invalid: ${invalid})`)
assert(repaired.every(q => q.sectionId?.includes('/')), 'all sectionIds scoped')
assert(new Set(repaired.map(q => q.id)).size === repaired.length, 'question IDs are unique')
assert(repaired.every(q => pairMap[q.pairId] && pairMap[q.pairId].to?.length), 'question pairIds exist in system config')
assert(repaired.every(q => pairDefinitions[q.pairId]?.cefrLevels?.includes(q.cefr)), 'question CEFR levels are enabled for their pair')
assert(repaired.every(q => !q.sectionId?.includes('/') || q.sectionId.split('/')[0] === q.pairId), 'sectionId pair prefixes match pairId')
assert(repaired.every(q => !CEFR_TYPE_MAP[q.cefr] || CEFR_TYPE_MAP[q.cefr].includes(q.type)), 'question types match CEFR rules')
const imageFiles = new Set(readdirSync(join(root, 'data/images')))
const imageUrls = repaired.flatMap(q => q.type === 'T01' ? [q.imageUrl] : q.type === 'T02' ? (q.imageOptions || []).map(o => o.imageUrl) : [])
  .filter(Boolean)
  .map(url => url.split('/').pop().split('?')[0])
assert(imageUrls.every(filename => imageFiles.has(filename)), 'all referenced image files exist')
console.log(`  图片目标缺失但允许为空: ${repaired.flatMap(q => q.type === 'T01' ? [q] : q.type === 'T02' ? (q.imageOptions || []) : []).filter(target => !target.imageSvg && !target.imageUrl).length}`)

console.log(`\n=== ${passed} passed, ${failed} failed ===`)
process.exit(failed > 0 ? 1 : 0)
