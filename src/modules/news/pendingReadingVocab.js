import { readLocalJson, writeLocalJson } from "@/shared/localJsonStore.js";
import { saveReadingSessionSummary } from "./readingSession.js";

export const PENDING_READING_VOCAB_KEY = "amiga:pending-reading-vocab";
export const PENDING_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * @typedef {object} PendingReadingVocabEntry
 * @property {string} word
 * @property {string} context
 * @property {number} [articleId]
 */

/**
 * @typedef {object} PendingReadingVocab
 * @property {string[]} words
 * @property {PendingReadingVocabEntry[]} entries
 * @property {number} at
 * @property {string} [articleTitle]
 * @property {number} [articleId]
 */

function normalizeEntries(entries) {
  if (!Array.isArray(entries)) return [];
  const byWord = new Map();
  for (const entry of entries) {
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

function mergeEntries(existing, incoming) {
  return normalizeEntries([...(existing ?? []), ...(incoming ?? [])]);
}

function readRawPending() {
  const pending = readLocalJson(PENDING_READING_VOCAB_KEY, null);
  if (!pending || typeof pending !== "object") return null;
  const entries = normalizeEntries(pending.entries);
  if (!entries.length) return null;
  return { ...pending, entries, words: entries.map((entry) => entry.word) };
}

/** Write or merge pending reading vocab (localStorage, 7-day expiry). */
export function savePendingReadingVocab(payload, { now = Date.now() } = {}) {
  const incoming = normalizeEntries(payload?.entries);
  if (!incoming.length) return;

  const existing = readRawPending();
  const validExisting =
    existing?.at && now - existing.at <= PENDING_EXPIRY_MS ? existing : null;
  const merged = mergeEntries(validExisting?.entries, incoming);

  writeLocalJson(PENDING_READING_VOCAB_KEY, {
    words: merged.map((entry) => entry.word),
    entries: merged,
    at: now,
    articleTitle: payload?.articleTitle ?? validExisting?.articleTitle,
    articleId: payload?.articleId ?? validExisting?.articleId ?? merged[0]?.articleId,
  });
}

/** Read pending reading vocab; clears if older than 7 days. */
export function peekPendingReadingVocab({ now = Date.now() } = {}) {
  const pending = readRawPending();
  if (!pending) return null;
  if (pending.at && now - pending.at > PENDING_EXPIRY_MS) {
    clearPendingReadingVocab();
    return null;
  }
  return pending;
}

export function clearPendingReadingVocab() {
  try {
    if (typeof localStorage !== "undefined") {
      localStorage.removeItem(PENDING_READING_VOCAB_KEY);
    }
  } catch {
    /* ignore quota / privacy mode */
  }
}

/** @param {PendingReadingVocab | null} pending */
export function shouldShowPendingVocabBanner(pending) {
  return (pending?.entries?.length ?? 0) > 0;
}

/** Seed sessionStorage so vocab-review can pick up pending words cross-session. */
export function seedReadingSessionFromPending(pending) {
  if (!pending?.entries?.length) return;
  saveReadingSessionSummary({
    unknownCount: pending.entries.length,
    words: pending.entries,
  });
}