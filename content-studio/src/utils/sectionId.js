/** Pair-scoped section identifiers: `{pairId}/{unitId}-{secId}` e.g. `zh-es/U01-S01` */

const REVERSE_PAIR_ID = 'pair_1781451962486'
const ZH_ES_PAIR_ID = 'zh-es'
const ZH_EN_PAIR_ID = 'pair_1782569237717'

export function buildSectionId(pairId, unitId, secId) {
  return `${pairId}/${unitId}-${secId}`
}

export function parseSectionId(sectionId) {
  if (!sectionId || typeof sectionId !== 'string') {
    return { pairId: null, unitSection: sectionId || '' }
  }
  const slashIdx = sectionId.indexOf('/')
  if (slashIdx === -1) {
    return { pairId: null, unitSection: sectionId }
  }
  return {
    pairId: sectionId.slice(0, slashIdx),
    unitSection: sectionId.slice(slashIdx + 1)
  }
}

export function inferPairIdFromLanguage(language) {
  if (!language) return null
  const lang = String(language).trim()
  const lower = lang.toLowerCase()

  if (lang === 'zh-CN' || lower === 'zh-cn' || lower === '中文') {
    return REVERSE_PAIR_ID
  }
  if (
    lower === 'espanol' ||
    lower === 'español' ||
    lower === 'es' ||
    lower === 'es-espanol' ||
    lang === 'Espanol'
  ) {
    return ZH_ES_PAIR_ID
  }
  if (lower === 'english' || lower === 'en' || lang === 'English') {
    return ZH_EN_PAIR_ID
  }
  if (lower === 'es') return ZH_ES_PAIR_ID
  if (lower === 'zh') return REVERSE_PAIR_ID
  return null
}

export function questionMatchesSection(q, pairId, unitId, secId) {
  if (!q || !pairId) return false
  const scoped = buildSectionId(pairId, unitId, secId)
  const legacy = `${unitId}-${secId}`

  if (q.sectionId === scoped) {
    return !q.pairId || q.pairId === pairId
  }

  if (q.sectionId === legacy) {
    if (q.pairId) return q.pairId === pairId
    return inferPairIdFromLanguage(q.language) === pairId
  }

  const parsed = parseSectionId(q.sectionId)
  if (parsed.pairId === pairId && parsed.unitSection === legacy) {
    return !q.pairId || q.pairId === pairId
  }

  return false
}

export function migrateQuestionSectionIds(questions) {
  let changed = 0
  const migrated = questions.map(q => {
    if (q.pairId && q.sectionId?.includes('/')) return q

    const pairId = q.pairId || inferPairIdFromLanguage(q.language)
    if (!pairId || !q.sectionId) return q

    const parsed = parseSectionId(q.sectionId)
    const unitSection = parsed.unitSection || q.sectionId
    const sectionId = parsed.pairId
      ? q.sectionId
      : scopedSectionIdFromUnitSection(pairId, unitSection)

    const needsUpdate = q.pairId !== pairId || q.sectionId !== sectionId
    if (!needsUpdate) return q

    changed++
    return { ...q, pairId, sectionId }
  })

  return { questions: migrated, changed }
}

function scopedSectionIdFromUnitSection(pairId, unitSection) {
  const dash = unitSection.indexOf('-')
  if (dash === -1) return buildSectionId(pairId, unitSection, '')
  return buildSectionId(pairId, unitSection.slice(0, dash), unitSection.slice(dash + 1))
}