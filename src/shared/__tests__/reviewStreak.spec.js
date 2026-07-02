import { describe, expect, it, vi } from "vitest";
import {
  REVIEW_STREAK_I18N_KEY,
  applyReviewStreak,
  reviewStreakCelebration,
} from "../reviewStreak.js";

describe("reviewStreak", () => {
  const t = (key, params) => `${key}:${params.n}`;

  it("returns empty celebration when streak was not extended", () => {
    expect(reviewStreakCelebration(null, t)).toBe("");
    expect(reviewStreakCelebration({ extended: false, current: 3 }, t)).toBe("");
  });

  it("builds celebration text when streak extends", () => {
    expect(
      reviewStreakCelebration({ extended: true, current: 5 }, t),
    ).toBe(`${REVIEW_STREAK_I18N_KEY}:5`);
  });

  it("records review practice with at least one item", async () => {
    const recordReviewPractice = vi.fn().mockResolvedValue({ extended: true, current: 2 });
    const result = await applyReviewStreak("u1", 0, { recordReviewPractice });

    expect(recordReviewPractice).toHaveBeenCalledWith("u1", 1);
    expect(result).toEqual({ extended: true, current: 2 });
  });

  it("skips recording without a user id", async () => {
    const recordReviewPractice = vi.fn();
    const result = await applyReviewStreak("", 3, { recordReviewPractice });

    expect(recordReviewPractice).not.toHaveBeenCalled();
    expect(result).toBeNull();
  });

  it("swallows recording errors", async () => {
    const recordReviewPractice = vi.fn().mockRejectedValue(new Error("offline"));
    const result = await applyReviewStreak("u1", 2, { recordReviewPractice });

    expect(result).toBeNull();
  });
});