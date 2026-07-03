import {
  getArticles,
  getArticlesReadingStatus,
  getDailyGoalProgress,
  getPathCurriculum,
  getUnknownWords,
} from "@/shared/api.js";
import { loadLearningContext } from "@/shared/learningContext.js";
import { peekPendingAiPractice } from "@/modules/ai-chat/pendingAiPractice.js";
import { findCurrentSection, canResumeSection } from "@/modules/learn/pathResume.js";
import { VOCAB_REVIEW_LIMIT } from "@/modules/learn/vocabReviewCard.js";
import { loadDueMistakes } from "@/modules/path/mistakeReviewStore.js";
import { pairStatsKey } from "@/modules/learn/questionTypeStats.js";
import { findContinueReadingCandidate } from "@/modules/news/readingProgress.js";
import {
  buildStatusMap,
  countRetakeablePendingComprehension,
  countUnreadArticles,
  findPendingComprehensionCandidate,
} from "@/modules/news/newsReadingStatus.js";
import { peekPendingReadingVocab } from "@/modules/news/pendingReadingVocab.js";

const CACHE_MS = 30_000;
const FORCE_REFRESH_FROM = new Set([
  "reader",
  "path-lesson",
  "path-teaching",
  "path-mistake-review",
  "vocab-review",
  "focus-practice",
  "chat-session",
]);

let cachedCtx = null;
let cachedAt = 0;

function regionForLang(lang) {
  switch (lang) {
    case "zh":
      return "CN";
    case "en":
      return "US";
    case "es":
      return "ES";
    default:
      return "CN";
  }
}

export function invalidateNavAttentionCache() {
  cachedCtx = null;
  cachedAt = 0;
}

export function shouldForceNavAttentionRefresh(previousRouteName) {
  return Boolean(previousRouteName && FORCE_REFRESH_FROM.has(previousRouteName));
}

/**
 * @param {object} [options]
 * @param {import('@/stores/targetLang.js').useTargetLangStore} [options.targetLangStore]
 * @param {{ force?: boolean }} [loadOptions]
 */
export async function loadNavAttentionContext(options = {}, { force = false } = {}) {
  const now = Date.now();
  if (!force && cachedCtx && now - cachedAt < CACHE_MS) {
    return cachedCtx;
  }

  const { user, targetLang, nativeLang, cefr } = await loadLearningContext(options);
  const userId = user?.id;

  let dailyGoal = null;
  let resumeTarget = null;
  let dueMistakes = 0;
  let dueVocabCount = 0;
  let newsUnreadCount = 0;
  let continueReadingArticle = null;
  let pendingComprehensionCount = 0;
  let pendingComprehensionArticle = null;

  try {
    if (userId) {
      dailyGoal = await getDailyGoalProgress(userId, targetLang);
    }
  } catch {
    dailyGoal = null;
  }

  try {
    const curriculum = await getPathCurriculum(nativeLang, targetLang, cefr);
    const hit = findCurrentSection(curriculum);
    resumeTarget = hit && canResumeSection(hit.section) ? hit : null;
  } catch {
    resumeTarget = null;
  }

  try {
    dueMistakes = loadDueMistakes(pairStatsKey(nativeLang, targetLang)).length;
  } catch {
    dueMistakes = 0;
  }

  try {
    if (userId) {
      const words = await getUnknownWords(userId, cefr, VOCAB_REVIEW_LIMIT, targetLang);
      dueVocabCount = Array.isArray(words) ? words.length : 0;
    }
  } catch {
    dueVocabCount = 0;
  }

  try {
    if (userId) {
      const articles = await getArticles(regionForLang(targetLang));
      if (articles.length) {
        const ids = articles.map((article) => article.id).filter((id) => id != null);
        const rows = await getArticlesReadingStatus(userId, ids);
        const statusMap = buildStatusMap(rows);
        newsUnreadCount = countUnreadArticles(statusMap, articles);
        continueReadingArticle = findContinueReadingCandidate(articles, statusMap);
        pendingComprehensionCount = countRetakeablePendingComprehension(statusMap, articles);
        pendingComprehensionArticle = findPendingComprehensionCandidate(articles, statusMap);
      }
    }
  } catch {
    newsUnreadCount = 0;
    continueReadingArticle = null;
    pendingComprehensionCount = 0;
    pendingComprehensionArticle = null;
  }

  const ctx = {
    dailyGoal,
    resumeTarget,
    dueMistakes,
    dueVocabCount,
    newsUnreadCount,
    continueReadingArticle,
    pendingComprehensionCount,
    pendingComprehensionArticle,
    pendingVocab: peekPendingReadingVocab(),
    pendingAiPractice: peekPendingAiPractice(),
    localHour: new Date().getHours(),
  };

  cachedCtx = ctx;
  cachedAt = now;
  return ctx;
}

/** Build attention context from learn-hub state without extra API calls. */
export function buildNavAttentionContextFromHub({
  dailyGoal = null,
  resumeTarget = null,
  dueMistakeEntries = [],
  dueVocabWords = [],
  newsUnreadCount = 0,
  continueReadingArticle = null,
  pendingComprehensionCount = 0,
  pendingComprehensionArticle = null,
  pendingVocabBanner = null,
  localHour = new Date().getHours(),
} = {}) {
  return {
    dailyGoal,
    resumeTarget,
    dueMistakes: dueMistakeEntries?.length ?? 0,
    dueVocabCount: dueVocabWords?.length ?? 0,
    newsUnreadCount,
    continueReadingArticle,
    pendingComprehensionCount,
    pendingComprehensionArticle,
    pendingVocab: pendingVocabBanner,
    pendingAiPractice: peekPendingAiPractice(),
    localHour,
  };
}