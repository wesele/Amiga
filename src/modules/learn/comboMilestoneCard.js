import { loadBestCombo } from "@/modules/path/lessonComboStats.js";
import {
  comboMilestoneProgress,
  shouldShowComboMilestone,
  shouldShowComboMilestoneCard,
} from "./comboMilestones.js";

export { shouldShowComboMilestoneCard };

/**
 * Builds combo milestone progress for the learn hub card.
 */
export function buildComboMilestoneCard(pairKey) {
  if (!pairKey || !shouldShowComboMilestone(loadBestCombo(pairKey))) return null;
  return comboMilestoneProgress(loadBestCombo(pairKey));
}