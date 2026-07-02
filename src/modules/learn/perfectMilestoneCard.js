import {
  perfectMilestoneProgress,
  shouldShowPerfectMilestone,
  shouldShowPerfectMilestoneCard,
} from "./perfectMilestones.js";

export { shouldShowPerfectMilestoneCard };

/**
 * Builds perfect-lesson milestone progress for the learn hub card.
 */
export function buildPerfectMilestoneCard(streak) {
  if (!streak || !shouldShowPerfectMilestone(streak.best)) return null;
  return perfectMilestoneProgress(streak.best);
}