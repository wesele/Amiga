import { pathSectionRoute, sectionKindIcon } from "@/modules/learn/pathResume.js";
import { dailyGoalRemainingLessons } from "@/modules/learn/dailyGoalDisplay.js";

export const READING_STEP_IDS = {
  VOCAB_REVIEW: "vocabReview",
  CONTINUE_ARTICLE: "continueArticle",
  NEXT_LESSON: "nextLesson",
  DAILY_GOAL: "dailyGoal",
  NEXT_ARTICLE: "nextArticle",
  AI_PRACTICE: "aiPractice",
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

function buildVocabReviewStep(unknownCount) {
  return {
    id: READING_STEP_IDS.VOCAB_REVIEW,
    route: null,
    icon: "📚",
    titleKey: "news.nextStep.vocabReview",
    titleParams: { n: unknownCount },
    subtitleKey: "news.nextStep.vocabReviewHint",
    continueKey: "news.readingCompleteReview",
    continueParams: { n: unknownCount },
    count: unknownCount,
  };
}

function buildResumeLessonStep(resumeTarget, dailyGoalSnapshot) {
  const { remaining, done, total } = dailyGoalSubtitleParams(dailyGoalSnapshot);
  return {
    id: READING_STEP_IDS.NEXT_LESSON,
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
    id: READING_STEP_IDS.DAILY_GOAL,
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

function buildNextArticleStep(articleId, newsUnreadCount) {
  return {
    id: READING_STEP_IDS.NEXT_ARTICLE,
    route: { name: "reader", params: { id: articleId } },
    icon: "📰",
    titleKey: "news.nextStep.nextArticle",
    subtitleKey: "news.nextStep.nextArticleHint",
    subtitleParams: { n: newsUnreadCount },
    continueKey: "news.nextStep.nextArticle",
  };
}

function buildAiPracticeStep(sessionWords) {
  const words = (sessionWords || []).filter(Boolean);
  const preview = words.slice(0, 3).join(", ");
  return {
    id: READING_STEP_IDS.AI_PRACTICE,
    route: null,
    contactAction: "aiPractice",
    sessionWords: words,
    icon: "💬",
    titleKey: "news.nextStep.aiPractice",
    subtitleKey: "news.nextStep.aiPracticeHint",
    subtitleParams: { preview },
    continueKey: "vocab.nextStep.aiPracticeContinue",
  };
}

function buildLearnHubStep() {
  return {
    id: READING_STEP_IDS.LEARN_HUB,
    route: { name: "learn" },
    icon: "🏠",
    titleKey: "vocab.nextStep.learnHub",
    subtitleKey: "vocab.nextStep.learnHubHint",
    continueKey: "vocab.nextStep.learnHub",
  };
}

function buildNewsListStep() {
  return {
    id: READING_STEP_IDS.NEWS_LIST,
    route: { name: "news" },
    icon: "📋",
    titleKey: "news.readingCompleteNext",
    continueKey: "news.readingCompleteNext",
  };
}

function buildContinueArticleStep(scrollPct) {
  const remainingPct = Math.max(0, 100 - Math.round(scrollPct));
  return {
    id: READING_STEP_IDS.CONTINUE_ARTICLE,
    route: null,
    inPageAction: "continueReading",
    icon: "📰",
    titleKey: "news.checkpointContinueArticle",
    subtitleKey: "news.checkpointContinueArticleHint",
    subtitleParams: { remainingPct },
    continueKey: "news.checkpointContinueAction",
  };
}

function pickPrimaryStep(ctx) {
  const {
    mode = "complete",
    scrollPct = 0,
    unknownCount,
    microReviewCompleted = false,
    dailyGoalSnapshot,
    resumeTarget,
    nextUnreadArticleId,
    newsUnreadCount,
    sessionWordCount,
    sessionWords,
  } = ctx;

  if (mode === "checkpoint") {
    if (unknownCount > 0 && !microReviewCompleted) {
      return buildVocabReviewStep(unknownCount);
    }
    return buildContinueArticleStep(scrollPct);
  }

  if (unknownCount > 0 && !microReviewCompleted) {
    return buildVocabReviewStep(unknownCount);
  }
  if (isDailyGoalUnmet(dailyGoalSnapshot) && resumeTarget) {
    return buildResumeLessonStep(resumeTarget, dailyGoalSnapshot);
  }
  if (isDailyGoalUnmet(dailyGoalSnapshot)) {
    return buildDailyGoalPathStep(dailyGoalSnapshot);
  }
  if (nextUnreadArticleId) {
    return buildNextArticleStep(nextUnreadArticleId, newsUnreadCount);
  }
  if (sessionWordCount >= 3 && sessionWords.length > 0) {
    return buildAiPracticeStep(sessionWords);
  }
  return buildLearnHubStep();
}

function buildSecondarySteps(ctx, primary) {
  const {
    mode = "complete",
    scrollPct = 0,
    unknownCount,
    dailyGoalSnapshot,
    resumeTarget,
    nextUnreadArticleId,
    newsUnreadCount,
    sessionWordCount,
    sessionWords,
  } = ctx;
  const secondary = [];
  const seen = new Set([primary.id]);

  function push(step) {
    if (!step || seen.has(step.id)) return;
    seen.add(step.id);
    secondary.push(step);
  }

  if (mode === "checkpoint" && primary.id !== READING_STEP_IDS.CONTINUE_ARTICLE) {
    push(buildContinueArticleStep(scrollPct));
  }

  if (unknownCount > 0 && isDailyGoalUnmet(dailyGoalSnapshot)) {
    push(
      resumeTarget
        ? buildResumeLessonStep(resumeTarget, dailyGoalSnapshot)
        : buildDailyGoalPathStep(dailyGoalSnapshot),
    );
  }
  if (nextUnreadArticleId) {
    push(buildNextArticleStep(nextUnreadArticleId, newsUnreadCount));
  }
  if (sessionWordCount >= 3 && sessionWords.length > 0) {
    push(buildAiPracticeStep(sessionWords));
  }
  push(buildNewsListStep());

  return secondary.slice(0, SECONDARY_LIMIT);
}

/**
 * Build the ordered post-reading action plan for the completion summary.
 */
export function buildPostReadingPlan(ctx = {}) {
  const primary = pickPrimaryStep(ctx);
  const secondary = buildSecondarySteps(ctx, primary);
  return { primary, secondary };
}

/** Whether the step triggers in-page vocab review for this reading session. */
export function isVocabReviewStep(step) {
  return step?.id === READING_STEP_IDS.VOCAB_REVIEW;
}

/** Whether the step opens Amiga chat with session words. */
export function isAiPracticeStep(step) {
  return step?.id === READING_STEP_IDS.AI_PRACTICE;
}

/** Whether the step dismisses the overlay and resumes reading in place. */
export function isContinueReadingStep(step) {
  return step?.id === READING_STEP_IDS.CONTINUE_ARTICLE;
}