import { isTranslatableSelectionText } from "./selectionTranslation.js";
import { getContext } from "./articleText.js";

/** Normalize a phrase key for deduplication (lowercase, collapsed whitespace). */
export function phraseKey(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** Whether the selection should be saved as a phrase (≥2 words). */
export function isPhraseMarkable(text) {
  return isTranslatableSelectionText(text);
}

/** Build a pending / session vocab entry for a marked phrase. */
export function buildPhraseVocabEntry({
  phrase,
  translation = "",
  articleId,
  contextSentence = "",
}) {
  const word = String(phrase || "").trim();
  const context = String(contextSentence || "").trim() || word;
  return {
    word,
    context,
    ...(translation ? { translation: String(translation) } : {}),
    ...(articleId != null ? { articleId } : {}),
  };
}

/**
 * Find the paragraph (or sentence snippet) containing the selected phrase.
 * v1: match paragraph from article text; fall back to a local snippet.
 */
export function getContextForSelection(articleText, selectedText) {
  const phrase = String(selectedText || "").trim();
  if (!phrase) return "";
  const body = String(articleText || "").trim();
  if (!body) return phrase;

  const paragraphs = body
    .split(/\n{2,}|\n/)
    .map((part) => part.trim())
    .filter(Boolean);

  const key = phraseKey(phrase);
  for (const para of paragraphs) {
    if (phraseKey(para).includes(key)) return para;
  }

  return getContext(body, phrase);
}