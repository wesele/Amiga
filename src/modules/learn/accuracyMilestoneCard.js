import {
  accuracyMilestoneProgress,
  shouldShowAccuracyMilestoneCard,
} from "@/modules/profile/accuracyMilestones.js";
import { buildPracticeAccuracy } from "@/modules/profile/practiceAccuracy.js";
import { loadBestAccuracy } from "@/modules/profile/accuracyPeakStats.js";

export { shouldShowAccuracyMilestoneCard };

/**
 * Builds accuracy milestone progress for the learn hub card.
 * Requires enough practice attempts before surfacing (same threshold as profile).
 */
export function buildAccuracyMilestoneCard(pairKey) {
  if (!pairKey || !buildPracticeAccuracy(pairKey)) return null;
  return accuracyMilestoneProgress(loadBestAccuracy(pairKey));
}