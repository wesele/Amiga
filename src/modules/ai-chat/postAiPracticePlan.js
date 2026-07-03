import { pathSectionRoute, sectionKindIcon } from "@/modules/learn/pathResume.js";
import { dailyGoalRemainingLessons } from "@/modules/learn/dailyGoalDisplay.js";
import {
  buildComprehensionRetakeVerifyStep,
  COMPREHENSION_VERIFY_STEP_ID,
  shouldOfferComprehensionRetakeVerify,
} from "./postComprehensionVerifyPlan.js";

export const AI_PRACTICE_STEP_IDS = {
  DAILY_GOAL: "dailyGoal",
  NEXT_LESSON: "nextLesson",
  CONTINUE_READING: "continueReading",
  NEXT_ARTICLE: "nextArticle",
  VOCAB_REVIEW: "vocabReview",
  MISTAKE_REVIEW: "mistakeReview",
  COMPREHENSION_RETAKE: COMPREHENSION_VERIFY_STEP_ID,
  LEARN_HUB: "learnHub",
  NEWS_LIST: "newsList",
};

const SECONDARY_LIMIT = 3;

function isDailyGoalUnmet(dailyGoalSnapshot) {
  return dailyGoalRemainingLessons(dailyGoalSnapshot) > 0;
}

function dailyGoalSubtitleParams(dailyGoalSnapshot) {
  const remaining = dailyGoalRemainingLessons(dailyGoalSnapshot);
  const done =
    dailyGoalSnapshot?.effective_lessons_today ?? dailyGoalSnapshot?.lessons_today ?? 0;
  const total = dailyGoalSnapshot?.target_lessons ?? 0;
  return { remaining, done, total };
}

function buildResumeLessonStep(resumeTarget, dailyGoalSnapshot) {
  const { remaining, done, total } = dailyGoalSubtitleParams(dailyGoalSnapshot);
  return {
    id: AI_PRACTICE_STEP_IDS.NEXT_LESSON,
    route: pathSectionRoute(resumeTarget.section),
    icon: sectionKindIcon(resumeTarget.section.kind),
    titleKey: "path.nextStep.nextLesson",
    subtitleKey: "path.dailyGoalRemaining",
    subtitleParams: { remaining, done, total },
    continueKey: "path.dailyGoalContinue",
    continueParams: { remaining },
  };
}

function buildDailyGoalPathStep(dailyGoalSnapshot) {
  const { remaining, done, total } = dailyGoalSubtitleParams(dailyGoalSnapshot);
  return {
    id: AI_PRACTICE_STEP_IDS.DAILY_GOAL,
    route: { name: "path" },
    icon: "🎯",
    titleKey: "path.nextStep.dailyGoal",
    titleParams: { remaining },
    subtitleKey: "path.dailyGoalRemaining",
    subtitleParams: { remaining, done, total },
    continueKey: "path.dailyGoalContinue",
    continueParams: { remaining },
  };
}

function buildContinueReadingStep(continueReading) {
  return {
    id: AI_PRACTICE_STEP_IDS.CONTINUE_READING,
    route: { name: "reader", params: { id: continueReading.articleId } },
    icon: "📰",
    titleKey: "learn.continueReading",
    titleParams: { title: continueReading.title },
    subtitleKey: "learn.continueReadingSub",
    subtitleParams: { remainingPct: continueReading.remainingPct },
    continueKey: "learn.continueReadingAction",
  };
}

function buildNextArticleStep(articleId, newsUnreadCount) {
  return {
    id: AI_PRACTICE_STEP_IDS.NEXT_ARTICLE,
    route: { name: "reader", params: { id: articleId } },
    icon: "📰",
    titleKey: "news.nextStep.nextArticle",
    subtitleKey: "news.nextStep.nextArticleHint",
    subtitleParams: { n: newsUnreadCount },
    continueKey: "news.nextStep.nextArticle",
  };
}

function buildVocabReviewStep(dueVocabCount, { practiceWords = [] } = {}) {
  const learnedCount = Array.isArray(practiceWords) ? practiceWords.length : 0;
  return {
    id: AI_PRACTICE_STEP_IDS.VOCAB_REVIEW,
    route: { name: "vocab-review" },
    icon: "📚",
    titleKey: learnedCount > 0 ? "chat.practiceReviewLearnedWords" : "path.nextStep.vocabReview",
    titleParams: learnedCount > 0 ? { n: learnedCount } : { n: dueVocabCount },
    subtitleKey: learnedCount > 0 ? "chat.practiceReviewLearnedWordsHint" : "vocab.reviewContinueHint",
    continueKey: learnedCount > 0 ? "chat.practiceReviewLearnedWordsAction" : "path.vocabReviewContinue",
  };
}

function buildMistakeReviewStep(dueMistakeCount) {
  return {
    id: AI_PRACTICE_STEP_IDS.MISTAKE_REVIEW,
    route: { name: "mistake-review" },
    icon: "🔁",
    titleKey: "path.nextStep.mistakeReview",
    titleParams: { n: dueMistakeCount },
    subtitleKey: "path.mistakeReviewContinueHint",
    continueKey: "path.mistakeReviewContinue",
  };
}

function buildLearnHubStep() {
  return {
    id: AI_PRACTICE_STEP_IDS.LEARN_HUB,
    route: { name: "learn" },
    icon: "🏠",
    titleKey: "vocab.nextStep.learnHub",
    subtitleKey: "vocab.nextStep.learnHubHint",
    continueKey: "vocab.nextStep.learnHub",
  };
}

function buildNewsListStep() {
  return {
    id: AI_PRACTICE_STEP_IDS.NEWS_LIST,
    route: { name: "news" },
    icon: "📋",
    titleKey: "news.readingCompleteNext",
    continueKey: "news.readingCompleteNext",
  };
}

function pickPrimaryStep(ctx) {
  const {
    source,
    comprehensionContext = null,
    dailyGoalSnapshot,
    resumeTarget,
    dueVocabCount = 0,
    dueMistakeCount = 0,
    continueReading = null,
    nextUnreadArticleId = null,
    newsUnreadCount = 0,
    sessionLearnedWords = [],
  } = ctx;

  if (
    shouldOfferComprehensionRetakeVerify({
      source,
      articleId: comprehensionContext?.articleId,
    })
  ) {
    return buildComprehensionRetakeVerifyStep({
      articleId: comprehensionContext.articleId,
      articleTitle: comprehensionContext.articleTitle,
      wrongCount: comprehensionContext.wrongCount,
    });
  }

  if (isDailyGoalUnmet(dailyGoalSnapshot) && resumeTarget) {
    return buildResumeLessonStep(resumeTarget, dailyGoalSnapshot);
  }
  if (isDailyGoalUnmet(dailyGoalSnapshot)) {
    return buildDailyGoalPathStep(dailyGoalSnapshot);
  }
  if (source === "reading" && continueReading) {
    return buildContinueReadingStep(continueReading);
  }
  if (source === "reading" && nextUnreadArticleId) {
    return buildNextArticleStep(nextUnreadArticleId, newsUnreadCount);
  }
  if (sessionLearnedWords.length > 0) {
    return buildVocabReviewStep(dueVocabCount, { practiceWords: sessionLearnedWords });
  }
  if (dueVocabCount > 0) {
    return buildVocabReviewStep(dueVocabCount);
  }
  if (dueMistakeCount > 0) {
    return buildMistakeReviewStep(dueMistakeCount);
  }
  return buildLearnHubStep();
}

function buildSecondarySteps(ctx, primary) {
  const {
    source,
    dailyGoalSnapshot,
    resumeTarget,
    dueVocabCount = 0,
    dueMistakeCount = 0,
    continueReading = null,
    nextUnreadArticleId = null,
    newsUnreadCount = 0,
    sessionLearnedWords = [],
  } = ctx;
  const secondary = [];
  const seen = new Set([primary.id]);

  function push(step) {
    if (!step || seen.has(step.id) || secondary.length >= SECONDARY_LIMIT) return;
    seen.add(step.id);
    secondary.push(step);
  }

  if (isDailyGoalUnmet(dailyGoalSnapshot)) {
    push(
      resumeTarget
        ? buildResumeLessonStep(resumeTarget, dailyGoalSnapshot)
        : buildDailyGoalPathStep(dailyGoalSnapshot),
    );
  }
  if (source === "reading") {
    if (continueReading) push(buildContinueReadingStep(continueReading));
    if (nextUnreadArticleId) push(buildNextArticleStep(nextUnreadArticleId, newsUnreadCount));
    push(buildNewsListStep());
  }
  if (source === "comprehension") {
    push(buildNewsListStep());
  }
  if (sessionLearnedWords.length > 0) {
    push(buildVocabReviewStep(dueVocabCount, { practiceWords: sessionLearnedWords }));
  } else if (dueVocabCount > 0) {
    push(buildVocabReviewStep(dueVocabCount));
  }
  if (dueMistakeCount > 0) push(buildMistakeReviewStep(dueMistakeCount));
  push(buildLearnHubStep());

  return secondary;
}

/**
 * Build the ordered post-AI-practice action plan for the wrap-up overlay.
 */
export function buildPostAiPracticePlan(ctx = {}) {
  const primary = pickPrimaryStep(ctx);
  const secondary = buildSecondarySteps(ctx, primary);
  return { primary, secondary };
}