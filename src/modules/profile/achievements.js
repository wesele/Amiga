import { LESSON_MILESTONES } from "@/modules/learn/lessonMilestones.js";
import { MISTAKE_MILESTONES } from "@/modules/learn/mistakeMilestones.js";
import { VOCAB_MILESTONES } from "@/modules/learn/vocabMilestones.js";
import { PERFECT_LESSON_MILESTONES } from "@/modules/path/perfectLessonStreak.js";
import { STREAK_MILESTONES } from "@/modules/path/streakMilestone.js";

export function isMilestoneUnlocked(threshold, value) {
  return (value ?? 0) >= threshold;
}

function mapMilestones(milestones, { category, icon, labelKey, value }) {
  return milestones.map((n) => ({
    id: `${category}-${n}`,
    category,
    icon,
    threshold: n,
    unlocked: isMilestoneUnlocked(n, value),
    labelKey,
    labelParams: { n },
  }));
}

export function buildLessonAchievements(completed) {
  return mapMilestones(LESSON_MILESTONES, {
    category: "lessons",
    icon: "🏆",
    labelKey: "profile.achievementLesson",
    value: completed,
  });
}

export function buildPerfectAchievements(bestStreak) {
  return mapMilestones(PERFECT_LESSON_MILESTONES, {
    category: "perfect",
    icon: "✨",
    labelKey: "profile.achievementPerfect",
    value: bestStreak,
  });
}

export function buildStreakAchievements(longestStreak) {
  return mapMilestones(STREAK_MILESTONES, {
    category: "streak",
    icon: "🔥",
    labelKey: "profile.achievementStreak",
    value: longestStreak,
  });
}

export function buildVocabAchievements(totalKnown) {
  return mapMilestones(VOCAB_MILESTONES, {
    category: "vocab",
    icon: "📚",
    labelKey: "profile.achievementVocab",
    value: totalKnown,
  });
}

export function buildMistakeAchievements(mastered) {
  return mapMilestones(MISTAKE_MILESTONES, {
    category: "mistakes",
    icon: "🔁",
    labelKey: "profile.achievementMistake",
    value: mastered,
  });
}

export function buildAchievements({
  lessonProgress = null,
  perfectStreak = null,
  learningStreak = null,
  vocabStats = null,
  mistakeMastery = null,
} = {}) {
  const items = [
    ...buildLessonAchievements(lessonProgress?.completed ?? 0),
    ...buildPerfectAchievements(perfectStreak?.best ?? 0),
    ...buildStreakAchievements(learningStreak?.longest ?? 0),
    ...buildVocabAchievements(vocabStats?.total_known ?? 0),
    ...buildMistakeAchievements(mistakeMastery?.mastered ?? 0),
  ];
  const unlockedCount = items.filter((item) => item.unlocked).length;
  return {
    items,
    unlockedCount,
    totalCount: items.length,
  };
}

export function shouldShowAchievements(achievements) {
  return (achievements?.totalCount ?? 0) > 0;
}