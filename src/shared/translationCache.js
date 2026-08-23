/**
 * 鲁棒的全局单词/短语翻译缓存
 * - 内存 Map + localStorage 持久化（跨刷新、跨会话复用，解决单词学习浏览界面不能重用问题）
 * - 按 mode|source|native|normalizedWord 作为 key，天然隔离语言对
 * - TTL 默认 30 天，过期自动失效
 * - LRU 淘汰，最大 800 条（约 300KB~1MB）
 * - 并发去重：同一 key 的并发请求共享同一 Promise
 */

const STORAGE_KEY = "amiga.translationCache.v1";
const MAX_ENTRIES = 800;
const TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

const cache = new Map(); // key -> { value, ts }
const pending = new Map(); // key -> Promise

function normalizeWord(word) {
  return String(word || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

/**
 * @param {"word"|"text"} mode
 */
export function buildTranslationCacheKey(mode, word, sourceLang, nativeLang) {
  const m = mode === "text" ? "text" : "word";
  const src = String(sourceLang || "").trim().toLowerCase();
  const native = String(nativeLang || "").trim().toLowerCase();
  return `${m}|${src}|${native}|${normalizeWord(word)}`;
}

function isExpired(entry) {
  if (!entry || typeof entry.ts !== "number") return true;
  return Date.now() - entry.ts > TTL_MS;
}

function loadFromStorage() {
  try {
    if (typeof localStorage === "undefined") return;
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return;
    const entries = Array.isArray(parsed.entries) ? parsed.entries : Object.entries(parsed);
    for (const [k, v] of entries) {
      if (!k || !v || typeof v !== "object") continue;
      if (isExpired(v)) continue;
      cache.set(k, v);
      if (cache.size >= MAX_ENTRIES) break;
    }
    // LRU: keep insertion order; if overflow, trim oldest
    pruneIfNeeded();
  } catch (_) {
    // ignore corrupt storage
  }
}

function persistToStorage() {
  try {
    if (typeof localStorage === "undefined") return;
    // only persist valid non-expired entries, keep insertion order (LRU tail = recent)
    const entries = [];
    for (const [k, v] of cache) {
      if (isExpired(v)) continue;
      entries.push([k, v]);
    }
    // keep last MAX_ENTRIES
    const toSave = entries.slice(-MAX_ENTRIES);
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ entries: toSave }));
  } catch (_) {
    // quota exceeded or disabled -> ignore
  }
}

function pruneIfNeeded() {
  while (cache.size > MAX_ENTRIES) {
    const firstKey = cache.keys().next().value;
    if (firstKey === undefined) break;
    cache.delete(firstKey);
  }
}

function touchLru(key, entry) {
  // move to end (most recent)
  cache.delete(key);
  cache.set(key, entry);
}

// init load (safe for SSR/test where localStorage absent)
loadFromStorage();

export function getCachedTranslation(key) {
  if (!key || !cache.has(key)) return undefined;
  const entry = cache.get(key);
  if (isExpired(entry)) {
    cache.delete(key);
    persistToStorage();
    return undefined;
  }
  // LRU touch
  touchLru(key, entry);
  // persist order change is cheap; debounce via microtask to avoid sync IO on every get
  // but for robustness we persist synchronously only when size matters; here just return
  return entry.value;
}

export function setCachedTranslation(key, value) {
  if (!key) return;
  const entry = { value, ts: Date.now() };
  cache.set(key, entry);
  pruneIfNeeded();
  // move to most recent is inherent via set after delete above; here new entry already last
  persistToStorage();
}

/** Clear one entry (e.g. before forced refresh). */
export function invalidateTranslationCache(key) {
  if (!key) return;
  cache.delete(key);
  pending.delete(key);
  persistToStorage();
}

/** Test helper / full reset. */
export function clearTranslationCache() {
  cache.clear();
  pending.clear();
  try {
    if (typeof localStorage !== "undefined") localStorage.removeItem(STORAGE_KEY);
  } catch (_) {}
}

/** For testing: allow restoring from storage and inspecting size */
export function _getCacheSize() {
  return cache.size;
}

export function _isPending(key) {
  return pending.has(key);
}

/**
 * 通用去重 + 缓存包装：若缓存命中直接返回，否则调用 fetcher 并缓存结果。
 * 并发请求同一 key 时共享同一个 Promise，避免重复触发 LLM。
 * @param {string} key
 * @param {() => Promise<any>} fetcher
 * @returns {Promise<any>}
 */
export async function fetchWithCache(key, fetcher) {
  if (!key) return fetcher();
  const cached = getCachedTranslation(key);
  if (cached !== undefined) return cached;
  if (pending.has(key)) return pending.get(key);
  const p = (async () => {
    try {
      const result = await fetcher();
      setCachedTranslation(key, result);
      return result;
    } finally {
      pending.delete(key);
    }
  })();
  pending.set(key, p);
  return p;
}

/**
 * 便捷：缓存的单词翻译（mode=word）
 * 保存形态为 { mode:'word', value: TranslationResult }，与 WordPopup 历史形态一致
 */
export function cachedTranslateWord(word, sourceLang, nativeLang, fetcher) {
  const key = buildTranslationCacheKey("word", word, sourceLang, nativeLang);
  return fetchWithCache(key, async () => {
    const value = await fetcher();
    return { mode: "word", value };
  }).then((wrapped) => {
    // fetchWithCache stores wrapped {mode,value}; unwrap for caller if needed?
    // To keep compatibility, store and return wrapped, caller unwraps .value
    // But cachedTranslateWord returns the inner TranslationResult for convenience
    if (wrapped && wrapped.mode === "word") return wrapped.value;
    return wrapped;
  });
}

/**
 * 便捷：缓存的文本翻译（mode=text）
 * 保存形态为 { mode:'text', value: string }
 */
export function cachedTranslateText(text, sourceLang, nativeLang, fetcher) {
  const key = buildTranslationCacheKey("text", text, sourceLang, nativeLang);
  return fetchWithCache(key, async () => {
    const value = await fetcher();
    return { mode: "text", value };
  }).then((wrapped) => {
    if (wrapped && wrapped.mode === "text") return wrapped.value;
    return wrapped;
  });
}
