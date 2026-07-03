/** Estimated minutes for a practice section (45s per question, min 2). */
export function estimatePracticeMinutes(questionCount) {
  if (questionCount <= 0) return 0;
  return Math.max(2, Math.ceil((questionCount * 45) / 60));
}

/** Star thresholds aligned with path.rs::stars_from_score. */
export function starThresholds() {
  return { one: 70, two: 85, three: 100 };
}

/**
 * Display mode for star / pass-line area in the briefing sheet.
 * @param {{ stars?: number, best_score?: number } | null | undefined} section
 */
export function briefingStarDisplay(section) {
  const thresholds = starThresholds();
  if (!section || section.stars === 0) {
    return { mode: "unpassed", thresholds };
  }
  return {
    mode: "passed",
    stars: section.stars,
    bestScore: section.best_score ?? 0,
    thresholds,
  };
}

/**
 * Teaching node id in the same unit (e.g. zh-es/U01-PR01 → zh-es/U01-GRAMMAR).
 * @param {string} sectionId
 * @param {"GRAMMAR" | "VOCAB"} kind
 */
export function prepTeachingNodeId(sectionId, kind) {
  if (!sectionId || !kind) return null;
  const dash = sectionId.lastIndexOf("-");
  if (dash < 0) return null;
  return `${sectionId.slice(0, dash)}-${kind}`;
}

/**
 * Grammar/vocab prep sections in the same unit that are unlocked but not completed.
 * @param {{ sections?: Array<{ kind: string, stars: number, locked: boolean }> } | null} unit
 * @param {{ kind?: string } | null} section
 */
export function findUnfinishedPrepSections(unit, section) {
  if (!unit?.sections || section?.kind !== "practice") return [];
  return unit.sections.filter(
    (s) => (s.kind === "grammar" || s.kind === "vocab") && s.stars === 0 && !s.locked,
  );
}

/** Whether a map node click should open the briefing sheet instead of launching. */
export function shouldShowNodeBriefing({ fromJumpFab, fromContinue, fromPostLesson } = {}) {
  if (fromJumpFab || fromContinue || fromPostLesson) return false;
  return true;
}

/** Whether the section is eligible for a briefing preview (not locked / empty). */
export function isBriefingEligible(section) {
  if (!section || section.locked) return false;
  if (section.kind === "practice") return section.question_count > 0;
  return section.kind === "grammar" || section.kind === "vocab";
}

/** Slice teaching content for practice briefing chips. */
export function prepBriefingChips(teaching) {
  if (!teaching) return { grammarPoints: [], words: [] };
  return {
    grammarPoints: (teaching.grammar_points ?? []).slice(0, 2),
    words: (teaching.words ?? []).slice(0, 4).map((w) => w.word ?? w),
  };
}