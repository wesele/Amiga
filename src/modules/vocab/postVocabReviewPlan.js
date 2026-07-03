import { pathSectionRoute, sectionKindIcon } from "@/modules/learn/pathResume.js";
import {
  REMAINING_PEEK_LIMIT,
  vocabContinueLabelKey,
} from "./vocabReviewContinuation.js";

export const VOCAB_STEP_IDS = {
  CONTINUE_REVIEW: "continueReview",
  BACK_TO_NEWS: "backToNews",
  NEXT_ARTICLE: "nextArticle",
  DAILY_GOAL: "dailyGoal",
  NEXT_LESSON: "nextLesson",
  AI_PRACTICE: "aiPractice",
  LEARN_HUB: "learnHub",
  PATH: "path",
};

function dailyGoalRemainingFromReview(reviewResult) {
  const goal = reviewResult?.daily_goal;
  if (!goal || reviewResult?.daily_goal_just_met || goal.goal_met) return 0;
  const done = goal.effective_lessons_today ?? goal.lessons_today ?? 0;
  const target = goal.target_lessons ?? 0;
  return Math.max(0, target - done);
}

function isDailyGoalUnmet(reviewResult) {
  return dailyGoalRemainingFromReview(reviewResult) > 0;
}

function shouldContinueReviewPrimary(remainingDue, sessionWordCount) {
  if (remainingDue <= 0) return false;
  return remainingDue >= sessionWordCount;
}

function continueReviewCount(remainingDue, peekLimit = REMAINING_PEEK_LIMIT) {
  return remainingDue >= peekLimit ? peekLimit : remainingDue;
}

function buildContinueReviewStep(remainingDue) {
  const n = continueReviewCount(remainingDue);
  const labelKey = vocabContinueLabelKey(remainingDue);
  return {
    id: VOCAB_STEP_IDS.CONTINUE_REVIEW,
    route: null,
    icon: "📚",
    titleKey: labelKey,
    titleParams: { n },
    subtitleKey: "vocab.reviewContinueHint",
    continueKey: labelKey,
    continueParams: { n },
    count: remainingDue,
  };
}

function buildBackToNewsStep(newsUnreadCount) {
  return {
    id: VOCAB_STEP_IDS.BACK_TO_NEWS,
    route: { name: "news" },
    icon: "📰",
    titleKey: "vocab.nextStep.backToNews",
    subtitleKey: "vocab.nextStep.backToNewsHint",
    subtitleParams: { n: newsUnreadCount },
    continueKey: "vocab.nextStep.backToNewsContinue",
  };
}

function buildResumeLessonStep(resumeTarget, reviewResult) {
  const remaining = dailyGoalRemainingFromReview(reviewResult);
  const goal = reviewResult?.daily_goal ?? {};
  const done = goal.effective_lessons_today ?? goal.lessons_today ?? 0;
  const total = goal.target_lessons ?? 0;
  return {
    id: VOCAB_STEP_IDS.NEXT_LESSON,
    route: pathSectionRoute(resumeTarget.section),
    icon: sectionKindIcon(resumeTarget.section.kind),
    titleKey: "path.nextStep.nextLesson",
    subtitleKey: "path.dailyGoalRemaining",
    subtitleParams: { remaining, done, total },
    continueKey: "path.dailyGoalContinue",
    continueParams: { remaining },
  };
}

function buildDailyGoalPathStep(reviewResult) {
  const remaining = dailyGoalRemainingFromReview(reviewResult);
  const goal = reviewResult?.daily_goal ?? {};
  const done = goal.effective_lessons_today ?? goal.lessons_today ?? 0;
  const total = goal.target_lessons ?? 0;
  return {
    id: VOCAB_STEP_IDS.DAILY_GOAL,
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

function buildAiPracticeStep(reviewedWords) {
  const words = reviewedWords.filter(Boolean);
  const preview = words.slice(0, 3).join(", ");
  return {
    id: VOCAB_STEP_IDS.AI_PRACTICE,
    route: null,
    contactAction: "aiPractice",
    reviewedWords: words,
    icon: "💬",
    titleKey: "vocab.nextStep.aiPractice",
    subtitleKey: "vocab.nextStep.aiPracticeHint",
    subtitleParams: { preview },
    continueKey: "vocab.nextStep.aiPracticeContinue",
  };
}

function buildLearnHubStep() {
  return {
    id: VOCAB_STEP_IDS.LEARN_HUB,
    route: { name: "learn" },
    icon: "🏠",
    titleKey: "vocab.nextStep.learnHub",
    subtitleKey: "vocab.nextStep.learnHubHint",
    continueKey: "vocab.reviewBack",
  };
}

function pickPrimaryStep(ctx) {
  const {
    reviewResult,
    remainingDue,
    fromReading,
    sessionWordCount,
    masteredCount,
    reviewedWords,
    newsUnreadCount,
    resumeTarget,
  } = ctx;

  if (shouldContinueReviewPrimary(remainingDue, sessionWordCount)) {
    return buildContinueReviewStep(remainingDue);
  }
  if (fromReading && newsUnreadCount > 0) {
    return buildBackToNewsStep(newsUnreadCount);
  }
  if (isDailyGoalUnmet(reviewResult) && resumeTarget) {
    return buildResumeLessonStep(resumeTarget, reviewResult);
  }
  if (isDailyGoalUnmet(reviewResult)) {
    return buildDailyGoalPathStep(reviewResult);
  }
  if (fromReading && masteredCount >= 3 && reviewedWords.length > 0) {
    return buildAiPracticeStep(reviewedWords);
  }
  return buildLearnHubStep();
}

function buildSecondarySteps(ctx, primary) {
  const {
    reviewResult,
    remainingDue,
    fromReading,
    masteredCount,
    reviewedWords,
    newsUnreadCount,
    resumeTarget,
  } = ctx;
  const secondary = [];
  const seen = new Set([primary.id]);

  function push(step) {
    if (!step || seen.has(step.id)) return;
    seen.add(step.id);
    secondary.push(step);
  }

  if (remainingDue > 0) {
    push(buildContinueReviewStep(remainingDue));
  }
  if (isDailyGoalUnmet(reviewResult)) {
    push(
      resumeTarget
        ? buildResumeLessonStep(resumeTarget, reviewResult)
        : buildDailyGoalPathStep(reviewResult),
    );
  }
  if (fromReading && newsUnreadCount > 0) {
    push(buildBackToNewsStep(newsUnreadCount));
  }
  if (masteredCount >= 3 && reviewedWords.length > 0) {
    push(buildAiPracticeStep(reviewedWords));
  }
  push(buildLearnHubStep());

  return secondary;
}

/**
 * Build the ordered post-vocab-review action plan for the summary screen.
 */
export function buildPostVocabReviewPlan(ctx = {}) {
  const primary = pickPrimaryStep(ctx);
  const secondary = buildSecondarySteps(ctx, primary);
  return { primary, secondary };
}

/** Whether the primary step triggers an in-page continue-review action. */
export function isContinueReviewStep(step) {
  return step?.id === VOCAB_STEP_IDS.CONTINUE_REVIEW;
}

/** Whether the primary step opens Amiga chat with reviewed words. */
export function isAiPracticeStep(step) {
  return step?.id === VOCAB_STEP_IDS.AI_PRACTICE;
}