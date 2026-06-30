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

/**
 * @param {object} q
 * @param {{ pairId?, sourceLang?, targetLang?, level?, sectionId?, unit? }} ctx
 */
export function normalizeQuestion(q, ctx = {}) {
  const out = { ...q }
  const { pairId, sourceLang, targetLang, level, sectionId, unit } = ctx

  if (pairId) out.pairId = pairId
  if (sectionId) out.sectionId = sectionId
  if (unit) out.unit = unit
  if (level && !out.cefr) out.cefr = level

  out.language = normalizeLanguage(out.language, targetLang)

  if (out.type === 'T06' && !out.targetSentence && out.sentence) {
    out.targetSentence = out.sentence
  }

  if (out.type === 'T02' && Array.isArray(out.imageOptions)) {
    out.imageOptions = normalizeT02ImageOptions(out.imageOptions, out.imagePrompt)
  }

  out.difficulty = normalizeDifficulty(out.difficulty)

  return out
}

export function migrateQuestionFields(questions, pairTargetMap = {}) {
  let changed = 0
  const stats = {
    language: 0,
    targetSentence: 0,
    imagePrompt: 0,
    difficulty: 0,
    pairId: 0,
    sectionId: 0
  }

  const migrated = questions.map(q => {
    const targetLang = pairTargetMap[q.pairId]
    const normalized = normalizeQuestion(q, {
      pairId: q.pairId,
      targetLang,
      level: q.cefr,
      sectionId: q.sectionId,
      unit: q.unit
    })

    if (q.language !== normalized.language) stats.language++
    if (q.type === 'T06' && !q.targetSentence && normalized.targetSentence) stats.targetSentence++
    if (q.type === 'T02' && JSON.stringify(q.imageOptions) !== JSON.stringify(normalized.imageOptions)) {
      stats.imagePrompt++
    }
    if (q.difficulty !== normalized.difficulty) stats.difficulty++
    if (q.pairId !== normalized.pairId) stats.pairId++
    if (q.sectionId !== normalized.sectionId) stats.sectionId++

    if (JSON.stringify(q) !== JSON.stringify(normalized)) changed++
    return normalized
  })

  return { questions: migrated, changed, stats }
}