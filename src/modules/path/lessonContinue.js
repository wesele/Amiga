import { pathSectionRoute } from "@/modules/learn/pathResume.js";

/** Infer section kind from the canonical path node id. */
export function sectionKindFromId(sectionId) {
  const id = String(sectionId ?? "").trim();
  if (!id) return null;
  if (id.endsWith("-GRAMMAR")) return "grammar";
  if (id.endsWith("-VOCAB")) return "vocab";
  return "practice";
}

/**
 * Vue-router destination for the next path node after a passing lesson,
 * or null when the learner should return to the path map.
 */
export function continueRouteAfterLesson(result) {
  if (!result?.passed || result.level_upgraded) return null;
  const sectionId = String(result.next_section_id ?? "").trim();
  if (!sectionId) return null;
  const kind = sectionKindFromId(sectionId);
  if (!kind) return null;
  return pathSectionRoute({ id: sectionId, kind });
}

export function shouldContinueToNextLesson(result) {
  return continueRouteAfterLesson(result) != null;
}