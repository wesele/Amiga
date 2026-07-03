import { highlightWordInContext } from "./vocabReviewContext.js";

export const VOCAB_CARD_MODES = {
  CLASSIC: "classic",
  CLOZE: "cloze",
  REVERSE: "reverse",
};

const CLOZE_RATIO_MASTERY_1 = 50;
const CLOZE_RATIO_MASTERY_2 = 30;
const REVERSE_RATIO = 25;

/** Deterministic 0–99 roll for the same word on the same calendar day. */
export function recallModeRoll(word, dateKey = todayDateKey()) {
  const wordKey = String(word?.id ?? word?.word ?? "");
  return stableHash(`${wordKey}:${dateKey}`) % 100;
}

export function todayDateKey(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

function stableHash(input) {
  let hash = 0;
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash * 31 + input.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

/** Whether the word has a reliable reading context (session or stored example). */
export function hasRecallContext(word, sessionContextMap) {
  if (!word?.word) return false;
  const sessionContext = sessionContextMap?.get(word.word.toLowerCase());
  if (sessionContext?.trim()) return true;
  return Boolean(String(word.example || "").trim());
}

/** Whether a definition is available for reverse-recall prompts. */
export function hasRecallDefinition(word, nativeLang) {
  if (!word) return false;
  if (word.translation?.trim()) return true;
  if (nativeLang === "zh") {
    return Boolean(word.definition_zh?.trim() || word.definition_es?.trim());
  }
  if (nativeLang === "es") {
    return Boolean(word.definition_es?.trim() || word.definition_zh?.trim());
  }
  return Boolean(word.definition_es?.trim() || word.definition_zh?.trim());
}

/** Replace the highlighted target word with a blank token for cloze rendering. */
export function buildClozeContextParts(contextText, word) {
  const highlighted = highlightWordInContext(contextText, word);
  if (!highlighted.some((part) => part.highlight)) {
    return highlighted;
  }
  return highlighted.map((part) =>
    part.highlight ? { text: "___", blank: true } : { text: part.text, highlight: false },
  );
}

/** Accessible label: full sentence with the target word spoken as “blank”. */
export function clozeAriaLabel(contextText, word, blankLabel = "空白") {
  if (!contextText) return "";
  if (!word) return contextText;
  const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return contextText.replace(new RegExp(escaped, "giu"), blankLabel);
}

/**
 * Pick the flashcard mode for one card in a review session.
 * Warm-up cards in reading micro-review stay classic; eligible words get cloze/reverse recall.
 */
export function resolveVocabCardMode(
  word,
  {
    index = 0,
    sessionContextMap,
    mastery,
    readingSessionMode = false,
    nativeLang = "zh",
    dateKey = todayDateKey(),
  } = {},
) {
  if (readingSessionMode && index < 2) {
    return VOCAB_CARD_MODES.CLASSIC;
  }

  const stage = mastery ?? word?.mastery ?? 0;
  const roll = recallModeRoll(word, dateKey);

  if (hasRecallContext(word, sessionContextMap)) {
    if (stage <= 1 && roll < CLOZE_RATIO_MASTERY_1) {
      return VOCAB_CARD_MODES.CLOZE;
    }
    if (stage === 2 && roll < CLOZE_RATIO_MASTERY_2) {
      return VOCAB_CARD_MODES.CLOZE;
    }
    return VOCAB_CARD_MODES.CLASSIC;
  }

  if (stage >= 1 && hasRecallDefinition(word, nativeLang) && roll < REVERSE_RATIO) {
    return VOCAB_CARD_MODES.REVERSE;
  }

  return VOCAB_CARD_MODES.CLASSIC;
}

export function isRecallCardMode(mode) {
  return mode === VOCAB_CARD_MODES.CLOZE || mode === VOCAB_CARD_MODES.REVERSE;
}

/** Front face should hide the target word to avoid leaking the answer. */
export function shouldHideTargetOnFront(mode) {
  return isRecallCardMode(mode);
}

/** Swipe / footer rating is allowed once the answer is visible. */
export function canRateCard({
  mode = VOCAB_CARD_MODES.CLASSIC,
  flipped = false,
  revealed = false,
  acting = false,
  ratingAck = null,
} = {}) {
  if (acting || ratingAck != null) return false;
  if (mode === VOCAB_CARD_MODES.CLASSIC) return flipped;
  return revealed;
}