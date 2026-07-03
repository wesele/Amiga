import { wordKey } from "./wordMastery.js";

/** Parse comma-separated lessonWords query into a normalized set. */
export function parseLessonWordsQuery(queryValue) {
  const raw = String(queryValue ?? "").trim();
  if (!raw) return new Set();
  const words = raw
    .split(",")
    .map((word) => wordKey(word.trim()))
    .filter(Boolean);
  return new Set(words);
}

/** Flag word tokens that appear in the lesson-word set. */
export function applyLessonWordFlags(tokens, wordSet) {
  if (!wordSet?.size || !Array.isArray(tokens)) return tokens;
  return tokens.map((token) => {
    if (!token.isWord) return token;
    if (!wordSet.has(wordKey(token.text))) return token;
    return { ...token, isLessonWord: true };
  });
}

/** Build a short preview string from matched lesson words. */
export function lessonWordsPreview(words, limit = 3) {
  const list = Array.isArray(words) ? words : [...(words || [])];
  return list.slice(0, limit).join(", ");
}