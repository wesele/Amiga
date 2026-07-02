import {
  shouldShowStreakMilestone,
  shouldShowStreakMilestoneCard,
  streakMilestoneProgress,
} from "./streakMilestones.js";

export { shouldShowStreakMilestoneCard };

/**
 * Builds streak milestone progress for the learn hub card.
 */
export function buildStreakMilestoneCard(streak) {
  if (!streak || !shouldShowStreakMilestone(streak.current)) return null;
  return streakMilestoneProgress(streak.current, streak.longest);
}