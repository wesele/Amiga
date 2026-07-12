export function missingQuestionCount(existingCount, targetCount) {
  const existing = Math.max(0, Math.floor(Number(existingCount) || 0))
  const target = Math.max(1, Math.floor(Number(targetCount) || 1))
  return Math.max(0, target - existing)
}
