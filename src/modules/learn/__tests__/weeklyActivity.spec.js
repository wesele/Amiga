import { describe, expect, it } from "vitest";
import {
  WEEKDAY_KEYS,
  hasWeeklyActivity,
  weekdayLabel,
} from "../weeklyActivity.js";

describe("weeklyActivity", () => {
  const t = (key) => {
    const labels = {
      "learn.weekdayMon": "一",
      "learn.weekdayTue": "二",
      "learn.weekdayWed": "三",
      "learn.weekdayThu": "四",
      "learn.weekdayFri": "五",
      "learn.weekdaySat": "六",
      "learn.weekdaySun": "日",
    };
    return labels[key] || key;
  };

  it("maps weekday index to i18n label", () => {
    expect(weekdayLabel(0, t)).toBe("一");
    expect(weekdayLabel(6, t)).toBe("日");
  });

  it("exposes seven weekday keys", () => {
    expect(WEEKDAY_KEYS).toHaveLength(7);
  });

  it("detects valid weekly activity payload", () => {
    expect(hasWeeklyActivity(null)).toBe(false);
    expect(hasWeeklyActivity({ days: [] })).toBe(false);
    expect(
      hasWeeklyActivity({
        days: [{ date: "2026-07-02", weekday: 3, active: true, is_today: true }],
        active_days: 1,
      }),
    ).toBe(true);
  });
});