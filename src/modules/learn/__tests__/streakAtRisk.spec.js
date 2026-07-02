import { describe, expect, it } from "vitest";
import { isStreakAtRisk, STREAK_RISK_EVENING_HOUR } from "../streakAtRisk.js";

describe("streakAtRisk", () => {
  it("flags evening streak risk when the learner has not practiced today", () => {
    expect(
      isStreakAtRisk({
        streakCurrent: 5,
        practicedToday: false,
        localHour: STREAK_RISK_EVENING_HOUR,
      }),
    ).toBe(true);
    expect(
      isStreakAtRisk({
        streakCurrent: 5,
        practicedToday: false,
        localHour: 19,
      }),
    ).toBe(true);
  });

  it("ignores streak risk before the evening threshold", () => {
    expect(
      isStreakAtRisk({
        streakCurrent: 5,
        practicedToday: false,
        localHour: 17,
      }),
    ).toBe(false);
  });

  it("ignores streak risk when already practiced or streak is zero", () => {
    expect(
      isStreakAtRisk({
        streakCurrent: 5,
        practicedToday: true,
        localHour: 20,
      }),
    ).toBe(false);
    expect(
      isStreakAtRisk({
        streakCurrent: 0,
        practicedToday: false,
        localHour: 20,
      }),
    ).toBe(false);
  });
});