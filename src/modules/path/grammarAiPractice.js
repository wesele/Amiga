export const GRAMMAR_PRACTICE_PAYLOAD_KEY = "amiga:grammarPracticePayload";

const PREVIEW_POINT_LIMIT = 3;

/** Whether grammar teaching should offer AI speaking practice. */
export function shouldOfferGrammarAiPractice({ kind, grammarPoints = [] } = {}) {
  return kind === "grammar" && grammarPoints.filter(Boolean).length >= 1;
}

/** Format grammar points for starter preview (max 3, with ellipsis). */
export function formatGrammarPointsPreview(points = [], limit = PREVIEW_POINT_LIMIT) {
  const list = points.filter(Boolean);
  if (!list.length) return "";
  const preview = list.slice(0, limit).join("、");
  if (list.length <= limit) return preview;
  return `${preview}…`;
}

/**
 * Build practice context for grammar AI chat (starter, pending, sessionStorage).
 */
export function buildGrammarPracticeContext({
  unitTitleNative = "",
  grammarPoints = [],
  scenarios = [],
  targetLang = "es",
  sectionId = "",
} = {}) {
  const points = grammarPoints.filter(Boolean);
  if (!points.length) return null;
  return {
    sectionId: String(sectionId ?? "").trim(),
    unitTitleNative: String(unitTitleNative ?? "").trim(),
    targetLang,
    grammarPoints: points.slice(0, PREVIEW_POINT_LIMIT),
    scenarios: scenarios.filter(Boolean).slice(0, 2),
  };
}

/** Generate chat starter metadata for guided grammar practice. */
export function buildGrammarPracticeStarter(context) {
  if (!context?.grammarPoints?.length) return null;
  const points = formatGrammarPointsPreview(context.grammarPoints);
  const scenarios = context.scenarios?.length
    ? context.scenarios.slice(0, 2).join("、")
    : "";
  return {
    id: "grammar-practice",
    labelKey: "chat.starterPracticeGrammar",
    labelParams: { unit: context.unitTitleNative },
    messageKey: "chat.starterPracticeGrammarMsg",
    messageParams: {
      unit: context.unitTitleNative,
      points,
      scenarios,
      target: context.targetLabel ?? context.targetLang,
    },
  };
}

/** @param {ReturnType<typeof buildGrammarPracticeContext>} payload */
export function saveGrammarPracticePayload(payload) {
  if (typeof sessionStorage === "undefined" || !payload?.grammarPoints?.length) return;
  sessionStorage.setItem(GRAMMAR_PRACTICE_PAYLOAD_KEY, JSON.stringify(payload));
}

/** @returns {ReturnType<typeof buildGrammarPracticeContext> | null} */
export function loadGrammarPracticePayload() {
  if (typeof sessionStorage === "undefined") return null;
  const raw = sessionStorage.getItem(GRAMMAR_PRACTICE_PAYLOAD_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return parsed?.grammarPoints?.length ? parsed : null;
  } catch {
    return null;
  }
}

export function clearGrammarPracticePayload() {
  if (typeof sessionStorage === "undefined") return;
  sessionStorage.removeItem(GRAMMAR_PRACTICE_PAYLOAD_KEY);
}