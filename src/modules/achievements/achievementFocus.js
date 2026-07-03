import { lessonMilestoneRingOffset } from "@/modules/learn/lessonMilestones.js";
import { streakMilestoneRingOffset } from "@/modules/learn/streakMilestones.js";
import { vocabMilestoneRingOffset } from "@/modules/learn/vocabMilestones.js";
import { mistakeMilestoneRingOffset } from "@/modules/learn/mistakeMilestones.js";
import { perfectMilestoneRingOffset } from "@/modules/learn/perfectMilestones.js";
import { comboMilestoneRingOffset } from "@/modules/learn/comboMilestones.js";
import { accuracyMilestoneRingOffset } from "@/modules/profile/accuracyMilestones.js";
import {
  achievementCategoryCurrentValue,
  achievementUnlockHint,
} from "./achievementHints.js";

const CATEGORY_PRIORITY = [
  "lessons",
  "streak",
  "vocab",
  "mistakes",
  "perfect",
  "combo",
  "accuracy",
];

const RING_OFFSETS = {
  lessons: lessonMilestoneRingOffset,
  streak: streakMilestoneRingOffset,
  vocab: vocabMilestoneRingOffset,
  mistakes: mistakeMilestoneRingOffset,
  perfect: perfectMilestoneRingOffset,
  combo: comboMilestoneRingOffset,
  accuracy: accuracyMilestoneRingOffset,
};

function ctxKey(category) {
  if (category === "lessons") return "lesson";
  if (category === "mistakes") return "mistake";
  return category;
}

function isFocusCandidate(category, progress) {
  if (!progress) return false;
  if (progress.all_unlocked) return false;
  if (category === "lessons") return progress.next_milestone != null;
  return progress.next_milestone != null;
}

function findBadgeForThreshold(items, category, threshold) {
  return items.find((item) => item.category === category && item.threshold === threshold) ?? null;
}

function pickCategory(candidates) {
  if (!candidates.length) return null;
  const maxPct = Math.max(...candidates.map((item) => item.progress_pct));
  const top = candidates.filter((item) => item.progress_pct === maxPct);
  return CATEGORY_PRIORITY.find((id) => top.some((item) => item.category === id)) ?? top[0].category;
}

/**
 * Pick the badge closest to unlock across all milestone tracks.
 * Returns { category, badge, progress, current, target, remaining, route, actionKey, hintKey, ringOffset } or null.
 */
export function pickNextAchievementFocus(ctx, items, { resumeTarget = null } = {}) {
  const candidates = CATEGORY_PRIORITY.flatMap((category) => {
    const progress = ctx[ctxKey(category)];
    if (!isFocusCandidate(category, progress)) return [];
    return [{
      category,
      progress,
      progress_pct: progress.progress_pct ?? 0,
    }];
  });

  const category = pickCategory(candidates);
  if (!category) return null;

  const progress = ctx[ctxKey(category)];
  const badge = findBadgeForThreshold(items, category, progress.next_milestone);
  if (!badge) return null;

  const current = achievementCategoryCurrentValue(category, ctx);
  const target = progress.next_milestone;
  const remaining = Math.max(0, target - current);
  const hint = achievementUnlockHint(badge, current, { resumeTarget });
  const ringOffsetFn = RING_OFFSETS[category] ?? lessonMilestoneRingOffset;

  return {
    category,
    badge,
    progress,
    current,
    target,
    remaining,
    route: hint.route,
    actionKey: "achievements.nextBadgeAction",
    hintKey: hint.hintKey,
    hintParams: hint.hintParams,
    ringOffset: ringOffsetFn(progress),
  };
}