import { beforeEach, describe, expect, it, vi } from "vitest";
import { eventBus } from "@/shared/eventBus.js";
import {
  ACHIEVEMENT_ATTENTION_CHANGED,
  clearUnseenUnlocks,
  detectNewAchievementUnlocks,
  markUnseenUnlocks,
  notifyAchievementUnlocks,
  pickPrimaryUnlockBadge,
  unseenAchievementUnlockCount,
} from "../achievementUnlockDetect.js";
import { loadUnlockedCache } from "../achievementRecent.js";

describe("achievementUnlockDetect", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("diffs new unlocks and merges partial ctx with prior cache", () => {
    detectNewAchievementUnlocks({ lessonProgress: { completed: 10 } });
    expect(loadUnlockedCache()).toContain("lessons-10");

    const newly = detectNewAchievementUnlocks({
      vocabStats: { total_known: 100 },
    });
    expect(newly.map((badge) => badge.id)).toEqual(["vocab-100"]);
    expect(loadUnlockedCache()).toContain("lessons-10");
    expect(loadUnlockedCache()).toContain("vocab-100");
  });

  it("tracks unseen unlock count and clears on visit", () => {
    markUnseenUnlocks(["lessons-10"]);
    markUnseenUnlocks(["vocab-100"]);
    expect(unseenAchievementUnlockCount()).toBe(2);
    clearUnseenUnlocks();
    expect(unseenAchievementUnlockCount()).toBe(0);
  });

  it("picks highest-priority badge when multiple unlock", () => {
    const badges = [
      { id: "vocab-100", category: "vocab", icon: "📚", labelKey: "a", labelParams: {} },
      { id: "lessons-10", category: "lessons", icon: "🏆", labelKey: "b", labelParams: {} },
    ];
    const { primary, extraCount } = pickPrimaryUnlockBadge(badges);
    expect(primary.id).toBe("lessons-10");
    expect(extraCount).toBe(1);
  });

  it("notifyAchievementUnlocks marks unseen and emits attention event", () => {
    const handler = vi.fn();
    eventBus.on(ACHIEVEMENT_ATTENTION_CHANGED, handler);
    const badges = notifyAchievementUnlocks({ lessonProgress: { completed: 10 } });
    expect(badges).toHaveLength(1);
    expect(unseenAchievementUnlockCount()).toBe(1);
    expect(handler).toHaveBeenCalled();
  });
});