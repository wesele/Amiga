const snapshots = new Map();

/**
 * Saves a lightweight in-memory session snapshot so SpeakingSummary.vue can display
 * rich structured metrics and coaching cards collected during a Gemini Live session.
 *
 * @param {string|number} sessionId
 * @param {object} data
 * @param {number} [data.turnCount]
 * @param {number} [data.completedGoalsCount]
 * @param {number} [data.totalGoalsCount]
 * @param {number} [data.averageScore]
 * @param {Array} [data.coachingItems]
 */
export function saveLiveSessionSnapshot(sessionId, data = {}) {
  if (!sessionId) return;
  snapshots.set(String(sessionId), {
    turnCount: data.turnCount ?? 0,
    completedGoalsCount: data.completedGoalsCount ?? 0,
    totalGoalsCount: data.totalGoalsCount ?? 3,
    averageScore: data.averageScore ?? 0,
    coachingItems: Array.isArray(data.coachingItems) ? data.coachingItems : [],
  });
}

/**
 * Retrieves the session snapshot for a given sessionId.
 *
 * @param {string|number} sessionId
 * @returns {object|null}
 */
export function getLiveSessionSnapshot(sessionId) {
  if (!sessionId) return null;
  return snapshots.get(String(sessionId)) || null;
}

/**
 * Clears all cached snapshots (useful for tests and cleanup).
 */
export function clearLiveSessionSnapshots() {
  snapshots.clear();
}
