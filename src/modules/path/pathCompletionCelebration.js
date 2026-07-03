import { PATH_FOCUS_QUERY } from "./pathMapScroll.js";
import { sectionKindFromId } from "./lessonContinue.js";

export const CELEBRATE_QUERY = "celebrate";
export const CELEBRATION_DURATION_MS = 1800;

const VALID_KINDS = new Set(["grammar", "vocab", "practice"]);

/**
 * @typedef {object} PathCompletionCelebration
 * @property {string} sectionId
 * @property {'grammar'|'vocab'|'practice'} kind
 * @property {number} stars
 * @property {boolean} [perfect]
 * @property {boolean} [unitComplete]
 * @property {string} [unitTitle]
 */

/** Build a path-map route that carries celebration context for a just-completed node. */
export function pathRouteWithCelebration(payload) {
  if (!payload?.sectionId) {
    return { name: "path", query: { focus: PATH_FOCUS_QUERY } };
  }
  return {
    name: "path",
    query: {
      focus: PATH_FOCUS_QUERY,
      [CELEBRATE_QUERY]: payload.sectionId,
      stars: String(payload.stars ?? 0),
      kind: payload.kind,
      ...(payload.perfect ? { perfect: "1" } : {}),
      ...(payload.unitComplete ? { unit: "1", unitTitle: payload.unitTitle ?? "" } : {}),
    },
  };
}

/** Route to the path map with celebration when completion context is available. */
export function pathRouteForCompletion({ completedSectionId, result, perfectLesson = false } = {}) {
  if (!completedSectionId || !result?.passed) {
    return { name: "path", query: { focus: PATH_FOCUS_QUERY } };
  }
  return pathRouteWithCelebration({
    sectionId: completedSectionId,
    kind: sectionKindFromId(completedSectionId) ?? "practice",
    stars: result.stars ?? 0,
    perfect: perfectLesson,
  });
}

/** Parse celebration payload from route query; returns null when invalid or missing. */
export function parseCelebrationQuery(query) {
  const sectionId = String(query?.[CELEBRATE_QUERY] ?? "").trim();
  if (!sectionId) return null;

  const kind = String(query?.kind ?? "").trim();
  if (!VALID_KINDS.has(kind)) return null;

  const starsRaw = parseInt(String(query?.stars ?? "0"), 10);
  const stars = Number.isFinite(starsRaw) ? Math.min(3, Math.max(0, starsRaw)) : 0;

  return {
    sectionId,
    kind,
    stars,
    perfect: query?.perfect === "1",
    unitComplete: query?.unit === "1",
    unitTitle: String(query?.unitTitle ?? "").trim() || undefined,
  };
}

/** Locate the unit and section for a path node id. */
export function findSectionUnit(curriculum, sectionId) {
  if (!curriculum?.units || !sectionId) return null;
  for (const unit of curriculum.units) {
    const section = unit.sections?.find((s) => s.id === sectionId);
    if (section) return { unit, section };
  }
  return null;
}

/** Whether completing `completedSectionId` finishes its unit (last node, all starred). */
export function isUnitJustCompleted(curriculum, completedSectionId) {
  const found = findSectionUnit(curriculum, completedSectionId);
  if (!found) return false;

  const { unit } = found;
  const sections = unit.sections ?? [];
  const lastSection = sections[sections.length - 1];
  if (!lastSection || lastSection.id !== completedSectionId) return false;

  return sections.every((s) => s.stars > 0);
}

/** i18n copy for the celebration toast. */
export function celebrationToastCopy(payload, t, { sectionTitle = "", kindLabel = "" } = {}) {
  if (payload.unitComplete && payload.unitTitle) {
    return {
      main: t("path.celebrateUnitComplete", { unit: payload.unitTitle }),
      sub: sectionTitle || undefined,
    };
  }

  if (payload.kind !== "practice" || payload.stars === 0) {
    return {
      main: t("path.celebrateTeaching", { kind: kindLabel }),
      sub: sectionTitle || undefined,
    };
  }

  const stars = "★".repeat(payload.stars);
  const main = t("path.celebrateNode", { stars });
  let sub = sectionTitle;
  if (payload.perfect) {
    sub = sectionTitle
      ? `${sectionTitle} · ${t("path.perfectLesson")}`
      : t("path.perfectLesson");
  }
  return { main, sub: sub || undefined };
}