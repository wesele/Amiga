import { focusPracticeRoute } from "./focusPracticeRoute.js";
import {
  continueRouteAfterSection,
  sectionKindFromId,
  teachingContinueCtaKeys,
} from "./lessonContinue.js";
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
import { isStreakAtRisk } from "@/modules/learn/streakAtRisk.js";
import {
  lessonArticleReaderRoute,
  pickBestArticleForLessonWords,
} from "@/modules/news/lessonArticleMatch.js";
import { lessonWordsPreview } from "@/modules/news/lessonWordHighlight.js";

export const TEACHING_STEP_IDS = {
  NEXT_NODE: "nextNode",
  DAILY_GOAL: "dailyGoal",
  FRESH_MISTAKE: "freshMistake",
  MISTAKE_REVIEW: "mistakeReview",
  VOCAB_REVIEW: "vocabReview",
  FOCUS_AREA: "focusArea",
  READ_NEWS: "readNews",
  READ_MATCHED_ARTICLE: "readMatchedArticle",
  AI_PRACTICE: "aiPractice",
  PATH: "path",
  LEARN_HUB: "learnHub",
  WEEKLY_GOAL: "weeklyGoal",
};

const SECONDARY_LIMIT = 3;

function nextNodeIcon(nextKind) {
  if (nextKind === "practice") return "▶️";
  if (nextKind === "vocab") return "📖";
  return "📚";
}

function nextNodeKindKey(nextKind) {
  if (nextKind === "practice") return "path.nodePractice";
  if (nextKind === "vocab") return "path.nodeVocab";
  return "path.nodeGrammar";
}

function buildNextNodeStep(result, unitTitle = "") {
  const route = continueRouteAfterSection(result);
  const keys = teachingContinueCtaKeys(result);
  if (!route || !keys) return null;

  const nextKind = sectionKindFromId(result.next_section_id);
  const subtitleParams =
    keys.subtitleKey === "path.teachingContinue.toVocabSub"
      ? { unit: unitTitle }
      : {};

  return {
    id: TEACHING_STEP_IDS.NEXT_NODE,
    route,
    icon: nextNodeIcon(nextKind),
    titleKey: "path.nextStep.nextNode",
    titleParams: { kindKey: nextNodeKindKey(nextKind) },
    subtitleKey: keys.subtitleKey ?? "path.nextStep.nextNodeHint",
    subtitleParams,
    continueKey: keys.labelKey,
    continueParams: subtitleParams,
  };
}

function buildDailyGoalStep(result, continueRoute, completionCtx) {
  const remaining = dailyGoalLessonsRemaining(result);
  const route = continueRoute ?? pathRouteForCompletion(completionCtx);
  const done = result.daily_goal_lessons_today;
  const total = result.daily_goal_target;
  return {
    id: TEACHING_STEP_IDS.DAILY_GOAL,
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
    id: TEACHING_STEP_IDS.FRESH_MISTAKE,
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
    id: TEACHING_STEP_IDS.MISTAKE_REVIEW,
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
    id: TEACHING_STEP_IDS.VOCAB_REVIEW,
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
    id: TEACHING_STEP_IDS.FOCUS_AREA,
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

function buildReadNewsStep(newsUnreadCount) {
  return {
    id: TEACHING_STEP_IDS.READ_NEWS,
    route: { name: "news" },
    icon: "📰",
    titleKey: "path.nextStep.readNews",
    subtitleKey: "path.nextStep.readNewsHint",
    subtitleParams: { n: newsUnreadCount },
    continueKey: "path.nextStep.readNews",
  };
}

function buildReadMatchedArticleStep(match) {
  const preview = lessonWordsPreview(match.matchedWords);
  return {
    id: TEACHING_STEP_IDS.READ_MATCHED_ARTICLE,
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

function buildAiPracticeStep(sessionWords) {
  const words = (sessionWords || []).filter(Boolean);
  const preview = words.slice(0, 3).join(", ");
  return {
    id: TEACHING_STEP_IDS.AI_PRACTICE,
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

function buildPathStep(completionCtx) {
  return {
    id: TEACHING_STEP_IDS.PATH,
    route: pathRouteForCompletion(completionCtx),
    icon: "🛤️",
    titleKey: "path.nextStep.path",
    subtitleKey: "path.nextStep.pathHint",
    continueKey: "path.continuePath",
  };
}

function buildLearnHubStep() {
  return {
    id: TEACHING_STEP_IDS.LEARN_HUB,
    route: { name: "learn" },
    icon: "🏠",
    titleKey: "vocab.nextStep.learnHub",
    subtitleKey: "vocab.nextStep.learnHubHint",
    continueKey: "vocab.nextStep.learnHub",
  };
}

function buildWeeklyGoalStep(result) {
  const remaining = weeklyGoalDaysRemaining(result);
  const done = result.weekly_goal_active_days;
  const total = result.weekly_goal_target_days;
  return {
    id: TEACHING_STEP_IDS.WEEKLY_GOAL,
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
    freshMistakeCount,
  };
}

function pickPrimaryStep(flags, result, ctx, completionCtx) {
  const continueRoute = continueRouteAfterSection(result);
  const nextNode =
    !result.level_upgraded && continueRoute
      ? buildNextNodeStep(result, ctx.unitTitle ?? "")
      : null;

  if (nextNode) return nextNode;
  if (flags.dailyGoalNudgeActive) {
    return buildDailyGoalStep(result, continueRoute, completionCtx);
  }
  if (flags.freshMistakePrimary) {
    return buildFreshMistakeStep(flags.freshMistakeCount);
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
  return buildPathStep(completionCtx);
}

function buildSecondarySteps(flags, result, primary, ctx, completionCtx) {
  const secondary = [];
  const seen = new Set([primary.id]);
  const continueRoute = continueRouteAfterSection(result);
  const streakAtRisk = isStreakAtRisk({
    streakCurrent: result.streak_current,
    practicedToday: Boolean(result.streak_extended || result.daily_goal_just_met),
    localHour: ctx.localHour,
  });

  function push(step) {
    if (!step || seen.has(step.id) || secondary.length >= SECONDARY_LIMIT) return;
    seen.add(step.id);
    secondary.push(step);
  }

  if (flags.dailyGoalNudgeActive && primary.id !== TEACHING_STEP_IDS.DAILY_GOAL) {
    push(buildDailyGoalStep(result, continueRoute, completionCtx));
  }
  if (flags.freshMistakeVisible && primary.id !== TEACHING_STEP_IDS.FRESH_MISTAKE) {
    push(buildFreshMistakeStep(flags.freshMistakeCount));
  }
  if (flags.dueMistakesAtStart > 0 && primary.id !== TEACHING_STEP_IDS.MISTAKE_REVIEW) {
    push(buildMistakeReviewStep(flags.dueMistakesAtStart));
  }
  if (
    flags.dueVocabAtStart > 0 &&
    primary.id !== TEACHING_STEP_IDS.VOCAB_REVIEW &&
    !ctx.microReviewCompleted
  ) {
    push(buildVocabReviewStep(flags.dueVocabAtStart));
  }
  if (flags.focusArea?.typeId && primary.id !== TEACHING_STEP_IDS.FOCUS_AREA) {
    push(buildFocusAreaStep(flags.focusArea));
  }
  if (streakAtRisk && ctx.newsUnreadCount > 0) {
    if (
      ctx.articleMatch &&
      primary.id !== TEACHING_STEP_IDS.READ_MATCHED_ARTICLE
    ) {
      push(buildReadMatchedArticleStep(ctx.articleMatch));
    } else if (primary.id !== TEACHING_STEP_IDS.READ_NEWS) {
      push(buildReadNewsStep(ctx.newsUnreadCount));
    }
  }
  const nextKind = sectionKindFromId(result.next_section_id);
  if (
    ctx.articleMatch &&
    ctx.isVocabLesson &&
    nextKind === "practice" &&
    primary.id !== TEACHING_STEP_IDS.READ_MATCHED_ARTICLE
  ) {
    push(buildReadMatchedArticleStep(ctx.articleMatch));
  }
  if (
    ctx.articleMatch &&
    result.daily_goal_just_met &&
    primary.id === TEACHING_STEP_IDS.PATH
  ) {
    push(buildReadMatchedArticleStep(ctx.articleMatch));
  }
  if (ctx.sessionUnknownWords?.length >= 3 && !ctx.microReviewCompleted) {
    push(buildAiPracticeStep(ctx.sessionUnknownWords));
  }
  if (flags.weeklyGoalNudgeActive) {
    push(buildWeeklyGoalStep(result));
  }
  if (
    primary.id !== TEACHING_STEP_IDS.LEARN_HUB &&
    primary.id !== TEACHING_STEP_IDS.PATH
  ) {
    push(buildLearnHubStep());
  }

  return secondary;
}

/**
 * Build the ordered post-teaching action plan for the summary screen.
 * Linear next-node priority is preserved when the chain is intact.
 */
export function buildPostTeachingPlan({
  result,
  completedSectionId = null,
  freshMistakeCount = 0,
  dueMistakesAtStart = 0,
  dueVocabAtStart = 0,
  focusArea = null,
  unitTitle = "",
  sessionUnknownWords = [],
  microReviewCompleted = false,
  newsUnreadCount = 0,
  localHour = new Date().getHours(),
  isVocabLesson = false,
  lessonWords = [],
  articles = [],
} = {}) {
  if (!result) return null;

  const completionCtx = { completedSectionId, result, perfectLesson: false };
  const flags = resolveNudgeFlags({
    result,
    freshMistakeCount,
    dueMistakesAtStart,
    dueVocabAtStart,
    focusArea,
  });

  const articleMatch =
    isVocabLesson && lessonWords.length >= 2
      ? pickBestArticleForLessonWords(articles, lessonWords)
      : null;

  const ctx = {
    unitTitle,
    sessionUnknownWords,
    microReviewCompleted,
    newsUnreadCount,
    localHour,
    isVocabLesson,
    articleMatch,
  };

  const primary = pickPrimaryStep(flags, result, ctx, completionCtx);
  const secondary = buildSecondarySteps(flags, result, primary, ctx, completionCtx);

  return { primary, secondary };
}

/** Route for the primary CTA on the teaching summary screen. */
export function primaryTeachingStepRoute(plan) {
  return plan?.primary?.route ?? pathRouteWithCurrentFocus();
}

export function isAiPracticeStep(step) {
  return step?.id === TEACHING_STEP_IDS.AI_PRACTICE;
}