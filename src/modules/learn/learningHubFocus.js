import { focusPracticeRoute } from "@/modules/path/focusPracticeRoute.js";
import { lessonArticleReaderRoute } from "@/modules/news/lessonArticleMatch.js";
import { lessonWordsPreview } from "@/modules/news/lessonWordHighlight.js";
import { isContinueReadingCandidate } from "@/modules/news/readingProgress.js";
import { isRecentLessonFresh } from "@/modules/path/recentLessonWords.js";
import { isActiveDaySecured } from "./dailyGoalDisplay.js";
import { pathSectionRoute, sectionKindIcon } from "./pathResume.js";
import { isStreakAtRisk } from "./streakAtRisk.js";

export const FOCUS_IDS = {
  STREAK_AT_RISK: "streakAtRisk",
  CONTINUE_SECTION: "continueSection",
  LESSON_ARTICLE_MATCH: "lessonArticleMatch",
  CONTINUE_READING: "continueReading",
  COMPREHENSION_RETAKE: "comprehensionRetake",
  READ_NEWS: "readNews",
  MISTAKE_REVIEW: "mistakeReview",
  VOCAB_REVIEW: "vocabReview",
  FOCUS_PRACTICE: "focusPractice",
  DAILY_GOAL: "dailyGoal",
  EXPLORE_PATH: "explorePath",
};

function continueReadingRoute(article) {
  return { name: "reader", params: { id: article.articleId } };
}

function continueReadingFocus(article) {
  return {
    id: FOCUS_IDS.CONTINUE_READING,
    route: continueReadingRoute(article),
    icon: "📰",
    articleTitle: article.title,
    articleId: article.articleId,
    scrollPct: article.scrollPct,
    remainingPct: article.remainingPct,
  };
}

function comprehensionRetakeRoute(article) {
  return {
    name: "reader",
    params: { id: article.articleId },
    query: { comprehensionRetake: "1" },
  };
}

function comprehensionRetakeFocus(article, pendingCount = 1) {
  return {
    id: FOCUS_IDS.COMPREHENSION_RETAKE,
    route: comprehensionRetakeRoute(article),
    icon: "🧠",
    articleTitle: article.title,
    articleId: article.articleId,
    comprehensionSkipped: article.comprehensionSkipped,
    comprehensionScore: article.comprehensionScore,
    total: article.total ?? 2,
    pendingCount,
  };
}

function isPendingComprehensionCandidate(article) {
  return Boolean(article?.articleId);
}

function lessonArticleMatchFocus(match) {
  return {
    id: FOCUS_IDS.LESSON_ARTICLE_MATCH,
    route: lessonArticleReaderRoute(match.articleId, match.matchedWords),
    icon: "📰",
    articleTitle: match.articleTitle,
    articleId: match.articleId,
    matchCount: match.matchCount,
    matchedWords: match.matchedWords,
    matchedPreview: lessonWordsPreview(match.matchedWords),
    sectionTitle: match.sectionTitle ?? "",
  };
}

function hasLessonArticleMatch(ctx) {
  return Boolean(ctx.lessonArticleMatch?.articleId);
}

export function shouldPromoteLessonArticleHero(ctx, { now = Date.now() } = {}) {
  const { lessonArticleMatch, dailyGoal } = ctx;
  if (!lessonArticleMatch?.articleId) return false;

  const goalMet = Boolean(dailyGoal?.goal_met);
  if (goalMet || isActiveDaySecured(dailyGoal)) return true;

  if (
    isRecentLessonFresh(lessonArticleMatch.completedAt, { now })
    && !lessonArticleMatch.readToday
    && !lessonArticleMatch.completed
  ) {
    return true;
  }

  return false;
}

function resolveStreakAtRiskAction(ctx) {
  const {
    dailyGoal,
    resumeTarget,
    dueMistakes = 0,
    dueVocabWords = [],
    newsUnreadCount = 0,
    continueReadingArticle = null,
    lessonArticleMatch = null,
  } = ctx;
  const goalMet = Boolean(dailyGoal?.goal_met);

  if (!goalMet && resumeTarget) {
    return {
      id: FOCUS_IDS.CONTINUE_SECTION,
      route: pathSectionRoute(resumeTarget.section),
    };
  }
  if (!goalMet) {
    if (hasLessonArticleMatch({ lessonArticleMatch })) {
      return lessonArticleMatchFocus(lessonArticleMatch);
    }
    if (isContinueReadingCandidate(continueReadingArticle)) {
      return {
        id: FOCUS_IDS.CONTINUE_READING,
        route: continueReadingRoute(continueReadingArticle),
        articleTitle: continueReadingArticle.title,
        remainingPct: continueReadingArticle.remainingPct,
        scrollPct: continueReadingArticle.scrollPct,
      };
    }
    if (newsUnreadCount > 0) {
      return { id: FOCUS_IDS.READ_NEWS, route: { name: "news" } };
    }
    return { id: FOCUS_IDS.DAILY_GOAL, route: { name: "path" } };
  }
  if (dueMistakes > 0) {
    return { id: FOCUS_IDS.MISTAKE_REVIEW, route: { name: "path-mistake-review" } };
  }
  if (dueVocabWords.length > 0) {
    return { id: FOCUS_IDS.VOCAB_REVIEW, route: { name: "vocab-review" } };
  }
  return { id: FOCUS_IDS.EXPLORE_PATH, route: { name: "path" } };
}

/**
 * Pick the single primary focus for the learn hub hero card.
 * Priority aligns with the post-lesson nudge chain, with streak-at-risk on top.
 */
export function pickLearningHubFocus(ctx) {
  const {
    dailyGoal = null,
    resumeTarget = null,
    dueMistakes = 0,
    dueVocabWords = [],
    focusArea = null,
    localHour = new Date().getHours(),
    mistakePreview = "",
    vocabPreview = "",
  } = ctx;

  const goalMet = Boolean(dailyGoal?.goal_met);
  const streakAtRisk = isStreakAtRisk({
    streakCurrent: dailyGoal?.streak_current,
    practicedToday: dailyGoal?.practiced_today,
    localHour,
  });

  if (streakAtRisk) {
    const action = resolveStreakAtRiskAction(ctx);
    return {
      id: FOCUS_IDS.STREAK_AT_RISK,
      actionId: action.id,
      route: action.route,
      icon: "🔥",
      streakCurrent: dailyGoal?.streak_current ?? 0,
      mistakePreview,
      vocabPreview,
      dueMistakes,
      vocabCount: dueVocabWords.length,
      newsUnreadCount: ctx.newsUnreadCount ?? 0,
      ...(action.id === FOCUS_IDS.CONTINUE_READING
        ? {
          articleTitle: action.articleTitle,
          remainingPct: action.remainingPct,
          scrollPct: action.scrollPct,
        }
        : {}),
      ...(action.id === FOCUS_IDS.LESSON_ARTICLE_MATCH
        ? {
          articleTitle: action.articleTitle,
          matchCount: action.matchCount,
          matchedPreview: action.matchedPreview,
        }
        : {}),
    };
  }

  if (!goalMet && resumeTarget) {
    return {
      id: FOCUS_IDS.CONTINUE_SECTION,
      route: pathSectionRoute(resumeTarget.section),
      icon: sectionKindIcon(resumeTarget.section.kind),
      sectionTitle: resumeTarget.section.title_native ?? "",
    };
  }

  if (shouldPromoteLessonArticleHero(ctx)) {
    return lessonArticleMatchFocus(ctx.lessonArticleMatch);
  }

  if (isContinueReadingCandidate(ctx.continueReadingArticle)) {
    return continueReadingFocus(ctx.continueReadingArticle);
  }

  if (isPendingComprehensionCandidate(ctx.pendingComprehensionArticle)) {
    return comprehensionRetakeFocus(
      ctx.pendingComprehensionArticle,
      ctx.pendingComprehensionCount ?? 1,
    );
  }

  if (dueMistakes > 0) {
    return {
      id: FOCUS_IDS.MISTAKE_REVIEW,
      route: { name: "path-mistake-review" },
      icon: "🔁",
      dueMistakes,
      mistakePreview,
    };
  }

  if (dueVocabWords.length > 0) {
    return {
      id: FOCUS_IDS.VOCAB_REVIEW,
      route: { name: "vocab-review" },
      icon: "📚",
      vocabCount: dueVocabWords.length,
      vocabPreview,
    };
  }

  if (focusArea?.typeId) {
    return {
      id: FOCUS_IDS.FOCUS_PRACTICE,
      route: focusPracticeRoute(focusArea.typeId),
      icon: "🎯",
      typeId: focusArea.typeId,
      accuracyPct: focusArea.accuracyPct,
    };
  }

  if (!goalMet) {
    const effective =
      dailyGoal?.effective_lessons_today ?? dailyGoal?.lessons_today ?? 0;
    return {
      id: FOCUS_IDS.DAILY_GOAL,
      route: { name: "path" },
      icon: "🎯",
      lessonsToday: dailyGoal?.lessons_today ?? 0,
      targetLessons: dailyGoal?.target_lessons ?? 0,
      remaining: Math.max(0, (dailyGoal?.target_lessons ?? 0) - effective),
    };
  }

  return {
    id: FOCUS_IDS.EXPLORE_PATH,
    route: { name: "path" },
    icon: "🛤️",
  };
}

export function pickTopMilestone({
  showAccuracy = false,
  showCombo = false,
  showPerfect = false,
  showPerfectStreak = false,
} = {}) {
  if (showAccuracy) return "accuracy";
  if (showCombo) return "combo";
  if (showPerfect) return "perfect";
  if (showPerfectStreak) return "perfectStreak";
  return null;
}

/** Secondary cards that the hero focus does not already cover. */
export function pickSecondarySuggestions(ctx, focus) {
  const suggestions = [];
  const focusId = focus?.id;
  const {
    dueMistakes = 0,
    dueVocabWords = [],
    focusArea = null,
    continueReadingArticle = null,
    pendingComprehensionCount = 0,
    pendingComprehensionArticle = null,
    lessonArticleMatch = null,
    showAccuracy = false,
    showCombo = false,
    showPerfect = false,
    showPerfectStreak = false,
    showFocusArea = false,
  } = ctx;

  const focusShowsLessonArticleMatch =
    focusId === FOCUS_IDS.LESSON_ARTICLE_MATCH
    || (focusId === FOCUS_IDS.STREAK_AT_RISK
      && focus?.actionId === FOCUS_IDS.LESSON_ARTICLE_MATCH);

  if (hasLessonArticleMatch({ lessonArticleMatch }) && !focusShowsLessonArticleMatch) {
    suggestions.push({ type: "lessonArticleMatch", ...lessonArticleMatch });
  }

  const focusShowsContinueReading =
    focusId === FOCUS_IDS.CONTINUE_READING
    || (focusId === FOCUS_IDS.STREAK_AT_RISK && focus?.actionId === FOCUS_IDS.CONTINUE_READING);

  if (
    isContinueReadingCandidate(continueReadingArticle)
    && !focusShowsContinueReading
  ) {
    suggestions.push({ type: "continueReading", ...continueReadingArticle });
  }

  if (focusId !== FOCUS_IDS.COMPREHENSION_RETAKE && pendingComprehensionCount > 0) {
    if (pendingComprehensionCount > 1) {
      suggestions.push({
        type: "comprehensionRetake",
        count: pendingComprehensionCount - 1,
      });
    } else if (isPendingComprehensionCandidate(pendingComprehensionArticle)) {
      suggestions.push({
        type: "comprehensionRetake",
        ...pendingComprehensionArticle,
      });
    }
  }

  if (focusId !== FOCUS_IDS.MISTAKE_REVIEW && dueMistakes > 0) {
    suggestions.push({ type: "mistakeReview" });
  }
  if (focusId !== FOCUS_IDS.VOCAB_REVIEW && dueVocabWords.length > 0) {
    suggestions.push({ type: "vocabReview" });
  }
  if (focusId !== FOCUS_IDS.FOCUS_PRACTICE && showFocusArea && focusArea?.typeId) {
    suggestions.push({ type: "focusArea" });
  }

  const milestone = pickTopMilestone({
    showAccuracy,
    showCombo,
    showPerfect,
    showPerfectStreak,
  });
  if (milestone) {
    suggestions.push({ type: milestone });
  }

  return suggestions;
}