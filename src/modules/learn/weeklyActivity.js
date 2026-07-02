/** i18n keys for weekdays (Mon–Sun), index matches backend `weekday` field. */
export const WEEKDAY_KEYS = [
  "learn.weekdayMon",
  "learn.weekdayTue",
  "learn.weekdayWed",
  "learn.weekdayThu",
  "learn.weekdayFri",
  "learn.weekdaySat",
  "learn.weekdaySun",
];

export function weekdayLabel(weekday, t) {
  const key = WEEKDAY_KEYS[weekday];
  return key ? t(key) : "";
}

export function hasWeeklyActivity(activity) {
  return Array.isArray(activity?.days) && activity.days.length > 0;
}