/**
 * Stable keys for practice question enter/leave transitions.
 * Position is included so duplicate question ids still animate between slots.
 */
export function practiceQuestionKey({
  question = null,
  index = 0,
  reinforcementIndex = 0,
  inReinforcement = false,
} = {}) {
  if (!question) return "";
  const position = inReinforcement ? `r${reinforcementIndex}` : `m${index}`;
  const identity = question.id ?? question.type ?? "q";
  return `${position}-${identity}`;
}