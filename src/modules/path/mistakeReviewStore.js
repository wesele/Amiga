import { readLocalJson, writeLocalJson } from "@/shared/localJsonStore.js";

export const MISTAKE_REVIEW_STORAGE_KEY = "mistake_review_queue_v1";
export const MISTAKE_REVIEW_SESSION_LIMIT = 5;
export const MAX_QUEUE_SIZE = 30;

/** Days until next review at each SRS level (level 0 = due now). */
export const REVIEW_INTERVAL_DAYS = [0, 1, 3, 7];

/** After this level a mistake is considered mastered and removed. */
export const MASTERED_LEVEL = REVIEW_INTERVAL_DAYS.length;

function daysToMs(days) {
  return days * 24 * 60 * 60 * 1000;
}

export function nextReviewAt(level, fromMs = Date.now()) {
  const days = REVIEW_INTERVAL_DAYS[Math.min(level, REVIEW_INTERVAL_DAYS.length - 1)] ?? 0;
  return fromMs + daysToMs(days);
}

export function isDue(entry, now = Date.now()) {
  return entry != null && (entry.next_review_at ?? 0) <= now;
}

/**
 * Record or refresh a mistake in the pair-scoped queue.
 * Stores a snapshot of the question JSON so review can re-render it offline.
 */
export function upsertMistake(queue, { question, userAnswer, pairKey, now = Date.now() }) {
  if (!question?.id || !pairKey) return queue ?? [];

  const items = Array.isArray(queue) ? [...queue] : [];
  const idx = items.findIndex((e) => e.question_id === question.id);

  const entry = {
    question_id: question.id,
    pair_key: pairKey,
    question,
    user_answer: userAnswer ?? null,
    wrong_at: now,
    level: 0,
    next_review_at: nextReviewAt(0, now),
  };

  if (idx >= 0) {
    items[idx] = { ...items[idx], ...entry };
  } else {
    items.unshift(entry);
  }

  const trimmed = items
    .filter((e) => e.pair_key === pairKey)
    .slice(0, MAX_QUEUE_SIZE)
    .concat(items.filter((e) => e.pair_key !== pairKey));

  return trimmed;
}

export function getDueMistakes(
  queue,
  pairKey,
  { now = Date.now(), limit = MISTAKE_REVIEW_SESSION_LIMIT } = {},
) {
  if (!pairKey || !Array.isArray(queue)) return [];

  return queue
    .filter((e) => e.pair_key === pairKey && isDue(e, now))
    .sort((a, b) => (a.wrong_at ?? 0) - (b.wrong_at ?? 0))
    .slice(0, limit);
}

export function countDueMistakes(queue, pairKey, now = Date.now()) {
  if (!pairKey || !Array.isArray(queue)) return 0;
  return queue.filter((e) => e.pair_key === pairKey && isDue(e, now)).length;
}

export function applyReviewResult(
  queue,
  questionId,
  isCorrect,
  now = Date.now(),
  userAnswer = undefined,
) {
  if (!questionId || !Array.isArray(queue)) return queue ?? [];

  return queue.flatMap((entry) => {
    if (entry.question_id !== questionId) return [entry];

    if (!isCorrect) {
      return [
        {
          ...entry,
          level: 0,
          wrong_at: now,
          next_review_at: nextReviewAt(0, now),
          ...(userAnswer !== undefined ? { user_answer: userAnswer } : {}),
        },
      ];
    }

    const nextLevel = (entry.level ?? 0) + 1;
    if (nextLevel >= MASTERED_LEVEL) return [];

    return [
      {
        ...entry,
        level: nextLevel,
        next_review_at: nextReviewAt(nextLevel, now),
      },
    ];
  });
}

export function loadMistakeQueue() {
  const data = readLocalJson(MISTAKE_REVIEW_STORAGE_KEY, {});
  return Array.isArray(data.items) ? data.items : [];
}

export function saveMistakeQueue(items) {
  writeLocalJson(MISTAKE_REVIEW_STORAGE_KEY, { items: items ?? [] });
}

export function recordLessonMistake(pairKey, question, userAnswer, now = Date.now()) {
  const queue = loadMistakeQueue();
  const next = upsertMistake(queue, { question, userAnswer, pairKey, now });
  saveMistakeQueue(next);
  return next;
}

export function loadDueMistakes(pairKey, options) {
  return getDueMistakes(loadMistakeQueue(), pairKey, options);
}

export function countDueForPair(pairKey, now = Date.now()) {
  return countDueMistakes(loadMistakeQueue(), pairKey, now);
}