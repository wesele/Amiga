import { pathSectionRoute, sectionKindIcon } from "@/modules/learn/pathResume.js";
import { focusPracticeRoute } from "./focusPracticeRoute.js";
import {
  REMAINING_PEEK_LIMIT,
  mistakeContinueLabelKey,
} from "./mistakeReviewContinuation.js";

export const MISTAKE_STEP_IDS = {
  CONTINUE_REVIEW: "continueReview",
  DAILY_GOAL: "dailyGoal",
  NEXT_LESSON: "nextLesson",
  VOCAB_REVIEW: "vocabReview",
  FOCUS_AREA: "focusArea",
  READ_NEWS: "readNews",
  AI_PRACTICE: "aiPractice",
  LEARN_HUB: "learnHub",
  PATH: "path",
};

const SECONDARY_LIMIT = 3;

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

function shouldContinueReviewPrimary(remainingDue, sessionTotal) {
  if (remainingDue <= 0) return false;
  return remainingDue >= sessionTotal;
}

function continueReviewCount(remainingDue, peekLimit = REMAINING_PEEK_LIMIT) {
  return remainingDue >= peekLimit ? peekLimit : remainingDue;
}

function buildContinueReviewStep(remainingDue) {
  const n = continueReviewCount(remainingDue);
  const labelKey = mistakeContinueLabelKey(remainingDue);
  return {
    id: MISTAKE_STEP_IDS.CONTINUE_REVIEW,
    route: null,
    icon: "🔁",
    titleKey: labelKey,
    titleParams: { n },
    subtitleKey: "path.mistakeReviewContinueHint",
    continueKey: labelKey,
    continueParams: { n },
    count: remainingDue,
  };
}

function buildResumeLessonStep(resumeTarget, reviewResult) {
  const remaining = dailyGoalRemainingFromReview(reviewResult);
  const goal = reviewResult?.daily_goal ?? {};
  const done = goal.effective_lessons_today ?? goal.lessons_today ?? 0;
  const total = goal.target_lessons ?? 0;
  return {
    id: MISTAKE_STEP_IDS.NEXT_LESSON,
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
    id: MISTAKE_STEP_IDS.DAILY_GOAL,
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

function buildVocabReviewStep(dueVocabCount) {
  return {
    id: MISTAKE_STEP_IDS.VOCAB_REVIEW,
    route: { name: "vocab-review" },
    icon: "📚",
    titleKey: "path.nextStep.vocabReview",
    titleParams: { n: dueVocabCount },
    subtitleKey: "path.nextStep.afterMistakeVocab",
    continueKey: "path.vocabReviewContinue",
  };
}

function buildFocusAreaStep(focusArea) {
  return {
    id: MISTAKE_STEP_IDS.FOCUS_AREA,
    route: focusPracticeRoute(focusArea.typeId),
    icon: "🎯",
    titleKey: "path.nextStep.focusArea",
    titleParams: { typeId: focusArea.typeId },
    subtitleKey: "path.focusAreaRemainingNudge",
    subtitleParams: {
      typeId: focusArea.typeId,
      pct: focusArea.accuracyPct,
    },
    continueKey: "path.focusAreaContinue",
  };
}

function buildReadNewsStep(newsUnreadCount) {
  return {
    id: MISTAKE_STEP_IDS.READ_NEWS,
    route: { name: "news" },
    icon: "📰",
    titleKey: "path.nextStep.afterMistakeNews",
    subtitleKey: "path.nextStep.afterMistakeNewsHint",
    subtitleParams: { n: newsUnreadCount },
    continueKey: "path.nextStep.afterMistakeNewsContinue",
  };
}

function buildAiPracticeStep(focusArea, weakTypeIds) {
  const typeId = focusArea?.typeId ?? weakTypeIds?.[0];
  if (!typeId) return null;
  return {
    id: MISTAKE_STEP_IDS.AI_PRACTICE,
    route: null,
    contactAction: "aiPractice",
    weakTypeIds: weakTypeIds?.length ? weakTypeIds : [typeId],
    icon: "💬",
    titleKey: "path.nextStep.afterMistakeAi",
    subtitleKey: "path.nextStep.afterMistakeAiHint",
    subtitleParams: { typeId },
    continueKey: "path.nextStep.afterMistakeAiContinue",
  };
}

function buildLearnHubStep() {
  return {
    id: MISTAKE_STEP_IDS.LEARN_HUB,
    route: { name: "learn" },
    icon: "🏠",
    titleKey: "path.nextStep.path",
    subtitleKey: "path.nextStep.pathHint",
    continueKey: "path.mistakeReviewBack",
  };
}

function pickPrimaryStep(ctx) {
  const {
    reviewResult,
    remainingDue,
    sessionTotal,
    dueVocabCount = 0,
    focusArea = null,
    newsUnreadCount = 0,
    resumeTarget = null,
    masteredCount = 0,
    weakTypeIds = [],
  } = ctx;

  if (shouldContinueReviewPrimary(remainingDue, sessionTotal)) {
    return buildContinueReviewStep(remainingDue);
  }
  if (isDailyGoalUnmet(reviewResult) && resumeTarget) {
    return buildResumeLessonStep(resumeTarget, reviewResult);
  }
  if (isDailyGoalUnmet(reviewResult)) {
    return buildDailyGoalPathStep(reviewResult);
  }
  if (dueVocabCount > 0) {
    return buildVocabReviewStep(dueVocabCount);
  }
  if (focusArea?.typeId) {
    return buildFocusAreaStep(focusArea);
  }
  if (newsUnreadCount > 0 && !isDailyGoalUnmet(reviewResult)) {
    return buildReadNewsStep(newsUnreadCount);
  }
  if (masteredCount >= 2) {
    const aiStep = buildAiPracticeStep(focusArea, weakTypeIds);
    if (aiStep) return aiStep;
  }
  return buildLearnHubStep();
}

function buildSecondarySteps(ctx, primary) {
  const {
    reviewResult,
    remainingDue,
    dueVocabCount = 0,
    focusArea = null,
    newsUnreadCount = 0,
    resumeTarget = null,
    masteredCount = 0,
    weakTypeIds = [],
  } = ctx;
  const secondary = [];
  const seen = new Set([primary.id]);

  function push(step) {
    if (!step || seen.has(step.id) || secondary.length >= SECONDARY_LIMIT) return;
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
  if (dueVocabCount > 0) {
    push(buildVocabReviewStep(dueVocabCount));
  }
  if (focusArea?.typeId) {
    push(buildFocusAreaStep(focusArea));
  }
  if (newsUnreadCount > 0 && !isDailyGoalUnmet(reviewResult)) {
    push(buildReadNewsStep(newsUnreadCount));
  }
  if (masteredCount >= 2) {
    push(buildAiPracticeStep(focusArea, weakTypeIds));
  }
  push(buildLearnHubStep());

  return secondary;
}

/**
 * Build the ordered post-mistake-review action plan for the summary screen.
 */
export function buildPostMistakeReviewPlan(ctx = {}) {
  const primary = pickPrimaryStep(ctx);
  const secondary = buildSecondarySteps(ctx, primary);
  return { primary, secondary };
}

/** Whether the step triggers an in-page continue-review action. */
export function isContinueReviewStep(step) {
  return step?.id === MISTAKE_STEP_IDS.CONTINUE_REVIEW;
}

/** Whether the step opens Amiga chat for similar-question practice. */
export function isAiPracticeStep(step) {
  return step?.id === MISTAKE_STEP_IDS.AI_PRACTICE;
}