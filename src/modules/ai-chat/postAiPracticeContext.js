import {
  getArticles,
  getArticlesReadingStatus,
  getDailyGoalProgress,
  getPathCurriculum,
  getUnknownWords,
} from "@/shared/api.js";
import { loadLearningContext } from "@/shared/learningContext.js";
import { findCurrentSection } from "@/modules/learn/pathResume.js";
import { VOCAB_REVIEW_LIMIT } from "@/modules/learn/vocabReviewCard.js";
import { loadDueMistakes } from "@/modules/path/mistakeReviewStore.js";
import { pairStatsKey } from "@/modules/learn/questionTypeStats.js";
import { findContinueReadingCandidate } from "@/modules/news/readingProgress.js";
import {
  buildStatusMap,
  countUnreadArticles,
  findNextUnreadArticleId,
} from "@/modules/news/newsReadingStatus.js";

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

/**
 * Load learning context for the post-AI-practice wrap-up panel.
 */
export async function loadPostAiPracticeContext({ targetLangStore } = {}) {
  const ctx = await loadLearningContext({ targetLangStore });
  const { user, targetLang, nativeLang, cefr } = ctx;
  const userId = user?.id;

  let dailyGoalSnapshot = null;
  let resumeTarget = null;
  let dueVocabCount = 0;
  let dueMistakeCount = 0;
  let continueReading = null;
  let nextUnreadArticleId = null;
  let newsUnreadCount = 0;

  try {
    if (userId) {
      dailyGoalSnapshot = await getDailyGoalProgress(userId, targetLang);
    }
  } catch {
    dailyGoalSnapshot = null;
  }

  try {
    const curriculum = await getPathCurriculum(nativeLang, targetLang, cefr);
    resumeTarget = findCurrentSection(curriculum);
  } catch {
    resumeTarget = null;
  }

  try {
    dueMistakeCount = loadDueMistakes(pairStatsKey(nativeLang, targetLang)).length;
  } catch {
    dueMistakeCount = 0;
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
        continueReading = findContinueReadingCandidate(articles, statusMap);
        nextUnreadArticleId = findNextUnreadArticleId(articles, statusMap, null);
      }
    }
  } catch {
    continueReading = null;
    nextUnreadArticleId = null;
    newsUnreadCount = 0;
  }

  return {
    dailyGoalSnapshot,
    resumeTarget,
    dueVocabCount,
    dueMistakeCount,
    continueReading,
    nextUnreadArticleId,
    newsUnreadCount,
  };
}