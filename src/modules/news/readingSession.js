const SESSION_KEY = "amiga:news-reading-summary";
const PROGRESS_TOAST_KEY = "amiga:news-reading-progress-toast";

function readSession() {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function writeSession(payload) {
  try {
    if (payload) {
      sessionStorage.setItem(SESSION_KEY, JSON.stringify(payload));
    } else {
      sessionStorage.removeItem(SESSION_KEY);
    }
  } catch {
    /* sessionStorage unavailable */
  }
}

function normalizeWords(words) {
  if (!Array.isArray(words)) return [];
  const byWord = new Map();
  for (const entry of words) {
    if (!entry?.word) continue;
    const key = String(entry.word).toLowerCase();
    byWord.set(key, {
      word: String(entry.word),
      context: String(entry.context || ""),
      ...(entry.articleId != null ? { articleId: entry.articleId } : {}),
    });
  }
  return Array.from(byWord.values());
}

export function saveReadingSessionSummary({ unknownCount = 0, words = [] } = {}) {
  const normalized = normalizeWords(words);
  const count = unknownCount > 0 ? unknownCount : normalized.length;
  if (!count || count <= 0) return;
  writeSession({
    unknownCount: count,
    words: normalized,
    at: Date.now(),
    bannerConsumed: false,
  });
}

export function peekReadingSessionSummary() {
  const session = readSession();
  if (!session?.unknownCount || session.bannerConsumed) return null;
  return { unknownCount: session.unknownCount, at: session.at };
}

/** Read and mark the one-time session banner payload; words remain for review. */
export function consumeReadingSessionSummary() {
  const session = readSession();
  if (!session?.unknownCount || session.bannerConsumed) return null;
  writeSession({ ...session, bannerConsumed: true });
  return { unknownCount: session.unknownCount, at: session.at };
}

export function peekReadingSessionWords() {
  const session = readSession();
  if (!session?.words?.length) return [];
  return session.words;
}

/** Clear the stored reading session after review starts. */
export function consumeReadingSessionWords() {
  const session = readSession();
  if (!session?.words?.length) return [];
  const words = session.words;
  writeSession(null);
  return words;
}

/** Store a one-time progress-saved toast for the news list. */
export function saveReadingProgressToast(scrollPct) {
  const pct = Math.max(0, Math.min(100, Math.round(scrollPct)));
  if (pct <= 0) return;
  try {
    sessionStorage.setItem(PROGRESS_TOAST_KEY, JSON.stringify({ scrollPct: pct, at: Date.now() }));
  } catch {
    /* sessionStorage unavailable */
  }
}

/** Read and clear the progress-saved toast payload. */
export function consumeReadingProgressToast() {
  try {
    const raw = sessionStorage.getItem(PROGRESS_TOAST_KEY);
    sessionStorage.removeItem(PROGRESS_TOAST_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed?.scrollPct == null) return null;
    return { scrollPct: parsed.scrollPct };
  } catch {
    return null;
  }
}

/**
 * Merge session-marked words ahead of the regular due queue.
 * Session order is preserved; due words fill remaining slots without duplicates.
 */
export function buildReadingReviewQueue(sessionWords, dueWords, limit) {
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
    if (match) {
      queue.push(match);
      seen.add(key);
    }
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