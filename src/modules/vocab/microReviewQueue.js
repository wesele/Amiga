import { MICRO_REVIEW_LIMIT } from "@/shared/microReview.js";

/**
 * Merge session-marked words ahead of the regular due queue.
 * Session order is preserved; due words fill remaining slots without duplicates.
 */
export function buildSessionReviewQueue(sessionWords, dueWords, limit = MICRO_REVIEW_LIMIT) {
  const safeLimit = Math.max(1, limit || 1);
  const seen = new Set();
  const queue = [];
  const dueByWord = new Map();

  for (const entry of dueWords || []) {
    if (entry?.word) dueByWord.set(entry.word.toLowerCase(), entry);
  }

  for (const sessionWord of sessionWords || []) {
    const key = sessionWord?.word?.toLowerCase();
    if (!key || seen.has(key)) continue;
    const match = dueByWord.get(key);
    const context = String(sessionWord.context || "");
    if (match) {
      queue.push({
        ...match,
        ...(context ? { example: context } : {}),
      });
    } else {
      queue.push({
        word: sessionWord.word,
        example: context,
        mastery: 1,
        source: sessionWord.source || "session",
        id: sessionWord.id ?? null,
        ...(sessionWord.definition_zh ? { definition_zh: sessionWord.definition_zh } : {}),
        ...(sessionWord.definition_es ? { definition_es: sessionWord.definition_es } : {}),
        ...(sessionWord.articleId != null ? { articleId: sessionWord.articleId } : {}),
      });
    }
    seen.add(key);
  }

  for (const entry of dueWords || []) {
    if (queue.length >= safeLimit) break;
    const key = entry?.word?.toLowerCase();
    if (!key || seen.has(key)) continue;
    queue.push(entry);
    seen.add(key);
  }

  return queue.slice(0, safeLimit);
}

/** Build a micro-review queue from path vocab session marks and teaching word metadata. */
export function buildTeachingMicroReviewQueue(sessionWords, teachingWords, limit = MICRO_REVIEW_LIMIT) {
  const byWord = new Map(
    (teachingWords || []).map((w) => [String(w.word).toLowerCase(), w]),
  );
  const queue = [];
  for (const word of sessionWords || []) {
    if (queue.length >= limit) break;
    const key = String(word).toLowerCase();
    const match = byWord.get(key);
    queue.push({
      word,
      id: match?.id ?? null,
      mastery: match?.mastery ?? 1,
      ...(match?.definition_zh ? { definition_zh: match.definition_zh } : {}),
      ...(match?.definition_es ? { definition_es: match.definition_es } : {}),
      source: "path_vocab",
    });
  }
  return queue;
}