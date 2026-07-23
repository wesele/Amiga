export const WEEK_COUNT = 12;
export const DAYS_PER_WEEK = 7;

export function formatLocalDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function startOfWeek(date) {
  const result = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const mondayOffset = (result.getDay() + 6) % 7;
  result.setDate(result.getDate() - mondayOffset);
  return result;
}

export function createAchievementMatrix(records = [], today = new Date()) {
  const currentWeek = startOfWeek(today);
  const firstDay = new Date(currentWeek);
  firstDay.setDate(firstDay.getDate() - (WEEK_COUNT - 1) * DAYS_PER_WEEK);
  const byDate = new Map(records.map((record) => [record.date, record]));
  const weeks = [];

  for (let weekIndex = 0; weekIndex < WEEK_COUNT; weekIndex += 1) {
    const weekStart = new Date(firstDay);
    weekStart.setDate(firstDay.getDate() + weekIndex * DAYS_PER_WEEK);
    const days = [];
    for (let dayIndex = 0; dayIndex < DAYS_PER_WEEK; dayIndex += 1) {
      const date = new Date(weekStart);
      date.setDate(weekStart.getDate() + dayIndex);
      const dateKey = formatLocalDate(date);
      const record = byDate.get(dateKey) || {};
      days.push({
        date: dateKey,
        isFuture: date > today,
        appOpen: record.app_open || 0,
        reading: record.reading_count || (record.reading_am > 0 || record.reading_pm > 0 ? (record.reading_am > 0 && record.reading_pm > 0 ? 2 : 1) : 0),
        newsCount: record.news_count || 0,
        soulmateStatus: record.soulmate_status || 0,
        readingAm: record.reading_am || 0,
        readingPm: record.reading_pm || 0,
        speakingCount: record.speaking_count || 0,
      });
    }
    weeks.push({ start: formatLocalDate(weekStart), days });
  }

  return {
    startDate: formatLocalDate(firstDay),
    endDate: formatLocalDate(new Date(currentWeek.getFullYear(), currentWeek.getMonth(), currentWeek.getDate() + 6)),
    weeks,
  };
}

export function readingLevel(value) {
  if (value >= 2) return "complete";
  if (value >= 1) return "active";
  return "empty";
}

export function newsLevel(value) {
  if (value >= 2) return "complete";
  if (value >= 1) return "active";
  return "empty";
}

export function speakingLevel(value) {
  if (value >= 2) return "complete";
  if (value >= 1) return "active";
  return "empty";
}

export function appOpenLevel(value) {
  if (value >= 2) return "complete";
  if (value >= 1) return "active";
  return "empty";
}

export function soulmateLevel(value) {
  if (value >= 2) return "complete";
  if (value >= 1) return "active";
  return "empty";
}
