import { readLocalJson, writeLocalJson } from "@/shared/localJsonStore.js";

export const MISTAKE_MASTERY_STATS_KEY = "mistake_mastery_stats_v1";

export function loadMistakeMasteryStats(pairKey) {
  if (!pairKey) return 0;
  const data = readLocalJson(MISTAKE_MASTERY_STATS_KEY, {});
  return Math.max(0, Number(data[pairKey]?.mastered) || 0);
}

export function recordMistakesMastered(pairKey, count, now = Date.now()) {
  if (!pairKey || count <= 0) {
    return { prev: loadMistakeMasteryStats(pairKey), next: loadMistakeMasteryStats(pairKey) };
  }

  const data = readLocalJson(MISTAKE_MASTERY_STATS_KEY, {});
  const prev = Math.max(0, Number(data[pairKey]?.mastered) || 0);
  const next = prev + count;
  data[pairKey] = { mastered: next, updated_at: now };
  writeLocalJson(MISTAKE_MASTERY_STATS_KEY, data);
  return { prev, next };
}