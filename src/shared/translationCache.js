/**
 * In-memory cache for word/text LLM translations.
 * Keyed by mode + normalized word + language pair so the same surface form
 * is not re-translated until the user forces a refresh.
 */

const cache = new Map();

function normalizeWord(word) {
  return String(word || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

/**
 * @param {"word"|"text"} mode
 * @param {string} word
 * @param {string} sourceLang
 * @param {string} nativeLang
 */
export function buildTranslationCacheKey(mode, word, sourceLang, nativeLang) {
  const m = mode === "text" ? "text" : "word";
  const src = String(sourceLang || "").trim().toLowerCase();
  const native = String(nativeLang || "").trim().toLowerCase();
  return `${m}|${src}|${native}|${normalizeWord(word)}`;
}

export function getCachedTranslation(key) {
  if (!key || !cache.has(key)) return undefined;
  return cache.get(key);
}

export function setCachedTranslation(key, value) {
  if (!key) return;
  cache.set(key, value);
}

/** Clear one entry (e.g. before forced refresh). */
export function invalidateTranslationCache(key) {
  if (!key) return;
  cache.delete(key);
}

/** Test helper / full reset. */
export function clearTranslationCache() {
  cache.clear();
}
