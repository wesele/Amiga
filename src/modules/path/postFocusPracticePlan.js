import { pathSectionRoute, sectionKindIcon } from "@/modules/learn/pathResume.js";
import { focusPracticeRoute } from "./focusPracticeRoute.js";
import {
  FOCUS_CONTINUE_LABEL_KEY,
  shouldOfferFocusContinuation,
} from "./focusPracticeContinuation.js";

export const FOCUS_STEP_IDS = {
  CONTINUE_FOCUS: "continueFocus",
  NEXT_WEAK: "nextWeak",
  DAILY_GOAL: "dailyGoal",
  NEXT_LESSON: "nextLesson",
  MISTAKE_REVIEW: "mistakeReview",
  VOCAB_REVIEW: "vocabReview",
  READ_NEWS: "readNews",
  AI_PRACTICE: "aiPractice",
  LEARN_HUB: "learnHub",
};

const SECONDARY_LIMIT = 3;

function dailyGoalRemainingFromStreak(streakUpdate) {
  const goal = streakUpdate?.daily_goal;
  if (!goal || streakUpdate?.daily_goal_just_met || goal.goal_met) return 0;
  const done = goal.effective_lessons_today ?? goal.lessons_today ?? 0;
  const target = goal.target_lessons ?? 0;
  return Math.max(0, target - done);
}

function isDailyGoalUnmet(streakUpdate) {
  return dailyGoalRemainingFromStreak(streakUpdate) > 0;
}

function shouldContinueFocusPrimary(progressSummary, roundAccuracyPct, questionCount) {
  if (progressSummary?.graduated) return false;
  return shouldOfferFocusContinuation(questionCount, roundAccuracyPct);
}

function shouldConsolidateFocus(progressSummary, roundAccuracyPct, questionCount) {
  if (progressSummary?.graduated) return false;
  const count = Number(questionCount) || 0;
  if (!count) return false;
  const pct = Number(roundAccuracyPct);
  return Number.isFinite(pct) && pct >= 100;
}

function buildContinueFocusStep(currentTypeId, roundAccuracyPct) {
  return {
    id: FOCUS_STEP_IDS.CONTINUE_FOCUS,
    route: null,
    icon: "🔁",
    titleKey: "path.nextStep.afterFocusContinue",
    titleParams: { typeId: currentTypeId },
    subtitleKey: "path.nextStep.afterFocusContinueHint",
    subtitleParams: { pct: roundAccuracyPct },
    continueKey: FOCUS_CONTINUE_LABEL_KEY,
  };
}

function buildNextWeakStep(nextWeakTypeId, currentTypeId) {
  return {
    id: FOCUS_STEP_IDS.NEXT_WEAK,
    route: focusPracticeRoute(nextWeakTypeId),
    icon: "🎯",
    titleKey: "path.nextStep.afterFocusNextWeak",
    titleParams: { typeId: nextWeakTypeId },
    subtitleKey: "path.nextStep.afterFocusNextWeakHint",
    subtitleParams: { prevTypeId: currentTypeId },
    continueKey: "path.focusPracticeNextWeak",
    continueParams: { typeId: nextWeakTypeId },
  };
}

function buildResumeLessonStep(resumeTarget, streakUpdate) {
  const remaining = dailyGoalRemainingFromStreak(streakUpdate);
  const goal = streakUpdate?.daily_goal ?? {};
  const done = goal.effective_lessons_today ?? goal.lessons_today ?? 0;
  const total = goal.target_lessons ?? 0;
  return {
    id: FOCUS_STEP_IDS.NEXT_LESSON,
    route: pathSectionRoute(resumeTarget.section),
    icon: sectionKindIcon(resumeTarget.section.kind),
    titleKey: "path.nextStep.nextLesson",
    subtitleKey: "path.dailyGoalRemaining",
    subtitleParams: { remaining, done, total },
    continueKey: "path.dailyGoalContinue",
    continueParams: { remaining },
  };
}

function buildDailyGoalPathStep(streakUpdate) {
  const remaining = dailyGoalRemainingFromStreak(streakUpdate);
  const goal = streakUpdate?.daily_goal ?? {};
  const done = goal.effective_lessons_today ?? goal.lessons_today ?? 0;
  const total = goal.target_lessons ?? 0;
  return {
    id: FOCUS_STEP_IDS.DAILY_GOAL,
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

function buildMistakeReviewStep(dueMistakes) {
  return {
    id: FOCUS_STEP_IDS.MISTAKE_REVIEW,
    route: { name: "path-mistake-review" },
    icon: "📝",
    titleKey: "path.nextStep.afterFocusMistake",
    titleParams: { n: dueMistakes },
    subtitleKey: "path.nextStep.afterFocusMistakeHint",
    continueKey: "path.mistakeReviewContinue",
    continueParams: { n: dueMistakes },
  };
}

function buildVocabReviewStep(dueVocabCount) {
  return {
    id: FOCUS_STEP_IDS.VOCAB_REVIEW,
    route: { name: "vocab-review" },
    icon: "📚",
    titleKey: "path.nextStep.afterFocusVocab",
    titleParams: { n: dueVocabCount },
    continueKey: "path.vocabReviewContinue",
  };
}

function buildReadNewsStep(newsUnreadCount) {
  return {
    id: FOCUS_STEP_IDS.READ_NEWS,
    route: { name: "news" },
    icon: "📰",
    titleKey: "path.nextStep.afterFocusNews",
    subtitleKey: "path.nextStep.afterFocusNewsHint",
    subtitleParams: { n: newsUnreadCount },
    continueKey: "path.nextStep.afterMistakeNewsContinue",
  };
}

function buildAiPracticeStep(currentTypeId) {
  if (!currentTypeId) return null;
  return {
    id: FOCUS_STEP_IDS.AI_PRACTICE,
    route: null,
    contactAction: "aiPractice",
    weakTypeIds: [currentTypeId],
    icon: "💬",
    titleKey: "path.nextStep.afterFocusAi",
    titleParams: { typeId: currentTypeId },
    subtitleKey: "path.nextStep.afterFocusAiHint",
    continueKey: "path.nextStep.afterMistakeAiContinue",
  };
}

function buildLearnHubStep() {
  return {
    id: FOCUS_STEP_IDS.LEARN_HUB,
    route: { name: "learn" },
    icon: "🏠",
    titleKey: "path.nextStep.path",
    subtitleKey: "path.nextStep.pathHint",
    continueKey: "path.focusPracticeBack",
  };
}

function pickPrimaryStep(ctx) {
  const {
    streakUpdate,
    progressSummary,
    currentTypeId,
    nextWeakTypeId = null,
    roundAccuracyPct = 0,
    questionCount = 0,
    dueMistakes = 0,
    dueVocabCount = 0,
    newsUnreadCount = 0,
    resumeTarget = null,
  } = ctx;

  if (shouldContinueFocusPrimary(progressSummary, roundAccuracyPct, questionCount)) {
    return buildContinueFocusStep(currentTypeId, roundAccuracyPct);
  }
  if (progressSummary?.graduated && nextWeakTypeId) {
    return buildNextWeakStep(nextWeakTypeId, currentTypeId);
  }
  if (isDailyGoalUnmet(streakUpdate) && resumeTarget) {
    return buildResumeLessonStep(resumeTarget, streakUpdate);
  }
  if (isDailyGoalUnmet(streakUpdate)) {
    return buildDailyGoalPathStep(streakUpdate);
  }
  if (dueMistakes > 0) {
    return buildMistakeReviewStep(dueMistakes);
  }
  if (dueVocabCount > 0) {
    return buildVocabReviewStep(dueVocabCount);
  }
  if (shouldConsolidateFocus(progressSummary, roundAccuracyPct, questionCount)) {
    return buildContinueFocusStep(currentTypeId, roundAccuracyPct);
  }
  if (newsUnreadCount > 0 && !isDailyGoalUnmet(streakUpdate)) {
    return buildReadNewsStep(newsUnreadCount);
  }
  if (progressSummary?.graduated || roundAccuracyPct >= 80) {
    const aiStep = buildAiPracticeStep(currentTypeId);
    if (aiStep) return aiStep;
  }
  return buildLearnHubStep();
}

function buildSecondarySteps(ctx, primary) {
  const {
    streakUpdate,
    progressSummary,
    currentTypeId,
    nextWeakTypeId = null,
    roundAccuracyPct = 0,
    questionCount = 0,
    dueMistakes = 0,
    dueVocabCount = 0,
    newsUnreadCount = 0,
    resumeTarget = null,
  } = ctx;
  const secondary = [];
  const seen = new Set([primary.id]);

  function push(step) {
    if (!step || seen.has(step.id) || secondary.length >= SECONDARY_LIMIT) return;
    seen.add(step.id);
    secondary.push(step);
  }

  if (shouldContinueFocusPrimary(progressSummary, roundAccuracyPct, questionCount)) {
    push(buildContinueFocusStep(currentTypeId, roundAccuracyPct));
  } else if (shouldConsolidateFocus(progressSummary, roundAccuracyPct, questionCount)) {
    push(buildContinueFocusStep(currentTypeId, roundAccuracyPct));
  }
  if (progressSummary?.graduated && nextWeakTypeId) {
    push(buildNextWeakStep(nextWeakTypeId, currentTypeId));
  }
  if (isDailyGoalUnmet(streakUpdate)) {
    push(
      resumeTarget
        ? buildResumeLessonStep(resumeTarget, streakUpdate)
        : buildDailyGoalPathStep(streakUpdate),
    );
  }
  if (dueMistakes > 0) {
    push(buildMistakeReviewStep(dueMistakes));
  }
  if (dueVocabCount > 0) {
    push(buildVocabReviewStep(dueVocabCount));
  }
  if (newsUnreadCount > 0 && !isDailyGoalUnmet(streakUpdate)) {
    push(buildReadNewsStep(newsUnreadCount));
  }
  if (progressSummary?.graduated || roundAccuracyPct >= 80) {
    push(buildAiPracticeStep(currentTypeId));
  }
  push(buildLearnHubStep());

  return secondary;
}

/**
 * Build the ordered post-focus-practice action plan for the summary screen.
 */
export function buildPostFocusPracticePlan(ctx = {}) {
  const primary = pickPrimaryStep(ctx);
  const secondary = buildSecondarySteps(ctx, primary);
  return { primary, secondary };
}

/** Whether the step triggers an in-page continue-practice action. */
export function isContinueFocusStep(step) {
  return step?.id === FOCUS_STEP_IDS.CONTINUE_FOCUS;
}

/** Whether the step navigates to the next weak question type. */
export function isNextWeakStep(step) {
  return step?.id === FOCUS_STEP_IDS.NEXT_WEAK;
}

/** Whether the step opens Amiga chat for similar-question practice. */
export function isAiPracticeStep(step) {
  return step?.id === FOCUS_STEP_IDS.AI_PRACTICE;
}