/**
 * Pick the authoritative learning goal for a target language.
 * When duplicate rows exist, the row with the highest id wins (matches
 * update_learning_goal_cefr which updates the latest row).
 */
export function pickLearningGoal(goals, targetLang) {
  if (!Array.isArray(goals) || !targetLang) return null;
  let best = null;
  for (const goal of goals) {
    if (goal.target_language !== targetLang) continue;
    if (!best || (goal.id ?? 0) > (best.id ?? 0)) best = goal;
  }
  return best;
}