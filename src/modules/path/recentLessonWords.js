import { wordKey } from "@/modules/news/wordMastery.js";
import {
  mergeArticlesWithStatus,
  pickBestArticleForLessonWords,
} from "@/modules/news/lessonArticleMatch.js";

export const RECENT_LESSON_WORDS_KEY = "amiga:recent-lesson-words";
export const RECENT_LESSON_WORDS_EXPIRY_MS = 24 * 60 * 60 * 1000;
export const RECENT_LESSON_FRESH_MS = 2 * 60 * 60 * 1000;
export const MIN_RECENT_LESSON_WORDS = 2;

function readRaw() {
  try {
    const raw = sessionStorage.getItem(RECENT_LESSON_WORDS_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function writeRaw(payload) {
  try {
    if (payload) {
      sessionStorage.setItem(RECENT_LESSON_WORDS_KEY, JSON.stringify(payload));
    } else {
      sessionStorage.removeItem(RECENT_LESSON_WORDS_KEY);
    }
  } catch {
    /* sessionStorage unavailable */
  }
}

function normalizeWords(words) {
  const seen = new Set();
  const normalized = [];
  for (const word of words || []) {
    const key = wordKey(String(word ?? "").trim());
    if (!key || seen.has(key)) continue;
    seen.add(key);
    normalized.push(key);
  }
  return normalized;
}

function isValidPayload(payload, { pairKey, now = Date.now() } = {}) {
  if (!payload || payload.consumed) return false;
  if (!payload.completedAt || now - payload.completedAt > RECENT_LESSON_WORDS_EXPIRY_MS) {
    return false;
  }
  if (pairKey && payload.pairKey && payload.pairKey !== pairKey) return false;
  return normalizeWords(payload.words).length >= MIN_RECENT_LESSON_WORDS;
}

/** Persist recent lesson vocabulary for learn-hub article matching. */
export function saveRecentLessonWords(
  {
    words = [],
    sectionId = null,
    sectionTitle = "",
    pairKey = "",
  } = {},
  { now = Date.now() } = {},
) {
  const normalized = normalizeWords(words);
  if (normalized.length < MIN_RECENT_LESSON_WORDS) return;

  writeRaw({
    words: normalized,
    sectionId: sectionId ?? undefined,
    sectionTitle: String(sectionTitle || ""),
    completedAt: now,
    pairKey: String(pairKey || ""),
    consumed: false,
  });
}

/** Read unconsumed recent lesson words; clears expired or mismatched payloads. */
export function peekRecentLessonWords({ pairKey, now = Date.now() } = {}) {
  const payload = readRaw();
  if (!payload) return null;
  if (!isValidPayload(payload, { pairKey, now })) {
    writeRaw(null);
    return null;
  }
  return {
    ...payload,
    words: normalizeWords(payload.words),
  };
}

export function dismissRecentLessonWords() {
  const payload = readRaw();
  if (!payload) return;
  writeRaw({ ...payload, consumed: true });
}

export function clearRecentLessonWords() {
  writeRaw(null);
}

export function isRecentLessonFresh(completedAt, { now = Date.now() } = {}) {
  if (!completedAt) return false;
  return now - completedAt < RECENT_LESSON_FRESH_MS;
}

/** Consume when the learner finishes the matched article via lesson-word reading. */
export function consumeRecentLessonWordsForArticle(
  articleId,
  { lessonWordsQuery = "", now = Date.now() } = {},
) {
  const payload = peekRecentLessonWords({ now });
  if (!payload) return false;

  const id = Number(articleId);
  if (!Number.isFinite(id)) return false;

  const queryWords = normalizeWords(
    String(lessonWordsQuery || "")
      .split(",")
      .map((word) => word.trim()),
  );
  if (!queryWords.length) return false;

  writeRaw({ ...payload, consumed: true });
  return true;
}

/**
 * Resolve the best article match for stored recent lesson words.
 * Clears the payload when no article matches.
 */
export function resolveLessonArticleMatch(
  articles,
  statusMap,
  { pairKey, now = Date.now() } = {},
) {
  const recent = peekRecentLessonWords({ pairKey, now });
  if (!recent) return null;

  const merged = mergeArticlesWithStatus(articles, statusMap);
  const match = pickBestArticleForLessonWords(merged, recent.words, { minOverlap: 1 });
  if (!match) {
    clearRecentLessonWords();
    return null;
  }

  const status = statusMap?.get?.(match.articleId);
  return {
    ...match,
    sectionTitle: recent.sectionTitle ?? "",
    completedAt: recent.completedAt,
    readToday: Boolean(status?.read_today),
    completed: Boolean(status?.completed),
  };
}