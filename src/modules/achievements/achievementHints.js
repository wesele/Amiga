import { pathSectionRoute } from "@/modules/learn/pathResume.js";

const HINT_KEYS = {
  lessons: "achievements.hintLessons",
  streak: "achievements.hintStreak",
  vocab: "achievements.hintVocab",
  mistakes: "achievements.hintMistakes",
  perfect: "achievements.hintPerfect",
  combo: "achievements.hintCombo",
  accuracy: "achievements.hintAccuracy",
};

const ACTION_KEYS = {
  lessons: "achievements.actionPath",
  streak: "achievements.actionPath",
  vocab: "achievements.actionVocab",
  mistakes: "achievements.actionMistakes",
  perfect: "achievements.actionPath",
  combo: "achievements.actionPath",
  accuracy: "achievements.actionPath",
};

function resolveRoute(category, resumeTarget) {
  if (category === "vocab") return { name: "vocab-review" };
  if (category === "mistakes") return { name: "path-mistake-review" };
  if (category === "streak" && resumeTarget?.section) {
    return pathSectionRoute(resumeTarget.section);
  }
  return { name: "path" };
}

/** Unlock guidance for a locked badge. */
export function achievementUnlockHint(badge, currentValue, { resumeTarget = null } = {}) {
  const remaining = Math.max(0, badge.threshold - (currentValue ?? 0));
  return {
    hintKey: HINT_KEYS[badge.category] ?? "achievements.hintLessons",
    hintParams: { remaining, target: badge.threshold },
    actionKey: ACTION_KEYS[badge.category] ?? "achievements.actionPath",
    route: resolveRoute(badge.category, resumeTarget),
    remaining,
  };
}

export function achievementCategoryCurrentValue(category, ctx) {
  if (category === "lessons") return ctx.lesson?.completed ?? 0;
  if (category === "perfect") return ctx.perfect?.best ?? 0;
  if (category === "streak") return ctx.streak?.current ?? 0;
  if (category === "vocab") return ctx.vocab?.known ?? 0;
  if (category === "mistakes") return ctx.mistake?.mastered ?? 0;
  if (category === "combo") return ctx.combo?.best ?? 0;
  if (category === "accuracy") return ctx.accuracy?.best ?? 0;
  return 0;
}