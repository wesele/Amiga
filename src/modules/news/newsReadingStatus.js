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
  if (!status?.read_at) {
    return {
      isUnread: true,
      readBadge: null,
      unknownLine: null,
      showReviewChip: false,
      cardClass: "is-unread",
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
    readBadge: status.read_today ? "cardReadToday" : "cardRead",
    unknownLine:
      unknownCount > 0 ? { key: "cardUnknownWords", n: unknownCount } : null,
    showReviewChip,
    cardClass: "is-read",
  };
}

/** Aggregate list progress for the optional top summary line. */
export function aggregateListSummary(statusMap, articles) {
  let readToday = 0;
  let unread = 0;
  const total = articles?.length || 0;
  for (const article of articles || []) {
    const status = statusMap.get(article.id);
    if (!status?.read_at) {
      unread += 1;
    } else if (status.read_today) {
      readToday += 1;
    }
  }
  return { readToday, unread, total };
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
    if (!statusMap.get(article.id)?.read_at) unread += 1;
  }
  return unread;
}

/** Count unread articles excluding one article (e.g. the one just finished). */
export function countUnreadArticlesExcluding(statusMap, articles, excludeArticleId) {
  let unread = 0;
  for (const article of articles || []) {
    if (article.id === excludeArticleId) continue;
    if (!statusMap.get(article.id)?.read_at) unread += 1;
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
    if (!statusMap.get(article.id)?.read_at) return article.id;
  }
  return null;
}