import { pathSectionRoute } from "@/modules/learn/pathResume.js";
import { focusPracticeRoute } from "./focusPracticeRoute.js";
import { pathRouteWithCurrentFocus } from "./pathMapScroll.js";
import { analyzeSessionMistakeTypes } from "./sessionMistakeAnalysis.js";

export const RECOVERY_STEP_IDS = {
  GRAMMAR_PREP: "grammarPrep",
  VOCAB_PREP: "vocabPrep",
  FOCUS_AREA: "focusArea",
  RETRY: "retry",
  FRESH_MISTAKE: "freshMistake",
  PATH: "path",
};

const SECONDARY_LIMIT = 3;

function hasUnfinishedPrep(unfinishedPrep, kind) {
  return unfinishedPrep.some((section) => section.kind === kind);
}

function findPrepSection(unfinishedPrep, kind) {
  return unfinishedPrep.find((section) => section.kind === kind) ?? null;
}

function buildRetryStep({ secondary = false } = {}) {
  return {
    id: RECOVERY_STEP_IDS.RETRY,
    route: null,
    icon: "🔄",
    titleKey: secondary ? "path.recoveryStep.retrySecondary" : "path.recoveryStep.retry",
    subtitleKey: secondary ? null : "path.recoveryStep.retryHint",
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
    continueKey: "path.freshMistakeContinue",
  };
}

function buildGrammarPrepStep(prepSection, grammarCount) {
  return {
    id: RECOVERY_STEP_IDS.GRAMMAR_PREP,
    route: pathSectionRoute(prepSection),
    icon: "📖",
    titleKey: "path.recoveryStep.grammarPrep",
    subtitleKey: "path.recoveryStep.grammarPrepHint",
    subtitleParams: { n: grammarCount },
    continueKey: "path.recoveryContinue.grammarPrep",
  };
}

function buildVocabPrepStep(prepSection, vocabCount) {
  return {
    id: RECOVERY_STEP_IDS.VOCAB_PREP,
    route: pathSectionRoute(prepSection),
    icon: "📝",
    titleKey: "path.recoveryStep.vocabPrep",
    subtitleKey: "path.recoveryStep.vocabPrepHint",
    subtitleParams: { n: vocabCount },
    continueKey: "path.recoveryContinue.vocabPrep",
  };
}

function buildFocusAreaStep(focusArea) {
  return {
    id: RECOVERY_STEP_IDS.FOCUS_AREA,
    route: focusPracticeRoute(focusArea.typeId),
    icon: "🎯",
    titleKey: "path.recoveryStep.focusArea",
    titleParams: { typeId: focusArea.typeId },
    subtitleKey: "path.recoveryStep.focusAreaHint",
    subtitleParams: {
      typeId: focusArea.typeId,
      pct: focusArea.accuracyPct,
    },
    typeId: focusArea.typeId,
    accuracyPct: focusArea.accuracyPct,
    continueKey: "path.focusAreaContinue",
  };
}

function buildPathStep() {
  return {
    id: RECOVERY_STEP_IDS.PATH,
    route: pathRouteWithCurrentFocus(),
    icon: "🛤️",
    titleKey: "path.nextStep.path",
    subtitleKey: "path.nextStep.pathHint",
    continueKey: "path.continuePath",
  };
}

function shouldShowFocusAreaRecovery(focusArea, analysis, mistakeCount) {
  if (!focusArea?.typeId || mistakeCount < 2) return false;
  const typeCount = analysis.typeCounts[focusArea.typeId] ?? 0;
  return focusArea.typeId === analysis.dominantType || typeCount >= 3;
}

function pickPrimaryRecoveryStep(ctx, analysis) {
  const {
    unfinishedPrep = [],
    focusArea = null,
    mistakeCount = 0,
    freshMistakeCount = 0,
  } = ctx;

  if (hasUnfinishedPrep(unfinishedPrep, "grammar") && analysis.grammarCount >= 2) {
    return buildGrammarPrepStep(
      findPrepSection(unfinishedPrep, "grammar"),
      analysis.grammarCount,
    );
  }
  if (hasUnfinishedPrep(unfinishedPrep, "vocab") && analysis.vocabCount >= 2) {
    return buildVocabPrepStep(
      findPrepSection(unfinishedPrep, "vocab"),
      analysis.vocabCount,
    );
  }
  if (shouldShowFocusAreaRecovery(focusArea, analysis, mistakeCount)) {
    return buildFocusAreaStep(focusArea);
  }
  if (freshMistakeCount >= 2) {
    return buildFreshMistakeStep(freshMistakeCount);
  }
  return buildRetryStep();
}

function buildSecondaryQueue(primary, ctx, analysis) {
  const {
    unfinishedPrep = [],
    focusArea = null,
    mistakeCount = 0,
    freshMistakeCount = 0,
  } = ctx;
  const steps = [];
  const used = new Set([primary.id]);

  const tryAdd = (step) => {
    if (!step || used.has(step.id) || steps.length >= SECONDARY_LIMIT) return;
    used.add(step.id);
    steps.push(step);
  };

  if (primary.id !== RECOVERY_STEP_IDS.RETRY) {
    tryAdd(buildRetryStep({ secondary: true }));
  }
  if (primary.id !== RECOVERY_STEP_IDS.FRESH_MISTAKE && mistakeCount > 0) {
    const count = freshMistakeCount > 0 ? freshMistakeCount : mistakeCount;
    tryAdd(buildFreshMistakeStep(count));
  }
  if (
    primary.id !== RECOVERY_STEP_IDS.GRAMMAR_PREP
    && hasUnfinishedPrep(unfinishedPrep, "grammar")
    && analysis.grammarCount >= 2
  ) {
    tryAdd(
      buildGrammarPrepStep(
        findPrepSection(unfinishedPrep, "grammar"),
        analysis.grammarCount,
      ),
    );
  }
  if (
    primary.id !== RECOVERY_STEP_IDS.VOCAB_PREP
    && hasUnfinishedPrep(unfinishedPrep, "vocab")
    && analysis.vocabCount >= 2
  ) {
    tryAdd(
      buildVocabPrepStep(findPrepSection(unfinishedPrep, "vocab"), analysis.vocabCount),
    );
  }
  if (
    primary.id !== RECOVERY_STEP_IDS.FOCUS_AREA
    && shouldShowFocusAreaRecovery(focusArea, analysis, mistakeCount)
  ) {
    tryAdd(buildFocusAreaStep(focusArea));
  }
  tryAdd(buildPathStep());

  return steps;
}

/**
 * Build the recovery action plan for a failed lesson summary.
 * Primary targets the most relevant remediation; secondary lists alternate paths.
 */
export function buildFailedLessonPlan({
  mistakeCount = 0,
  freshMistakeCount = 0,
  mistakes = [],
  unfinishedPrep = [],
  focusArea = null,
} = {}) {
  if (mistakeCount === 0) {
    return { primary: buildRetryStep(), secondary: [] };
  }

  const analysis = analyzeSessionMistakeTypes(mistakes);
  const ctx = {
    mistakeCount,
    freshMistakeCount,
    unfinishedPrep,
    focusArea,
  };
  const primary = pickPrimaryRecoveryStep(ctx, analysis);
  const secondary = buildSecondaryQueue(primary, ctx, analysis);

  return { primary, secondary };
}