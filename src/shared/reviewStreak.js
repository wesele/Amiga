import { recordReviewPractice } from "./api.js";

/** i18n key reused from lesson completion streak celebrations. */
export const REVIEW_STREAK_I18N_KEY = "path.streakExtended";

export function reviewStreakCelebration(streakUpdate, t) {
  if (!streakUpdate?.extended || !t) return "";
  return t(REVIEW_STREAK_I18N_KEY, { n: streakUpdate.current });
}

export async function applyReviewStreak(userId, itemsReviewed, deps = {}) {
  const count = Math.max(1, Number(itemsReviewed) || 0);
  if (!userId) return null;

  const record = deps.recordReviewPractice ?? recordReviewPractice;
  try {
    return await record(userId, count);
  } catch {
    return null;
  }
}