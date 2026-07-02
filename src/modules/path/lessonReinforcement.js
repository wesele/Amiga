/**
 * Helpers for the in-lesson mistake reinforcement round.
 * After the main question set, learners re-attempt questions they missed
 * before the lesson is submitted — spaced-practice within the session.
 */

export const LESSON_PHASE_MAIN = "main";
export const LESSON_PHASE_REINFORCEMENT = "reinforcement";

export function shouldStartReinforcement(mistakes, phase) {
  return phase === LESSON_PHASE_MAIN && Array.isArray(mistakes) && mistakes.length > 0;
}

export function buildReinforcementQueue(mistakes) {
  if (!Array.isArray(mistakes)) return [];
  return mistakes.map((item) => item?.question).filter(Boolean);
}

export function isLastReinforcementQuestion(index, queueLength) {
  return index >= queueLength - 1;
}

export function reinforcementLabel(index, queueLength) {
  return { current: index + 1, total: queueLength };
}