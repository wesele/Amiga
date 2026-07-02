/** Local hour (0–23) when evening streak-risk messaging starts. */
export const STREAK_RISK_EVENING_HOUR = 18;

export function isStreakAtRisk({
  streakCurrent = 0,
  practicedToday = false,
  localHour = new Date().getHours(),
} = {}) {
  if (!streakCurrent || streakCurrent <= 0) return false;
  if (practicedToday) return false;
  return Number(localHour) >= STREAK_RISK_EVENING_HOUR;
}