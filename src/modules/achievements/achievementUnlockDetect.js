import { eventBus } from "@/shared/eventBus.js";
import { getStreakMilestone } from "@/modules/path/streakMilestone.js";
import { buildAchievements } from "./achievements.js";
import { syncRecentUnlocks, loadUnlockedCache } from "./achievementRecent.js";

export const ACHIEVEMENT_ATTENTION_CHANGED = "achievement-attention-changed";

const UNSEEN_KEY = "amiga:achievement-unseen";

const CATEGORY_PRIORITY = [
  "lessons",
  "streak",
  "vocab",
  "mistakes",
  "perfect",
  "combo",
  "accuracy",
];

function readUnseen() {
  try {
    const raw = localStorage.getItem(UNSEEN_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeUnseen(ids) {
  localStorage.setItem(UNSEEN_KEY, JSON.stringify(ids));
}

export function markUnseenUnlocks(badgeIds) {
  const unseen = readUnseen();
  const merged = [...new Set([...unseen, ...badgeIds.filter(Boolean)])];
  writeUnseen(merged);
}

export function unseenAchievementUnlockCount() {
  return readUnseen().length;
}

export function clearUnseenUnlocks() {
  writeUnseen([]);
}

/**
 * Diff current unlocked badges against cache; sync recent strip and return new unlocks.
 * Partial ctx is safe: merged with prior cache so other tracks are not dropped.
 */
export function detectNewAchievementUnlocks(ctx, prevUnlockedIds = loadUnlockedCache()) {
  const achievements = buildAchievements(ctx);
  const prev = new Set(prevUnlockedIds);
  const currentUnlocked = achievements.items.filter((item) => item.unlocked);
  const newlyUnlocked = currentUnlocked.filter((item) => !prev.has(item.id));
  const mergedIds = [
    ...new Set([...prevUnlockedIds, ...currentUnlocked.map((item) => item.id)]),
  ];
  syncRecentUnlocks(mergedIds);
  return newlyUnlocked;
}

export function pickPrimaryUnlockBadge(badges) {
  if (!badges?.length) return { primary: null, extraCount: 0 };
  const sorted = [...badges].sort(
    (a, b) =>
      CATEGORY_PRIORITY.indexOf(a.category) - CATEGORY_PRIORITY.indexOf(b.category),
  );
  return { primary: sorted[0], extraCount: Math.max(0, sorted.length - 1) };
}

/** Detect unlocks, mark nav unseen, emit shell refresh. Returns newly unlocked badges. */
export function notifyAchievementUnlocks(ctx) {
  const badges = detectNewAchievementUnlocks(ctx);
  if (!badges.length) return [];
  markUnseenUnlocks(badges.map((badge) => badge.id));
  eventBus.emit(ACHIEVEMENT_ATTENTION_CHANGED);
  return badges;
}

export function buildLessonSettlementAchievementCtx(result) {
  if (!result?.passed) return null;
  const ctx = {};
  if (result.lesson_milestone_reached) {
    ctx.lessonProgress = { completed: result.lesson_milestone_reached };
  }
  if (result.perfect_lesson_milestone_reached) {
    ctx.perfectStreak = { best: result.perfect_lesson_milestone_reached };
  }
  const streakMilestone = getStreakMilestone(
    result.streak_current,
    result.streak_extended,
  );
  if (streakMilestone) {
    ctx.learningStreak = { longest: streakMilestone };
  }
  return Object.keys(ctx).length ? ctx : null;
}