import { focusPracticeRoute } from "./focusPracticeRoute.js";
import { continueRouteAfterLesson } from "./lessonContinue.js";
import {
  dailyGoalLessonsRemaining,
  shouldShowDailyGoalNudge,
} from "./dailyGoalNudge.js";
import {
  weeklyGoalDaysRemaining,
  shouldShowWeeklyGoalNudge,
} from "./weeklyGoalNudge.js";
import {
  shouldFreshMistakeTakePrimary,
  shouldShowFreshMistakeNudge,
} from "./freshMistakeNudge.js";
import {
  mistakeReviewNudgeCount,
  shouldShowMistakeReviewNudge,
} from "./mistakeReviewNudge.js";
import {
  shouldShowVocabReviewNudge,
  vocabReviewNudgeCount,
} from "./vocabReviewNudge.js";
import { shouldShowFocusAreaNudge } from "./focusAreaNudge.js";
import { pathRouteWithCurrentFocus } from "./pathMapScroll.js";
import { pathRouteForCompletion } from "./pathCompletionCelebration.js";
import {
  lessonArticleReaderRoute,
  pickBestArticleForLessonWords,
} from "@/modules/news/lessonArticleMatch.js";
import { lessonWordsPreview } from "@/modules/news/lessonWordHighlight.js";
import { isStreakAtRisk } from "@/modules/learn/streakAtRisk.js";

export const STEP_IDS = {
  DAILY_GOAL: "dailyGoal",
  FRESH_MISTAKE: "freshMistake",
  MISTAKE_REVIEW: "mistakeReview",
  VOCAB_REVIEW: "vocabReview",
  FOCUS_AREA: "focusArea",
  NEXT_LESSON: "nextLesson",
  READ_MATCHED_ARTICLE: "readMatchedArticle",
  PATH: "path",
  WEEKLY_GOAL: "weeklyGoal",
};

function buildDailyGoalStep(result, completionCtx) {
  const remaining = dailyGoalLessonsRemaining(result);
  const route =
    continueRouteAfterLesson(result) ?? pathRouteForCompletion(completionCtx);
  const done = result.daily_goal_lessons_today;
  const total = result.daily_goal_target;
  return {
    id: STEP_IDS.DAILY_GOAL,
    route,
    icon: "🎯",
    titleKey: "path.nextStep.dailyGoal",
    titleParams: { remaining },
    subtitleKey: "path.dailyGoalRemaining",
    subtitleParams: { remaining, done, total },
    continueKey: "path.dailyGoalContinue",
    continueParams: { remaining },
  };
}

function buildFreshMistakeStep(count) {
  return {
    id: STEP_IDS.FRESH_MISTAKE,
    route: { name: "path-mistake-review" },
    icon: "🔥",
    titleKey: "path.nextStep.freshMistake",
    titleParams: { n: count },
    subtitleKey: "path.freshMistakeNudge",
    subtitleParams: { n: count },
    count,
    continueKey: "path.freshMistakeContinue",
  };
}

function buildMistakeReviewStep(dueAtStart) {
  const count = mistakeReviewNudgeCount(dueAtStart);
  return {
    id: STEP_IDS.MISTAKE_REVIEW,
    route: { name: "path-mistake-review" },
    icon: "🔁",
    titleKey: "path.nextStep.mistakeReview",
    titleParams: { n: count },
    subtitleKey: "path.mistakeReviewRemainingNudge",
    subtitleParams: { n: count },
    count,
    continueKey: "path.mistakeReviewContinue",
  };
}

function buildVocabReviewStep(dueAtStart) {
  const count = vocabReviewNudgeCount(dueAtStart);
  return {
    id: STEP_IDS.VOCAB_REVIEW,
    route: { name: "vocab-review" },
    icon: "📚",
    titleKey: "path.nextStep.vocabReview",
    titleParams: { n: count },
    subtitleKey: "path.vocabReviewRemainingNudge",
    subtitleParams: { n: count },
    count,
    continueKey: "path.vocabReviewContinue",
  };
}

function buildFocusAreaStep(focusArea) {
  return {
    id: STEP_IDS.FOCUS_AREA,
    route: focusPracticeRoute(focusArea.typeId),
    icon: "🎯",
    titleKey: "path.nextStep.focusArea",
    titleParams: { typeId: focusArea.typeId },
    subtitleKey: "path.focusAreaRemainingNudge",
    subtitleParams: {
      typeId: focusArea.typeId,
      pct: focusArea.accuracyPct,
    },
    typeId: focusArea.typeId,
    accuracyPct: focusArea.accuracyPct,
    continueKey: "path.focusAreaContinue",
  };
}

function buildNextLessonStep(route) {
  return {
    id: STEP_IDS.NEXT_LESSON,
    route,
    icon: "▶️",
    titleKey: "path.nextStep.nextLesson",
    subtitleKey: "path.nextStep.nextLessonHint",
    continueKey: "path.continueNextLesson",
  };
}

function buildPathStep(completionCtx) {
  return {
    id: STEP_IDS.PATH,
    route: pathRouteForCompletion(completionCtx),
    icon: "🛤️",
    titleKey: "path.nextStep.path",
    subtitleKey: "path.nextStep.pathHint",
    continueKey: "path.continuePath",
  };
}

function buildReadMatchedArticleStep(match) {
  const preview = lessonWordsPreview(match.matchedWords);
  return {
    id: STEP_IDS.READ_MATCHED_ARTICLE,
    route: lessonArticleReaderRoute(match.articleId, match.matchedWords),
    icon: "📰",
    titleKey: "path.nextStep.readMatchedArticle",
    subtitleKey: "path.nextStep.readMatchedArticleHint",
    subtitleParams: {
      title: match.articleTitle,
      n: match.matchCount,
      preview,
    },
    continueKey: "path.nextStep.readMatchedArticleContinue",
    articleId: match.articleId,
    matchedWords: match.matchedWords,
    matchCount: match.matchCount,
  };
}

function buildWeeklyGoalStep(result) {
  const remaining = weeklyGoalDaysRemaining(result);
  const done = result.weekly_goal_active_days;
  const total = result.weekly_goal_target_days;
  return {
    id: STEP_IDS.WEEKLY_GOAL,
    route: null,
    icon: "📅",
    titleKey: "path.nextStep.weeklyGoal",
    titleParams: { remaining },
    subtitleKey: "path.weeklyGoalRemainingNudge",
    subtitleParams: { remaining, done, total },
  };
}

function resolveNudgeFlags(ctx) {
  const {
    result,
    freshMistakeCount = 0,
    dueMistakesAtStart = 0,
    dueVocabAtStart = 0,
    focusArea = null,
  } = ctx;

  const dailyGoalNudgeActive = shouldShowDailyGoalNudge(result);
  const freshMistakePrimary = shouldFreshMistakeTakePrimary(result, {
    freshCount: freshMistakeCount,
    dailyGoalNudgeActive,
  });
  const mistakeReviewNudgeActive = shouldShowMistakeReviewNudge(result, {
    dueAtStart: dueMistakesAtStart,
    dailyGoalNudgeActive,
  });
  const vocabReviewNudgeActive = shouldShowVocabReviewNudge(result, {
    dueAtStart: dueVocabAtStart,
    dailyGoalNudgeActive,
    mistakeReviewNudgeActive,
    freshMistakeNudgeActive: freshMistakePrimary,
  });
  const focusAreaNudgeActive = shouldShowFocusAreaNudge(result, {
    focusArea,
    dailyGoalNudgeActive,
    mistakeReviewNudgeActive,
    freshMistakeNudgeActive: freshMistakePrimary,
    vocabReviewNudgeActive,
  });
  const weeklyGoalNudgeActive = shouldShowWeeklyGoalNudge(result, {
    dailyGoalNudgeActive,
  });

  return {
    dailyGoalNudgeActive,
    freshMistakePrimary,
    mistakeReviewNudgeActive,
    vocabReviewNudgeActive,
    focusAreaNudgeActive,
    weeklyGoalNudgeActive,
    freshMistakeVisible: shouldShowFreshMistakeNudge(result, {
      freshCount: freshMistakeCount,
    }),
    dueMistakesAtStart,
    dueVocabAtStart,
    focusArea,
  };
}

/** All actionable steps when the daily goal is already met (queue is not mutually suppressed). */
function buildVisibleActionSteps(flags, result, completionCtx) {
  const steps = [];

  if (flags.freshMistakeVisible) {
    steps.push(buildFreshMistakeStep(flags.freshMistakeCount ?? 0));
  }
  if (flags.dueMistakesAtStart > 0) {
    steps.push(buildMistakeReviewStep(flags.dueMistakesAtStart));
  }
  if (flags.dueVocabAtStart > 0) {
    steps.push(buildVocabReviewStep(flags.dueVocabAtStart));
  }
  if (flags.focusArea?.typeId) {
    steps.push(buildFocusAreaStep(flags.focusArea));
  }

  const nextRoute = continueRouteAfterLesson(result);
  if (nextRoute) {
    steps.push(buildNextLessonStep(nextRoute));
  } else {
    steps.push(buildPathStep(completionCtx));
  }

  return steps;
}

function pickPrimaryStep(flags, result, freshMistakeCount, completionCtx) {
  if (flags.dailyGoalNudgeActive) {
    return buildDailyGoalStep(result, completionCtx);
  }
  if (flags.freshMistakePrimary) {
    return buildFreshMistakeStep(freshMistakeCount);
  }
  if (flags.mistakeReviewNudgeActive) {
    return buildMistakeReviewStep(flags.dueMistakesAtStart);
  }
  if (flags.vocabReviewNudgeActive) {
    return buildVocabReviewStep(flags.dueVocabAtStart);
  }
  if (flags.focusAreaNudgeActive) {
    return buildFocusAreaStep(flags.focusArea);
  }
  const nextRoute = continueRouteAfterLesson(result);
  if (nextRoute) {
    return buildNextLessonStep(nextRoute);
  }
  return buildPathStep(completionCtx);
}

/**
 * Build the ordered post-lesson action plan for the summary screen.
 * Primary matches finishLesson() routing; secondary lists remaining todos.
 */
export function buildPostLessonPlan({
  result,
  completedSectionId = null,
  perfectLesson = false,
  freshMistakeCount = 0,
  dueMistakesAtStart = 0,
  dueVocabAtStart = 0,
  focusArea = null,
  isVocabLesson = false,
  lessonWords = [],
  articles = [],
  newsUnreadCount = 0,
  localHour = new Date().getHours(),
} = {}) {
  if (!result?.passed) return null;

  const completionCtx = { completedSectionId, result, perfectLesson };
  const flags = resolveNudgeFlags({
    result,
    freshMistakeCount,
    dueMistakesAtStart,
    dueVocabAtStart,
    focusArea,
  });
  flags.freshMistakeCount = freshMistakeCount;

  const articleMatch =
    isVocabLesson && lessonWords.length >= 2
      ? pickBestArticleForLessonWords(articles, lessonWords)
      : null;

  const primary = pickPrimaryStep(flags, result, freshMistakeCount, completionCtx);
  const secondary = [];

  if (!flags.dailyGoalNudgeActive) {
    const visibleSteps = buildVisibleActionSteps(flags, result, completionCtx);
    for (const step of visibleSteps) {
      if (step.id !== primary.id) {
        secondary.push(step);
      }
    }
    if (flags.weeklyGoalNudgeActive) {
      secondary.push(buildWeeklyGoalStep(result));
    }
  }

  if (articleMatch && primary.id !== STEP_IDS.READ_MATCHED_ARTICLE) {
    const matchedStep = buildReadMatchedArticleStep(articleMatch);
    const streakAtRisk = isStreakAtRisk({
      streakCurrent: result.streak_current,
      practicedToday: Boolean(result.streak_extended || result.daily_goal_just_met),
      localHour,
    });
    if (
      streakAtRisk &&
      newsUnreadCount > 0 &&
      !secondary.some((step) => step.id === STEP_IDS.READ_MATCHED_ARTICLE)
    ) {
      secondary.unshift(matchedStep);
    } else if (
      !secondary.some((step) => step.id === STEP_IDS.READ_MATCHED_ARTICLE)
    ) {
      secondary.push(matchedStep);
    }
  }

  return { primary, secondary };
}

/** Route for the primary CTA — mirrors finishLesson() priority. */
export function primaryStepRoute(plan) {
  return plan?.primary?.route ?? pathRouteWithCurrentFocus();
}

export function shouldShowFreshMistakeInMistakeSection(result, freshMistakeCount, plan) {
  if (!shouldShowFreshMistakeNudge(result, { freshCount: freshMistakeCount })) {
    return false;
  }
  return plan?.primary?.id !== STEP_IDS.FRESH_MISTAKE;
}