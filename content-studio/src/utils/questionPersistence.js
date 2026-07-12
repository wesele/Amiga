export function shouldPersistQuestionLevelClear(removedCount, hasRevision) {
  return removedCount > 0 || hasRevision
}
