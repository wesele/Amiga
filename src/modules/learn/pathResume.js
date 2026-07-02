/**
 * Find the learner's current path section from curriculum data.
 * Returns { unit, section } or null when the path is inactive or complete.
 */
export function findCurrentSection(curriculum) {
  if (!curriculum || curriculum.status !== "active") return null;
  for (const unit of curriculum.units) {
    for (const section of unit.sections) {
      if (section.current) {
        return { unit, section };
      }
    }
  }
  return null;
}

/** Whether the current section can be launched directly from the learn hub. */
export function canResumeSection(section) {
  if (!section || section.locked) return false;
  if (section.kind === "practice") return section.question_count > 0;
  return section.kind === "grammar" || section.kind === "vocab";
}

/** i18n key for a section kind label. */
export function sectionKindKey(kind) {
  if (kind === "grammar") return "path.nodeGrammar";
  if (kind === "vocab") return "path.nodeVocab";
  return "path.nodePractice";
}

/** Emoji shown on the continue-learning card. */
export function sectionKindIcon(kind) {
  if (kind === "grammar") return "📖";
  if (kind === "vocab") return "🃏";
  return "⚡";
}

/** Vue-router destination for launching a path section. */
export function pathSectionRoute(section) {
  if (section.kind === "grammar" || section.kind === "vocab") {
    return { name: "path-teaching", params: { nodeId: section.id } };
  }
  return { name: "path-lesson", params: { sectionId: section.id } };
}