import { readLocalJson, writeLocalJson } from "@/shared/localJsonStore.js";

export const COMBO_STATS_KEY = "lesson_combo_stats_v1";

export function loadBestCombo(pairKey) {
  if (!pairKey) return 0;
  const data = readLocalJson(COMBO_STATS_KEY, {});
  return Math.max(0, Number(data[pairKey]?.best) || 0);
}

/**
 * Updates the stored best combo when comboCount exceeds the previous record.
 * Returns whether this attempt set a new personal best.
 */
export function recordComboAttempt(pairKey, comboCount, now = Date.now()) {
  const prevBest = loadBestCombo(pairKey);
  if (!pairKey || comboCount <= 0) {
    return { prevBest, best: prevBest, isNewBest: false };
  }
  if (comboCount <= prevBest) {
    return { prevBest, best: prevBest, isNewBest: false };
  }

  const data = readLocalJson(COMBO_STATS_KEY, {});
  data[pairKey] = { best: comboCount, updated_at: now };
  writeLocalJson(COMBO_STATS_KEY, data);
  return { prevBest, best: comboCount, isNewBest: true };
}