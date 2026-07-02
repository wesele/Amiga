/** True when the review page should prioritize a news-reading session. */
export function isFromReadingSession(route) {
  return route?.query?.from === "reading";
}

/** Prefer the live reading context, then fall back to the stored example. */
export function pickReviewContext(word, sessionContextMap) {
  if (!word?.word) return "";
  const sessionContext = sessionContextMap?.get(word.word.toLowerCase());
  return sessionContext || word.example || "";
}

/**
 * Split a context sentence into renderable parts with the target word highlighted.
 * Returns plain segments so callers can render with <mark> instead of v-html.
 */
export function highlightWordInContext(context, word) {
  if (!context) return [];
  if (!word) return [{ text: context, highlight: false }];

  const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const matcher = new RegExp(escaped, "giu");
  const parts = [];
  let lastIndex = 0;

  for (const match of context.matchAll(matcher)) {
    if (match.index > lastIndex) {
      parts.push({ text: context.slice(lastIndex, match.index), highlight: false });
    }
    parts.push({ text: match[0], highlight: true });
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < context.length) {
    parts.push({ text: context.slice(lastIndex), highlight: false });
  }

  return parts.length ? parts : [{ text: context, highlight: false }];
}