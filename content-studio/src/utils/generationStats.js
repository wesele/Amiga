import { questionMatchesSection } from './sectionId.js'

export function calculateGenerationStats({ pairId, cefr, units, questions, questionsPerSection }) {
  const levelQuestions = (Array.isArray(questions) ? questions : [])
    .filter(question => question?.pairId === pairId && question?.cefr === cefr)
  const target = Math.max(1, Math.round(Number(questionsPerSection) || 1))
  let generatedQuestions = 0
  let totalQuestions = 0

  for (const unit of (Array.isArray(units) ? units : [])) {
    for (const section of (unit?.sections || [])) {
      const sectionCount = levelQuestions.filter(question =>
        questionMatchesSection(question, pairId, unit.id, section.id)
      ).length
      generatedQuestions += sectionCount
      totalQuestions += Math.max(target, sectionCount)
    }
  }

  let generatedImages = 0
  let totalImages = 0
  for (const question of levelQuestions) {
    const targets = question.type === 'T01'
      ? [question]
      : question.type === 'T02' && Array.isArray(question.imageOptions)
        ? question.imageOptions
        : []
    totalImages += targets.length
    generatedImages += targets.filter(targetItem => targetItem?.imageUrl || targetItem?.imageSvg).length
  }

  return { generatedQuestions, totalQuestions, generatedImages, totalImages }
}
