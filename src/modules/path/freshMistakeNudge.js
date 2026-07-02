import { isDue } from "./mistakeReviewStore.js";

/**
 * Nudge learners to reinforce mistakes produced in the current lesson.
 * Complements mistakeReviewNudge.js, which only covers items due before the session.
 */

export function freshMistakeCountFromSession(sessionMistakeIds, queue, pairKey, now = Date.now()) {
  if (!pairKey || !sessionMistakeIds?.size) return 0;
  const items = Array.isArray(queue) ? queue : [];

  let count = 0;
  for (const entry of items) {
    if (
      entry.pair_key === pairKey &&
      sessionMistakeIds.has(entry.question_id) &&
      isDue(entry, now)
    ) {
      count += 1;
    }
  }
  return count;
}

export function freshMistakeCount(dueNow, dueAtStart) {
  return Math.max(0, (Number(dueNow) || 0) - (Number(dueAtStart) || 0));
}

export function shouldShowFreshMistakeNudge(result, { freshCount = 0 } = {}) {
  if (!result?.passed) return false;
  return Number(freshCount) > 0;
}

export function shouldShowFreshMistakeAction(result, { freshCount = 0 } = {}) {
  return shouldShowFreshMistakeNudge(result, { freshCount });
}

/** Fresh mistake reinforcement on the failed-lesson summary screen. */
export function shouldShowFreshMistakeOnFailure({
  mistakeCount = 0,
  freshCount = 0,
} = {}) {
  return Number(mistakeCount) > 0 && Number(freshCount) > 0;
}

/** Fresh mistakes take the primary CTA when daily goal is already met. */
export function shouldFreshMistakeTakePrimary(result, {
  freshCount = 0,
  dailyGoalNudgeActive = false,
} = {}) {
  if (!shouldShowFreshMistakeNudge(result, { freshCount })) return false;
  return !dailyGoalNudgeActive;
}