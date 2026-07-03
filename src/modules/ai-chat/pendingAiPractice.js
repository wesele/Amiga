import { readLocalJson, writeLocalJson } from "@/shared/localJsonStore.js";
import { formatLearnedWordsPreview } from "./aiPracticeSession.js";

export const PENDING_PRACTICE_KEY = "amiga:pending-ai-practice";
export const PENDING_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000;

export const PENDING_SOURCES = {
  READING: "reading",
  VOCAB: "vocab",
  TEACHING: "teaching",
  MISTAKE: "mistake",
  COMPREHENSION: "comprehension",
};

/**
 * @typedef {object} PendingAiPractice
 * @property {string} source
 * @property {string[]} [words]
 * @property {import("@/modules/news/comprehensionAiPractice.js").ComprehensionPracticeContext} [practiceContext]
 * @property {number} at
 * @property {string} [articleTitle]
 */

function mergeWords(existing, incoming) {
  const merged = [];
  const seen = new Set();
  for (const word of [...(existing ?? []), ...(incoming ?? [])]) {
    const trimmed = String(word ?? "").trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(trimmed);
  }
  return merged;
}

function isAiPracticeStep(step) {
  return (
    step?.id === "aiPractice"
    || step?.contactAction === "aiPractice"
    || step?.id === "comprehensionAiPractice"
    || step?.contactAction === "comprehensionAiPractice"
  );
}

/** Whether a post-session plan includes an AI practice step. */
export function planHasAiPracticeStep(plan) {
  if (!plan) return false;
  if (isAiPracticeStep(plan.primary)) return true;
  return (plan.secondary ?? []).some(isAiPracticeStep);
}

/** @param {PendingAiPractice | null} pending */
export function shouldShowPendingPracticeHero(pending) {
  if (pending?.source === PENDING_SOURCES.COMPREHENSION) {
    return Boolean(pending.practiceContext?.items?.length);
  }
  return Array.isArray(pending?.words) && pending.words.length >= 3;
}

export function formatPendingPracticePreview(words, limit = 3) {
  return formatLearnedWordsPreview(words, limit);
}

function readRawPending() {
  const pending = readLocalJson(PENDING_PRACTICE_KEY, null);
  if (!pending || typeof pending !== "object") return null;
  if (pending.source === PENDING_SOURCES.COMPREHENSION) {
    return pending.practiceContext?.items?.length ? pending : null;
  }
  if (!Array.isArray(pending.words) || !pending.words.length) return null;
  return pending;
}

/** Write or update pending practice. Same source merges words and refreshes timestamp. */
export function savePendingAiPractice(payload, { now = Date.now() } = {}) {
  const source = payload?.source;
  if (!source) return;

  if (source === PENDING_SOURCES.COMPREHENSION) {
    const practiceContext = payload?.practiceContext;
    if (!practiceContext?.items?.length) return;
    writeLocalJson(PENDING_PRACTICE_KEY, {
      source,
      practiceContext,
      at: now,
      articleTitle: practiceContext.articleTitle ?? payload.articleTitle ?? "",
    });
    return;
  }

  const incoming = mergeWords([], payload?.words);
  if (!incoming.length) return;

  const existing = readRawPending();
  const validExisting =
    existing?.at && now - existing.at <= PENDING_EXPIRY_MS ? existing : null;

  let next;
  if (validExisting?.source === source) {
    const merged = mergeWords(validExisting.words, incoming);
    if (merged.length < 3) return;
    next = {
      source,
      words: merged,
      at: now,
      articleTitle: payload.articleTitle ?? validExisting.articleTitle,
    };
  } else {
    if (incoming.length < 3) return;
    next = {
      source,
      words: incoming,
      at: now,
      ...(payload.articleTitle ? { articleTitle: payload.articleTitle } : {}),
    };
  }
  writeLocalJson(PENDING_PRACTICE_KEY, next);
}

/** Read current pending practice; clears if older than 7 days. */
export function peekPendingAiPractice({ now = Date.now() } = {}) {
  const pending = readRawPending();
  if (!pending) return null;
  if (pending.at && now - pending.at > PENDING_EXPIRY_MS) {
    clearPendingAiPractice();
    return null;
  }
  return pending;
}

export function clearPendingAiPractice() {
  try {
    if (typeof localStorage !== "undefined") {
      localStorage.removeItem(PENDING_PRACTICE_KEY);
    }
  } catch {
    /* ignore quota / privacy mode */
  }
}