export const RECOVERY_STEP_IDS = {
  RETRY: "retry",
  FRESH_MISTAKE: "freshMistake",
  PATH: "path",
};

function buildRetryStep() {
  return {
    id: RECOVERY_STEP_IDS.RETRY,
    route: null,
    icon: "🔄",
    titleKey: "path.recoveryStep.retry",
    subtitleKey: "path.recoveryStep.retryHint",
    continueKey: "path.retry",
  };
}

function buildFreshMistakeStep(count) {
  return {
    id: RECOVERY_STEP_IDS.FRESH_MISTAKE,
    route: { name: "path-mistake-review" },
    icon: "🔁",
    titleKey: "path.recoveryStep.freshMistake",
    titleParams: { n: count },
    count,
  };
}

/**
 * Build the recovery action plan for a failed lesson summary.
 * Primary is always retry; secondary lists mistake reinforcement when applicable.
 */
export function buildFailedLessonPlan({
  mistakeCount = 0,
  freshMistakeCount = 0,
} = {}) {
  const primary = buildRetryStep();
  const secondary = [];

  if (mistakeCount > 0) {
    const count = freshMistakeCount > 0 ? freshMistakeCount : mistakeCount;
    secondary.push(buildFreshMistakeStep(count));
  }

  return { primary, secondary };
}