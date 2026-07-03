import { describe, it, expect, beforeEach } from "vitest";
import {
  loadRecentUnlocks,
  recordAchievementUnlock,
  syncRecentUnlocks,
  loadUnlockedCache,
} from "../achievementRecent.js";

describe("achievementRecent", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("records and deduplicates recent unlocks", () => {
    recordAchievementUnlock("lessons-10", 1000);
    recordAchievementUnlock("streak-7", 2000);
    recordAchievementUnlock("lessons-10", 3000);
    const recent = loadRecentUnlocks(3000);
    expect(recent).toHaveLength(2);
    expect(recent[0].badgeId).toBe("lessons-10");
    expect(recent[1].badgeId).toBe("streak-7");
  });

  it("expires entries after seven days", () => {
    const now = 10_000_000;
    recordAchievementUnlock("lessons-10", now - 8 * 24 * 60 * 60 * 1000);
    recordAchievementUnlock("streak-7", now - 1 * 24 * 60 * 60 * 1000);
    const recent = loadRecentUnlocks(now);
    expect(recent).toHaveLength(1);
    expect(recent[0].badgeId).toBe("streak-7");
  });

  it("syncs newly unlocked badges from cache diff", () => {
    syncRecentUnlocks(["lessons-10"], 1000);
    const recent = syncRecentUnlocks(["lessons-10", "lessons-25"], 2000);
    expect(recent.map((entry) => entry.badgeId)).toEqual(["lessons-25", "lessons-10"]);
    expect(loadUnlockedCache()).toEqual(["lessons-10", "lessons-25"]);
  });
});