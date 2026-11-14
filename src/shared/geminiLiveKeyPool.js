import { t } from "@/shared/i18n/index.js";

export const DEFAULT_GEMINI_LIVE_TPM_LIMIT = 65000;
export const GEMINI_LIVE_TPM_THRESHOLD_RATIO = 0.8;
export const GEMINI_LIVE_TPM_WINDOW_MS = 60_000;
export const GEMINI_LIVE_RATE_LIMIT_COOLDOWN_MS = 60_000;
export const GEMINI_LIVE_API_KEYS_SETTING = "multimodal_api_keys";

const STORAGE_KEY = "amiga_gemini_live_tpm_v1";

/**
 * In-memory rolling 60s token usage events per api_key:
 * Map<string, Array<{ ts: number, tokens: number }>>
 */
const _usageByKey = new Map();
/**
 * In-memory cooldown timestamps per api_key when 429 / quota error is returned.
 * Map<string, number>
 */
const _rateLimitedUntil = new Map();
/**
 * Key-specific configured TPM limits registered from configs so usage queries
 * know the limit even when only apiKey string is passed.
 * Map<string, number>
 */
const _limitsByKey = new Map();
const _listeners = new Set();

let _hydratedFromStorage = false;

function readStorage() {
  if (_hydratedFromStorage) return;
  _hydratedFromStorage = true;
  try {
    if (typeof localStorage === "undefined") return;
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    const now = Date.now();
    const cutoff = now - GEMINI_LIVE_TPM_WINDOW_MS;
    if (parsed?.usage && typeof parsed.usage === "object") {
      for (const [key, list] of Object.entries(parsed.usage)) {
        if (!Array.isArray(list)) continue;
        const fresh = list.filter(
          (item) =>
            item &&
            Number.isFinite(item.ts) &&
            item.ts > cutoff &&
            Number.isFinite(item.tokens) &&
            item.tokens > 0
        );
        if (fresh.length > 0) {
          _usageByKey.set(key, fresh);
        }
      }
    }
    if (parsed?.cooldowns && typeof parsed.cooldowns === "object") {
      for (const [key, until] of Object.entries(parsed.cooldowns)) {
        if (Number.isFinite(until) && until > now) {
          _rateLimitedUntil.set(key, until);
        }
      }
    }
  } catch {
    /* ignore storage unavailable / private mode */
  }
}

function writeStorage(now = Date.now()) {
  try {
    if (typeof localStorage === "undefined") return;
    const usage = {};
    for (const [key, list] of _usageByKey.entries()) {
      const fresh = pruneEvents(list, now);
      if (fresh.length > 0) {
        usage[key] = fresh;
      }
    }
    const cooldowns = {};
    for (const [key, until] of _rateLimitedUntil.entries()) {
      if (until > now) {
        cooldowns[key] = until;
      }
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ usage, cooldowns }));
  } catch {
    /* ignore storage unavailable / quota exceeded */
  }
}

function notifyListeners() {
  for (const fn of _listeners) {
    try {
      fn();
    } catch {
      /* ignore subscriber errors */
    }
  }
}

function pruneEvents(events, now) {
  if (!Array.isArray(events) || events.length === 0) return [];
  const cutoff = now - GEMINI_LIVE_TPM_WINDOW_MS;
  return events.filter(
    (item) => item && Number.isFinite(item.ts) && item.ts > cutoff && item.tokens > 0
  );
}

/**
 * Subscribe to TPM usage / cooldown changes. Returns an unsubscribe function.
 */
export function subscribeGeminiLiveTpm(fn) {
  if (typeof fn !== "function") return () => {};
  _listeners.add(fn);
  return () => _listeners.delete(fn);
}

/**
 * Reset in-memory and persisted TPM tracking state (primarily for tests).
 */
export function resetGeminiLiveTpmTracker() {
  _usageByKey.clear();
  _rateLimitedUntil.clear();
  _limitsByKey.clear();
  _hydratedFromStorage = true;
  try {
    if (typeof localStorage !== "undefined") {
      localStorage.removeItem(STORAGE_KEY);
    }
  } catch {
    /* ignore */
  }
  notifyListeners();
}

/**
 * Normalize an array (or JSON string) of key entries plus optional legacy fallback key.
 * Deduplicates by trimmed api_key and ensures valid tpm_limit (default 65000).
 *
 * @param {Array|string|null|undefined} entries
 * @param {string} [fallbackApiKey=""]
 * @returns {Array<{id: string, label: string, api_key: string, tpm_limit: number}>}
 */
export function normalizeGeminiLiveKeys(entries, fallbackApiKey = "") {
  let list = entries;
  if (typeof list === "string") {
    try {
      list = JSON.parse(list);
    } catch {
      list = [];
    }
  }

  const normalized = [];
  const seen = new Set();
  if (Array.isArray(list)) {
    for (let i = 0; i < list.length; i++) {
      const raw = list[i];
      if (!raw) continue;
      const apiKey = String(typeof raw === "string" ? raw : raw.api_key ?? raw.apiKey ?? "").trim();
      if (!apiKey || seen.has(apiKey)) continue;
      seen.add(apiKey);
      const rawLimit = Number(raw.tpm_limit ?? raw.tpmLimit);
      const tpmLimit =
        Number.isFinite(rawLimit) && rawLimit > 0
          ? Math.round(rawLimit)
          : DEFAULT_GEMINI_LIVE_TPM_LIMIT;
      const entry = {
        id: String(raw.id || `key-${normalized.length + 1}`).trim() || `key-${normalized.length + 1}`,
        label: String(raw.label || "").trim(),
        api_key: apiKey,
        tpm_limit: tpmLimit,
      };
      _limitsByKey.set(apiKey, tpmLimit);
      normalized.push(entry);
    }
  }

  const fallback = String(fallbackApiKey || "").trim();
  if (normalized.length === 0 && fallback) {
    const tpmLimit = _limitsByKey.get(fallback) || DEFAULT_GEMINI_LIVE_TPM_LIMIT;
    _limitsByKey.set(fallback, tpmLimit);
    normalized.push({
      id: "default",
      label: "",
      api_key: fallback,
      tpm_limit: tpmLimit,
    });
  }

  return normalized;
}

/**
 * Resolve normalized key pool from any multimodal / speaking / classroom config object.
 */
export function resolveGeminiLiveKeyPool(config) {
  if (!config || typeof config !== "object") return [];
  const active = config.mode ? (config.mode === "custom" ? config.custom : config.builtin) : config;
  const fallbackKey =
    active?.api_key ||
    active?.apiKey ||
    config.live_api_key ||
    config.api_key ||
    config.apiKey ||
    "";
  if (config.mode === "builtin") {
    return normalizeGeminiLiveKeys([], fallbackKey);
  }
  const poolSource =
    config.custom_api_keys ?? config.live_api_keys ?? config.api_keys ?? active?.api_keys ?? [];
  return normalizeGeminiLiveKeys(poolSource, fallbackKey);
}

/**
 * Extract token count from a BidiGenerateContentServerMessage or UsageMetadata object.
 */
export function extractGeminiLiveUsageTokens(messageOrUsage) {
  if (typeof messageOrUsage === "number") {
    return Number.isFinite(messageOrUsage) && messageOrUsage > 0
      ? Math.round(messageOrUsage)
      : 0;
  }
  const usage = messageOrUsage?.usageMetadata || messageOrUsage?.usage_metadata || messageOrUsage;
  if (!usage || typeof usage !== "object") return 0;

  const total = Number(usage.totalTokenCount ?? usage.total_token_count);
  if (Number.isFinite(total) && total > 0) {
    return Math.round(total);
  }

  const prompt = Number(usage.promptTokenCount ?? usage.prompt_token_count) || 0;
  const response =
    Number(
      usage.responseTokenCount ??
        usage.response_token_count ??
        usage.candidatesTokenCount ??
        usage.candidates_token_count
    ) || 0;
  const thoughts = Number(usage.thoughtsTokenCount ?? usage.thoughts_token_count) || 0;
  const toolPrompt =
    Number(usage.toolUsePromptTokenCount ?? usage.tool_use_prompt_token_count) || 0;
  const sum = prompt + response + thoughts + toolPrompt;
  return Number.isFinite(sum) && sum > 0 ? Math.round(sum) : 0;
}

/**
 * Detect whether an error message or payload indicates HTTP 429 / quota exhaustion.
 */
export function isGeminiLiveRateLimitError(errOrMessage) {
  const raw =
    typeof errOrMessage === "string"
      ? errOrMessage
      : errOrMessage?.message || errOrMessage?.status || "";
  const text = String(raw).toLowerCase();
  if (!text) return false;
  return (
    text.includes("429") ||
    text.includes("resource_exhausted") ||
    text.includes("resource has been exhausted") ||
    text.includes("resource exhausted") ||
    text.includes("quota") ||
    text.includes("rate limit") ||
    text.includes("too many requests")
  );
}

/**
 * Compute current 60s rolling TPM status for one key entry or raw api_key.
 */
export function getGeminiLiveKeyStatus(entryOrKey, now = Date.now()) {
  readStorage();
  const isObj = entryOrKey && typeof entryOrKey === "object";
  const apiKey = String(isObj ? entryOrKey.api_key || entryOrKey.apiKey || "" : entryOrKey || "").trim();
  const rawLimit = isObj ? Number(entryOrKey.tpm_limit ?? entryOrKey.tpmLimit) : NaN;
  const limit =
    Number.isFinite(rawLimit) && rawLimit > 0
      ? Math.round(rawLimit)
      : _limitsByKey.get(apiKey) || DEFAULT_GEMINI_LIVE_TPM_LIMIT;

  const events = apiKey ? pruneEvents(_usageByKey.get(apiKey), now) : [];
  if (apiKey) {
    if (events.length > 0) _usageByKey.set(apiKey, events);
    else _usageByKey.delete(apiKey);
  }

  let tpm = 0;
  for (const ev of events) {
    tpm += ev.tokens;
  }

  const thresholdTokens = limit * GEMINI_LIVE_TPM_THRESHOLD_RATIO;
  const ratio = limit > 0 ? tpm / limit : 0;

  const cooldownUntil = apiKey ? _rateLimitedUntil.get(apiKey) || 0 : 0;
  if (apiKey && cooldownUntil > 0 && cooldownUntil <= now) {
    _rateLimitedUntil.delete(apiKey);
  }
  const cooldownRemainingMs = cooldownUntil > now ? cooldownUntil - now : 0;
  const coolingDown = cooldownRemainingMs > 0;
  const overThreshold = tpm >= thresholdTokens;

  let waitMs = cooldownRemainingMs;
  if (overThreshold && events.length > 0) {
    const sorted = [...events].sort((a, b) => a.ts - b.ts);
    let remaining = tpm;
    for (const ev of sorted) {
      remaining -= ev.tokens;
      if (remaining < thresholdTokens) {
        waitMs = Math.max(waitMs, ev.ts + GEMINI_LIVE_TPM_WINDOW_MS - now);
        break;
      }
    }
    if (remaining >= thresholdTokens) {
      waitMs = Math.max(waitMs, sorted[sorted.length - 1].ts + GEMINI_LIVE_TPM_WINDOW_MS - now);
    }
  }

  return {
    api_key: apiKey,
    entry: isObj ? entryOrKey : { id: "", label: "", api_key: apiKey, tpm_limit: limit },
    tpm,
    limit,
    thresholdTokens,
    ratio,
    overThreshold,
    coolingDown,
    cooldownRemainingMs,
    waitMs: Math.max(0, Math.ceil(waitMs)),
  };
}

/**
 * Record token usage from a server message or numeric token count for the given apiKey.
 */
export function recordGeminiLiveUsage(apiKey, messageOrTokens, now = Date.now()) {
  readStorage();
  const key = String(apiKey || "").trim();
  const tokens = extractGeminiLiveUsageTokens(messageOrTokens);
  if (!key || tokens <= 0) {
    return getGeminiLiveKeyStatus(key, now);
  }
  const existing = pruneEvents(_usageByKey.get(key), now);
  existing.push({ ts: now, tokens });
  _usageByKey.set(key, existing);
  writeStorage(now);
  notifyListeners();
  return getGeminiLiveKeyStatus(key, now);
}

/**
 * Mark an API key as rate-limited (429) for cooldownMs (default 60s).
 */
export function markGeminiLiveKeyRateLimited(
  apiKey,
  cooldownMs = GEMINI_LIVE_RATE_LIMIT_COOLDOWN_MS,
  now = Date.now()
) {
  readStorage();
  const key = String(apiKey || "").trim();
  if (!key) return;
  _rateLimitedUntil.set(key, now + Math.max(1000, cooldownMs));
  writeStorage(now);
  notifyListeners();
}

/**
 * Select the best key for a new connection or rotation:
 * - Filters out keys whose 60s TPM >= 80% of their limit or that are cooling down.
 * - Picks the eligible key with the lowest current 60s TPM.
 * - Returns { key, entry, status, exhausted, waitMs }.
 */
export function selectGeminiLiveKey(entries, { excludeKey = null, now = Date.now() } = {}) {
  const pool = normalizeGeminiLiveKeys(entries);
  if (pool.length === 0) {
    return { key: null, entry: null, status: null, exhausted: false, waitMs: 0 };
  }

  const statuses = pool.map((entry) => getGeminiLiveKeyStatus(entry, now));
  const eligible = statuses.filter((s) => !s.overThreshold && !s.coolingDown);

  if (eligible.length === 0) {
    const positiveWaits = statuses.map((s) => s.waitMs).filter((w) => w > 0);
    const minWaitMs = positiveWaits.length > 0 ? Math.min(...positiveWaits) : 5000;
    return { key: null, entry: null, status: null, exhausted: true, waitMs: minWaitMs };
  }

  const exclude = String(excludeKey || "").trim();
  eligible.sort((a, b) => {
    if (a.tpm !== b.tpm) return a.tpm - b.tpm;
    if (exclude) {
      const aSame = a.api_key === exclude ? 1 : 0;
      const bSame = b.api_key === exclude ? 1 : 0;
      if (aSame !== bSame) return aSame - bSame;
    }
    return 0;
  });

  const best = eligible[0];
  return {
    key: best.api_key,
    entry: best.entry,
    status: best,
    exhausted: false,
    waitMs: 0,
  };
}

/**
 * Format a localized prompt telling the user all keys are >= 80% TPM and how long to wait.
 */
export function formatGeminiLiveQuotaWaitMessage(waitMs = 0) {
  const seconds = Math.max(1, Math.ceil((Number(waitMs) || 0) / 1000));
  return t("llm.geminiLiveQuotaWait", { seconds });
}
