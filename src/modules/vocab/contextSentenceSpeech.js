import { highlightWordInContext, pickReviewContext } from "./vocabReviewContext.js";

/** Join highlightWordInContext parts into plain TTS text. */
export function contextSpeechPlainText(parts) {
  if (!Array.isArray(parts) || !parts.length) return "";
  return parts
    .map((part) => String(part?.text ?? ""))
    .join("")
    .trim();
}

/** Resolve the full context sentence for TTS from the same source as the UI. */
export function resolveContextSpeechText(word, sessionContextMap) {
  return pickReviewContext(word, sessionContextMap)?.trim() || "";
}

/** Plain text for TTS when callers already have rendered context parts. */
export function contextSpeechTextFromParts(parts, fallbackText = "") {
  const fromParts = contextSpeechPlainText(parts);
  if (fromParts) return fromParts;
  return String(fallbackText || "").trim();
}

/** Whether context-sentence listen controls should appear. */
export function shouldOfferContextSentenceSpeech(text) {
  return Boolean(String(text || "").trim());
}

/** V1: manual play only; flip auto-play reserved for a future setting. */
export function shouldAutoPlayContextSpeechOnFlip(_options = {}) {
  return false;
}

/** Parts + word helper for callers that render highlighted context. */
export function resolveContextSpeechParts(word, sessionContextMap) {
  const text = resolveContextSpeechText(word, sessionContextMap);
  if (!text) return { text: "", parts: [] };
  return {
    text,
    parts: highlightWordInContext(text, word?.word),
  };
}