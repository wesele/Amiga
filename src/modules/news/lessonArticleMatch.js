import { extractWordTexts } from "./articleText.js";
import { wordKey } from "./wordMastery.js";
import { readingCardPhase } from "./readingProgress.js";

/** Normalize a lesson word for intersection lookup. */
export function normalizeLessonWord(word) {
  return wordKey(String(word ?? "").trim());
}

/** Count lesson-word overlap in article body text. */
export function countWordOverlap(bodyText, lessonWords) {
  const bodySet = new Set(extractWordTexts(bodyText));
  const matchedWords = [];
  const seen = new Set();

  for (const word of lessonWords || []) {
    const key = normalizeLessonWord(word);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    if (bodySet.has(key)) matchedWords.push(key);
  }

  return { count: matchedWords.length, matchedWords };
}

/** Score one article against lesson words. */
export function scoreArticleMatch(article, lessonWords) {
  const body = article.rewritten_body || article.original_body || "";
  const { count, matchedWords } = countWordOverlap(body, lessonWords);
  if (count < 1) return null;

  const score =
    count * 100 +
    (article.completed ? 0 : 50) +
    (article.read_today ? 0 : 20) -
    (article.hot_rank ?? 99);

  return {
    articleId: article.id,
    articleTitle: article.original_title || "",
    matchedWords,
    matchCount: count,
    score,
  };
}

/**
 * Pick the best article for lesson-word context.
 * @returns {{ articleId: number, articleTitle: string, matchedWords: string[], matchCount: number } | null}
 */
export function pickBestArticleForLessonWords(
  articles,
  lessonWords,
  { minOverlap = 1, excludeArticleId = null } = {},
) {
  if (!articles?.length || !lessonWords?.length) return null;

  const excludedId =
    excludeArticleId != null && Number.isFinite(Number(excludeArticleId))
      ? Number(excludeArticleId)
      : null;

  let best = null;
  for (const article of articles) {
    if (excludedId != null && article.id === excludedId) continue;
    const candidate = scoreArticleMatch(article, lessonWords);
    if (!candidate || candidate.matchCount < minOverlap) continue;
    if (!best || candidate.score > best.score) {
      best = candidate;
    }
  }

  if (!best) return null;
  return {
    articleId: best.articleId,
    articleTitle: best.articleTitle,
    matchedWords: best.matchedWords,
    matchCount: best.matchCount,
  };
}

/** Build a reader deep-link with lesson-word query params. */
export function lessonArticleReaderRoute(articleId, matchedWords) {
  const words = (matchedWords || []).filter(Boolean).join(",");
  return {
    name: "reader",
    params: { id: String(articleId) },
    query: words ? { lessonWords: words } : {},
  };
}

/** Merge article list rows with reading status for match scoring. */
export function mergeArticlesWithStatus(articles, statusMap) {
  return (articles || []).map((article) => {
    const status = statusMap?.get?.(article.id);
    const phase = readingCardPhase(status);
    return {
      id: article.id,
      rewritten_body: article.rewritten_body,
      original_body: article.original_body,
      original_title: article.original_title,
      hot_rank: article.hot_rank,
      completed: phase === "completed",
      read_today: Boolean(status?.read_today),
    };
  });
}