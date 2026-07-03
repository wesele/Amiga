import { readingCardPhase } from "./readingProgress.js";
import { comprehensionNeedsRetake } from "./readingComprehension.js";

/** Parse words_unknown JSON into deduped { word, context } entries (backward compatible). */
export function parseUnknownWordEntries(json) {
  if (!json) return [];
  try {
    const parsed = JSON.parse(json);
    if (!Array.isArray(parsed)) return [];
    const byWord = new Map();
    for (const item of parsed) {
      if (typeof item === "string") {
        const word = item.trim();
        if (!word) continue;
        byWord.set(word.toLowerCase(), { word, context: "" });
        continue;
      }
      if (item && typeof item === "object" && item.word) {
        const word = String(item.word).trim();
        if (!word) continue;
        byWord.set(word.toLowerCase(), {
          word,
          context: String(item.context || "").trim(),
        });
      }
    }
    return Array.from(byWord.values());
  } catch {
    return [];
  }
}

/** Parse words_unknown JSON from news_reading_log into a deduped word list. */
export function parseUnknownWords(json) {
  return parseUnknownWordEntries(json).map((entry) => entry.word);
}

/** Serialize session word entries for news_reading_log.words_unknown storage. */
export function serializeUnknownWordEntries(entries) {
  const byWord = new Map();
  for (const entry of entries || []) {
    if (!entry?.word) continue;
    const word = String(entry.word).trim();
    if (!word) continue;
    byWord.set(word.toLowerCase(), {
      word,
      context: String(entry.context || "").trim(),
    });
  }
  return JSON.stringify(Array.from(byWord.values()));
}

const COMPREHENSION_QUIZ_TOTAL = 2;

/** Derive list-card comprehension badge from latest reading status. */
export function comprehensionBadge(status) {
  if (!status?.completed) return null;
  if (status.comprehension_skipped) {
    return { key: "cardComprehensionPending", params: {} };
  }
  if (status.comprehension_score == null) return null;
  if (status.comprehension_score >= COMPREHENSION_QUIZ_TOTAL) {
    return { key: "cardComprehensionPerfect", params: {} };
  }
  return {
    key: "cardComprehensionPartial",
    params: { n: status.comprehension_score, total: COMPREHENSION_QUIZ_TOTAL },
  };
}

/** i18n key for the list-card comprehension retake chip. */
export function comprehensionRetakeChipKey(status, total = COMPREHENSION_QUIZ_TOTAL) {
  if (!comprehensionNeedsRetake(status, total)) return null;
  if (status.comprehension_skipped) return "cardComprehensionRetake";
  return "comprehensionRetakeAgain";
}

/** Count completed articles that still need a comprehension retake. */
export function countPendingComprehension(statusMap, articles, total = COMPREHENSION_QUIZ_TOTAL) {
  let pending = 0;
  for (const article of articles || []) {
    const status = statusMap.get(article.id);
    if (comprehensionNeedsRetake(status, total)) pending += 1;
  }
  return pending;
}

/** Build a Map<articleId, statusRow> from API rows. */
export function buildStatusMap(rows) {
  const map = new Map();
  for (const row of rows || []) {
    if (row?.article_id != null) {
      map.set(row.article_id, row);
    }
  }
  return map;
}

/**
 * Derive card-level reading state for one article.
 * @param {object} article
 * @param {object|undefined} status
 * @param {{ dueWordKeys?: Set<string> }} [options]
 */
export function articleCardState(article, status, options = {}) {
  void article;
  const { dueWordKeys } = options;
  const phase = readingCardPhase(status);

  if (phase === "unread") {
    return {
      isUnread: true,
      isInProgress: false,
      readBadge: null,
      progressLine: null,
      unknownLine: null,
      comprehensionBadge: null,
      showContinueChip: false,
      showReviewChip: false,
      showComprehensionRetakeChip: false,
      comprehensionRetakeChipKey: null,
      cardClass: "is-unread",
    };
  }

  if (phase === "in_progress") {
    const pct = status.scroll_pct ?? 0;
    return {
      isUnread: false,
      isInProgress: true,
      readBadge: null,
      progressLine: { key: "cardInProgress", pct },
      unknownLine: null,
      comprehensionBadge: null,
      showContinueChip: true,
      showReviewChip: false,
      showComprehensionRetakeChip: false,
      comprehensionRetakeChipKey: null,
      cardClass: "is-in-progress",
    };
  }

  const unknownCount = status.unknown_count || 0;
  const unknownWords = parseUnknownWords(status.words_unknown);
  let showReviewChip = false;
  if (unknownCount > 0) {
    if (dueWordKeys instanceof Set) {
      showReviewChip = unknownWords.some((word) => dueWordKeys.has(word.toLowerCase()));
    } else {
      showReviewChip = true;
    }
  }

  return {
    isUnread: false,
    isInProgress: false,
    readBadge: status.read_today ? "cardReadToday" : "cardRead",
    progressLine: null,
    unknownLine:
      unknownCount > 0 ? { key: "cardUnknownWords", n: unknownCount } : null,
    comprehensionBadge: comprehensionBadge(status),
    showContinueChip: false,
    showReviewChip,
    showComprehensionRetakeChip: comprehensionNeedsRetake(status),
    comprehensionRetakeChipKey: comprehensionRetakeChipKey(status),
    cardClass: "is-read",
  };
}

/** Aggregate list progress for the optional top summary line. */
export function aggregateListSummary(statusMap, articles) {
  let readToday = 0;
  let unread = 0;
  let inProgress = 0;
  const total = articles?.length || 0;
  for (const article of articles || []) {
    const status = statusMap.get(article.id);
    const phase = readingCardPhase(status);
    if (phase === "unread") {
      unread += 1;
    } else if (phase === "in_progress") {
      inProgress += 1;
    } else if (status.read_today) {
      readToday += 1;
    }
  }
  const pendingComprehension = countPendingComprehension(statusMap, articles);
  return { readToday, unread, inProgress, total, pendingComprehension };
}

/** Collect all unknown words across status rows (deduped). */
export function collectUnknownWordsFromStatusMap(statusMap) {
  const seen = new Set();
  const words = [];
  for (const status of statusMap.values()) {
    for (const word of parseUnknownWords(status.words_unknown)) {
      const key = word.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      words.push(word);
    }
  }
  return words;
}

/** Words still due for review (mastery < 2). */
export function buildDueWordKeySet(masteryEntries) {
  const due = new Set();
  for (const entry of masteryEntries || []) {
    if (!entry?.word) continue;
    if (entry.mastery == null || entry.mastery < 2) {
      due.add(String(entry.word).toLowerCase());
    }
  }
  return due;
}

/** Build session word entries from an article log for vocab review. */
export function buildArticleReviewSessionWords(status, articleId) {
  if (!status?.words_unknown) return [];
  return parseUnknownWordEntries(status.words_unknown).map(({ word, context }) => ({
    word,
    context: context || "",
    articleId: Number(articleId),
  }));
}

/** Count unread articles from a status map. */
export function countUnreadArticles(statusMap, articles) {
  let unread = 0;
  for (const article of articles || []) {
    if (readingCardPhase(statusMap.get(article.id)) === "unread") unread += 1;
  }
  return unread;
}

/** Count unread articles excluding one article (e.g. the one just finished). */
export function countUnreadArticlesExcluding(statusMap, articles, excludeArticleId) {
  let unread = 0;
  for (const article of articles || []) {
    if (article.id === excludeArticleId) continue;
    if (readingCardPhase(statusMap.get(article.id)) === "unread") unread += 1;
  }
  return unread;
}

/**
 * Find the next unread article after the current one in list order.
 * Scans forward from the current index, then wraps to the start.
 */
export function findNextUnreadArticleId(articles, statusMap, currentArticleId) {
  const list = articles || [];
  const currentIdx = list.findIndex((article) => article.id === currentArticleId);
  const ordered =
    currentIdx >= 0
      ? [...list.slice(currentIdx + 1), ...list.slice(0, currentIdx)]
      : list;
  for (const article of ordered) {
    if (article.id === currentArticleId) continue;
    if (readingCardPhase(statusMap.get(article.id)) === "unread") return article.id;
  }
  return null;
}