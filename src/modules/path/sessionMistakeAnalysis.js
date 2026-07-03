const GRAMMAR_TYPES = new Set(["T05", "T08"]);
const VOCAB_TYPES = new Set(["T01", "T02", "T09", "T10"]);
const LISTENING_TYPES = new Set(["T07", "T11"]);

/**
 * Aggregate mistake counts by question type for failed-lesson recovery routing.
 */
export function analyzeSessionMistakeTypes(mistakes = []) {
  const typeCounts = {};
  let grammarCount = 0;
  let vocabCount = 0;
  let listeningCount = 0;

  for (const item of mistakes) {
    const type = item?.question?.type;
    if (!type) continue;
    typeCounts[type] = (typeCounts[type] ?? 0) + 1;
    if (GRAMMAR_TYPES.has(type)) grammarCount += 1;
    else if (VOCAB_TYPES.has(type)) vocabCount += 1;
    else if (LISTENING_TYPES.has(type)) listeningCount += 1;
  }

  let dominantType = null;
  let maxCount = 0;
  for (const [type, count] of Object.entries(typeCounts)) {
    if (count > maxCount) {
      maxCount = count;
      dominantType = type;
    }
  }

  return { dominantType, grammarCount, vocabCount, listeningCount, typeCounts };
}