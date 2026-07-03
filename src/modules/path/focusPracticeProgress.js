import {
  MAX_ACCURACY_FOR_FOCUS,
  MIN_ATTEMPTS_FOR_FOCUS,
  TRACKED_QUESTION_TYPES,
  typeAccuracyPct,
  typeAttempts,
} from "@/modules/learn/questionTypeStats.js";
import { shouldOfferFocusContinuation } from "./focusPracticeContinuation.js";

export const WEAK_AREA_GRADUATION_PCT = MAX_ACCURACY_FOR_FOCUS;

export function snapshotTypeAccuracy(stats, typeId) {
  return typeAccuracyPct(stats?.[typeId]);
}

export function focusPracticeProgressSummary({
  beforePct,
  afterPct,
  graduationPct = WEAK_AREA_GRADUATION_PCT,
}) {
  const delta = afterPct - beforePct;
  const graduated = afterPct > graduationPct;
  const progressPct = graduated
    ? 100
    : Math.min(100, Math.round((afterPct / graduationPct) * 100));
  const remainingPct = graduated ? 0 : Math.max(0, graduationPct - afterPct);

  return {
    beforePct,
    afterPct,
    delta,
    graduated,
    progressPct,
    remainingPct,
    graduationPct,
  };
}

export function weakAreaGraduationProgress(
  accuracyPct,
  graduationPct = WEAK_AREA_GRADUATION_PCT,
) {
  const pct = Math.max(0, Math.min(100, accuracyPct ?? 0));
  const graduated = pct > graduationPct;
  return {
    graduated,
    progressPct: graduated ? 100 : Math.min(100, Math.round((pct / graduationPct) * 100)),
    remainingPct: graduated ? 0 : Math.max(0, graduationPct - pct),
    graduationPct,
  };
}

export function pickPostGraduationTypeId(
  stats,
  excludeTypeId,
  {
    minAttempts = MIN_ATTEMPTS_FOR_FOCUS,
    maxAccuracyPct = MAX_ACCURACY_FOR_FOCUS,
  } = {},
) {
  if (!stats || typeof stats !== "object") return null;

  let weakest = null;

  for (const typeId of TRACKED_QUESTION_TYPES) {
    if (typeId === excludeTypeId) continue;

    const record = stats[typeId];
    const attempts = typeAttempts(record);
    if (attempts < minAttempts) continue;

    const accuracyPct = typeAccuracyPct(record);
    if (accuracyPct > maxAccuracyPct) continue;

    if (
      !weakest ||
      accuracyPct < weakest.accuracyPct ||
      (accuracyPct === weakest.accuracyPct && attempts > weakest.attempts)
    ) {
      weakest = { typeId, accuracyPct, attempts };
    }
  }

  return weakest?.typeId ?? null;
}

export function shouldCelebrateGraduation(summary) {
  return Boolean(
    summary?.graduated && summary.beforePct <= WEAK_AREA_GRADUATION_PCT,
  );
}

export function resolveFocusSummaryCtas(
  summary,
  { hasNextWeak, roundAccuracyPct, questionCount },
) {
  if (summary?.graduated) {
    if (hasNextWeak) {
      return { primary: "nextWeak", showContinueRound: false };
    }
    return { primary: "back", showContinueRound: false };
  }

  const showContinueRound = shouldOfferFocusContinuation(
    questionCount,
    roundAccuracyPct,
  );
  return {
    primary: showContinueRound ? "continue" : "back",
    showContinueRound,
  };
}

