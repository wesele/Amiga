import { readLocalJson, writeLocalJson } from "@/shared/localJsonStore.js";
import {
  MIN_ATTEMPTS_FOR_ACCURACY,
  buildPracticeAccuracy,
} from "./practiceAccuracy.js";

export const ACCURACY_PEAK_KEY = "accuracy_peak_stats_v1";

export function loadBestAccuracy(pairKey) {
  if (!pairKey) return 0;
  const data = readLocalJson(ACCURACY_PEAK_KEY, {});
  return Math.max(0, Number(data[pairKey]?.best) || 0);
}

/**
 * Updates stored peak accuracy when the rolling average exceeds the previous record.
 * Requires enough attempts before recording (same threshold as profile display).
 */
export function recordAccuracyPeak(
  pairKey,
  { minAttempts = MIN_ATTEMPTS_FOR_ACCURACY, now = Date.now() } = {},
) {
  const prevBest = loadBestAccuracy(pairKey);
  if (!pairKey) {
    return { prevBest, best: prevBest, isNewPeak: false };
  }

  const accuracy = buildPracticeAccuracy(pairKey, { minAttempts });
  if (!accuracy) {
    return { prevBest, best: prevBest, isNewPeak: false };
  }

  if (accuracy.accuracyPct <= prevBest) {
    return { prevBest, best: prevBest, isNewPeak: false };
  }

  const data = readLocalJson(ACCURACY_PEAK_KEY, {});
  data[pairKey] = { best: accuracy.accuracyPct, updated_at: now };
  writeLocalJson(ACCURACY_PEAK_KEY, data);
  return { prevBest, best: accuracy.accuracyPct, isNewPeak: true };
}