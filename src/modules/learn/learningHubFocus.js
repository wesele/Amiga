import { focusPracticeRoute } from "@/modules/path/focusPracticeRoute.js";
import { pathSectionRoute, sectionKindIcon } from "./pathResume.js";
import { isStreakAtRisk } from "./streakAtRisk.js";

export const FOCUS_IDS = {
  STREAK_AT_RISK: "streakAtRisk",
  CONTINUE_SECTION: "continueSection",
  MISTAKE_REVIEW: "mistakeReview",
  VOCAB_REVIEW: "vocabReview",
  FOCUS_PRACTICE: "focusPractice",
  DAILY_GOAL: "dailyGoal",
  EXPLORE_PATH: "explorePath",
};

function resolveStreakAtRiskAction(ctx) {
  const { dailyGoal, resumeTarget, dueMistakes = 0, dueVocabWords = [] } = ctx;
  const goalMet = Boolean(dailyGoal?.goal_met);

  if (!goalMet && resumeTarget) {
    return {
      id: FOCUS_IDS.CONTINUE_SECTION,
      route: pathSectionRoute(resumeTarget.section),
    };
  }
  if (!goalMet) {
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
    showAccuracy = false,
    showCombo = false,
    showPerfect = false,
    showPerfectStreak = false,
    showFocusArea = false,
  } = ctx;

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