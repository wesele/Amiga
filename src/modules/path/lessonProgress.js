import { sessionProgress, sessionProgressPct } from "./focusPracticeSession.js";

/**
 * Lesson header progress for the main question round or reinforcement phase.
 */
export function lessonSessionProgress({
  inReinforcement = false,
  index = 0,
  reinforcementIndex = 0,
  totalQuestions = 0,
  reinforcementTotal = 0,
} = {}) {
  if (inReinforcement) {
    return sessionProgress(reinforcementIndex, reinforcementTotal);
  }
  return sessionProgress(index, totalQuestions);
}

export function lessonSessionProgressPct({
  inReinforcement = false,
  index = 0,
  reinforcementIndex = 0,
  totalQuestions = 0,
  reinforcementTotal = 0,
  answered = false,
} = {}) {
  if (inReinforcement) {
    return sessionProgressPct(reinforcementIndex, reinforcementTotal, { answered });
  }
  return sessionProgressPct(index, totalQuestions, { answered });
}