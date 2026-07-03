export const ACHIEVEMENT_CATEGORIES = [
  { id: "lessons", icon: "🏆", labelKey: "achievements.catLessons" },
  { id: "streak", icon: "🔥", labelKey: "achievements.catStreak" },
  { id: "vocab", icon: "📚", labelKey: "achievements.catVocab" },
  { id: "mistakes", icon: "🔁", labelKey: "achievements.catMistakes" },
  { id: "perfect", icon: "✨", labelKey: "achievements.catPerfect" },
  { id: "combo", icon: "🔥", labelKey: "achievements.catCombo" },
  { id: "accuracy", icon: "🎯", labelKey: "achievements.catAccuracy" },
];

/** Group badge items by category with unlocked/total counts. */
export function groupAchievements(items) {
  return ACHIEVEMENT_CATEGORIES.map((category) => {
    const badges = items.filter((item) => item.category === category.id);
    return {
      category,
      unlocked: badges.filter((item) => item.unlocked).length,
      total: badges.length,
      badges,
    };
  }).filter((group) => group.total > 0);
}