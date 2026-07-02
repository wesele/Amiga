/** Normalize a token surface form to a lookup key. */
export function wordKey(text) {
  return (text || "").toLowerCase();
}

/** Build a lowercase word → mastery map from API results. */
export function buildMasteryMap(entries) {
  const map = new Map();
  if (!Array.isArray(entries)) return map;
  for (const entry of entries) {
    if (!entry?.word) continue;
    map.set(wordKey(entry.word), entry.mastery ?? 0);
  }
  return map;
}

/** Resolve mastery for a token; null/undefined means unseen (0). */
export function tokenMastery(token, masteryMap) {
  if (!token?.isWord) return null;
  const key = wordKey(token.text);
  if (!masteryMap?.has(key)) return 0;
  return masteryMap.get(key);
}

/**
 * CSS class names for article word spans.
 * @param {number|null} mastery - 0 unseen, 1 seen, 2 mastered
 * @param {boolean} sessionMarked - briefly highlight after marking unknown
 */
export function wordMasteryClass(mastery, sessionMarked = false) {
  if (sessionMarked) return "word-session-marked";
  if (mastery === 2) return "word-mastered";
  if (mastery === 1) return "word-seen";
  return "word-new";
}

/** Class resolver bound to reactive state. */
export function resolveWordClass(token, masteryMap, sessionMarkedSet) {
  const mastery = tokenMastery(token, masteryMap);
  const marked = sessionMarkedSet?.has(wordKey(token.text)) ?? false;
  return wordMasteryClass(mastery, marked);
}