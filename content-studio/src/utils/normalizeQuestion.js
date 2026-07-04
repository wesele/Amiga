/** Normalize question fields for storage and validation */

const ES_ALIASES = new Set(['espanol', 'español', 'es', 'es-espanol'])
const ZH_ALIASES = new Set(['zh-cn', 'zh', '中文'])
const EN_ALIASES = new Set(['english', 'en'])

export function normalizeLanguage(lang, pairTo) {
  if (lang != null && lang !== '') {
    const raw = String(lang).trim()
    const lower = raw.toLowerCase()

    if (raw === 'Espanol' || ES_ALIASES.has(lower)) return 'es'
    if (ZH_ALIASES.has(lower) || raw === '中文') return 'zh'
    if (raw === 'English' || EN_ALIASES.has(lower)) return 'en'
    if (['es', 'zh', 'en'].includes(lower)) return lower
  }

  if (pairTo) {
    const to = String(pairTo).trim()
    const toLower = to.toLowerCase()
    if (to === 'Espanol' || to === '西班牙语' || ES_ALIASES.has(toLower)) return 'es'
    if (to === '中文' || ZH_ALIASES.has(toLower)) return 'zh'
    if (to === 'English' || EN_ALIASES.has(toLower)) return 'en'
  }

  return lang != null && lang !== '' ? String(lang).trim() : ''
}

function normalizeDifficulty(value) {
  let n = typeof value === 'number' ? value : parseInt(value, 10)
  if (!Number.isFinite(n)) n = 3
  return Math.min(5, Math.max(1, Math.round(n)))
}

function normalizeT02ImageOptions(imageOptions, questionImagePrompt) {
  if (!Array.isArray(imageOptions)) return imageOptions
  return imageOptions.map(opt => {
    if (!opt || typeof opt !== 'object') return opt
    if (opt.prompt) return opt
    const prompt = opt.imagePrompt || questionImagePrompt
    return prompt ? { ...opt, prompt } : opt
  })
}

function normalizeT03Pairs(q) {
  if (Array.isArray(q.pairs) && q.pairs.length > 0) {
    const first = q.pairs[0]
    if (first && typeof first === 'object' && !Array.isArray(first) && ('left' in first || 'right' in first)) {
      return q.pairs.map(p => ({
        left: String(p.left ?? ''),
        right: String(p.right ?? '')
      }))
    }
    if (Array.isArray(first) && Array.isArray(q.left) && Array.isArray(q.right)) {
      return q.pairs.map(([li, ri]) => ({
        left: String(q.left[li] ?? ''),
        right: String(q.right[ri] ?? '')
      }))
    }
  }
  if (Array.isArray(q.left) && Array.isArray(q.right) && q.left.length === q.right.length) {
    return q.left.map((left, i) => ({
      left: String(left),
      right: String(q.right[i] ?? '')
    }))
  }
  return q.pairs
}

function normalizeT06Fields(q) {
  const out = { ...q }
  if (!Array.isArray(out.words) && Array.isArray(out.scrambledWords)) {
    out.words = out.scrambledWords.map(String)
  }
  if (typeof out.words === 'string') {
    out.words = out.words.split(/\s+/).filter(Boolean)
  }
  if (!out.targetSentence && out.correctSentence) {
    out.targetSentence = out.correctSentence
  }
  if (!out.targetSentence && out.sentence) {
    out.targetSentence = out.sentence
  }
  if (!out.targetSentence && Array.isArray(out.answer)) {
    out.targetSentence = out.answer.join(' ')
  } else if (!out.targetSentence && typeof out.answer === 'string') {
    out.targetSentence = out.answer
  }
  if (!out.targetSentence && Array.isArray(out.correctOrder) && Array.isArray(out.words)) {
    out.targetSentence = out.correctOrder
      .map(i => out.words[i])
      .filter(Boolean)
      .join(' ')
  }
  if (!out.targetSentence && Array.isArray(out.words)) {
    out.targetSentence = out.words.join(' ')
  }
  return out
}

function inferSourceLangCode(sourceLangLabel, pairFrom) {
  const code = normalizeLanguage(sourceLangLabel || pairFrom)
  return ['es', 'zh', 'en'].includes(code) ? code : normalizeLanguage(pairFrom)
}

/**
 * @param {object} q
 * @param {{ pairId?, sourceLang?, targetLang?, level?, sectionId?, unit?, pairFrom? }} ctx
 */
export function normalizeQuestion(q, ctx = {}) {
  let out = { ...q }
  const { pairId, sourceLang, targetLang, level, sectionId, unit, pairFrom } = ctx

  if (pairId) out.pairId = pairId
  if (sectionId) out.sectionId = sectionId
  if (unit) out.unit = unit
  if (level && !out.cefr) out.cefr = level

  out.language = normalizeLanguage(out.language, targetLang)

  if (out.correctIdx != null && out.answerIdx == null) {
    out.answerIdx = out.correctIdx
  }
  if (out.answerIndex != null && out.answerIdx == null) {
    out.answerIdx = out.answerIndex
  }

  if (out.type === 'T03') {
    out.pairs = normalizeT03Pairs(out)
    delete out.left
    delete out.right
  }

  if (out.type === 'T05') {
    if (!out.blank && Array.isArray(out.options) && out.answerIdx != null) {
      out.blank = out.options[out.answerIdx]
    }
  }

  if (out.type === 'T06') {
    out = normalizeT06Fields(out)
  }

  if (out.type === 'T07' || out.type === 'T10') {
    if (!out.sourceLang) {
      out.sourceLang = inferSourceLangCode(sourceLang, pairFrom)
    } else {
      out.sourceLang = normalizeLanguage(out.sourceLang, pairFrom)
    }
  }

  if (out.type === 'T02' && Array.isArray(out.imageOptions)) {
    out.imageOptions = normalizeT02ImageOptions(out.imageOptions, out.imagePrompt)
  }

  out.difficulty = normalizeDifficulty(out.difficulty)

  return out
}

function fisherYates(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
}

const CHOICE_TYPES = new Set(['T01', 'T02', 'T05', 'T07', 'T08', 'T12'])

export function shuffleOptions(q) {
  if (!CHOICE_TYPES.has(q.type)) return q
  if (q.type === 'T02') {
    if (!Array.isArray(q.imageOptions) || q.imageOptions.length < 2) return q
    if (q.answerIdx == null || q.answerIdx < 0 || q.answerIdx >= q.imageOptions.length) return q
    const correctItem = q.imageOptions[q.answerIdx]
    const opts = [...q.imageOptions]
    fisherYates(opts)
    const newIdx = opts.indexOf(correctItem)
    return { ...q, imageOptions: opts, answerIdx: newIdx }
  }
  if (!Array.isArray(q.options) || q.options.length < 2) return q
  if (q.answerIdx == null || q.answerIdx < 0 || q.answerIdx >= q.options.length) return q
  const correctValue = q.options[q.answerIdx]
  const opts = [...q.options]
  fisherYates(opts)
  const newIdx = opts.indexOf(correctValue)
  const out = { ...q, options: opts, answerIdx: newIdx }
  if (q.type === 'T05' && q.blank !== undefined) {
    out.blank = correctValue
  }
  return out
}

export function migrateQuestionFields(questions, pairConfigMap = {}) {
  let changed = 0
  const stats = {
    language: 0,
    targetSentence: 0,
    blank: 0,
    sourceLang: 0,
    pairs: 0,
    answerIdx: 0,
    imagePrompt: 0,
    difficulty: 0
  }

  const migrated = questions.map(q => {
    const pair = pairConfigMap[q.pairId] || {}
    const normalized = normalizeQuestion(q, {
      pairId: q.pairId,
      sourceLang: pair.from,
      targetLang: pair.to,
      pairFrom: pair.from,
      level: q.cefr,
      sectionId: q.sectionId,
      unit: q.unit
    })

    if (q.language !== normalized.language) stats.language++
    if (q.type === 'T06' && !q.targetSentence && normalized.targetSentence) stats.targetSentence++
    if (q.type === 'T05' && !q.blank && normalized.blank) stats.blank++
    if ((q.type === 'T07' || q.type === 'T10') && !q.sourceLang && normalized.sourceLang) stats.sourceLang++
    if (q.type === 'T03' && JSON.stringify(q.pairs) !== JSON.stringify(normalized.pairs)) stats.pairs++
    if (q.answerIdx == null && normalized.answerIdx != null) stats.answerIdx++
    if (q.type === 'T02' && JSON.stringify(q.imageOptions) !== JSON.stringify(normalized.imageOptions)) {
      stats.imagePrompt++
    }
    if (q.difficulty !== normalized.difficulty) stats.difficulty++

    if (JSON.stringify(q) !== JSON.stringify(normalized)) changed++
    return normalized
  })

  return { questions: migrated, changed, stats }
}

export function buildPairConfigMap(languagePairs) {
  return Object.fromEntries(
    (languagePairs || []).map(p => [p.id, { from: p.from, to: p.to }])
  )
}