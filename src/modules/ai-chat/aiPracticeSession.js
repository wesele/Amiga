export const AI_PRACTICE_SOURCES = {
  READING: "reading",
  VOCAB: "vocab",
  MISTAKE: "mistake",
  COMPREHENSION: "comprehension",
};

/** Whether this chat session was opened from a learning-loop AI practice entry. */
export function isGuidedAiPractice(route) {
  if (route?.query?.starterId === "reviewed-words" && Boolean(route?.query?.words)) {
    return true;
  }
  return route?.query?.starterId === "comprehension-practice";
}

export function parsePracticeWords(route) {
  return String(route?.query?.words ?? "")
    .split(",")
    .map((word) => word.trim())
    .filter(Boolean);
}

export function parsePracticeSource(route) {
  const from = route?.query?.from;
  if (from === AI_PRACTICE_SOURCES.READING) return AI_PRACTICE_SOURCES.READING;
  if (from === AI_PRACTICE_SOURCES.VOCAB) return AI_PRACTICE_SOURCES.VOCAB;
  if (from === AI_PRACTICE_SOURCES.MISTAKE) return AI_PRACTICE_SOURCES.MISTAKE;
  if (from === AI_PRACTICE_SOURCES.COMPREHENSION) return AI_PRACTICE_SOURCES.COMPREHENSION;
  return null;
}

/** Show wrap-up only after at least one meaningful interaction. */
export function shouldShowPracticeWrapUp({ userMessageCount, usedStarter }) {
  return userMessageCount > 0 || usedStarter;
}

/** Track a word the user marked unknown during an AI chat session. */
export function trackChatLearnedWord(sessionWords, word) {
  const trimmed = String(word ?? "").trim();
  if (!trimmed) return Array.isArray(sessionWords) ? [...sessionWords] : [];
  const seen = new Set();
  const next = [];
  for (const existing of Array.isArray(sessionWords) ? sessionWords : [...sessionWords]) {
    const key = String(existing ?? "").trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    next.push(existing);
  }
  const key = trimmed.toLowerCase();
  if (!seen.has(key)) next.push(trimmed);
  return next;
}

/** Merge route practice words with words learned in the current chat session. */
export function mergePracticeWords(routeWords, sessionWords) {
  const merged = [];
  const seen = new Set();
  for (const word of [...(routeWords ?? []), ...(sessionWords ?? [])]) {
    const trimmed = String(word ?? "").trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(trimmed);
  }
  return merged;
}

export function formatLearnedWordsPreview(words, limit = 3) {
  const list = Array.isArray(words) ? words : [];
  if (!list.length) return "";
  const preview = list.slice(0, limit).join(", ");
  if (list.length <= limit) return preview;
  return `${preview}…`;
}

/** Default exit route after guided practice — not the chat contact list. */
export function defaultExitRouteAfterPractice(source, returnRoute) {
  if (returnRoute?.name) return returnRoute;
  switch (source) {
    case AI_PRACTICE_SOURCES.READING:
      return { name: "news" };
    case AI_PRACTICE_SOURCES.VOCAB:
      return { name: "learn" };
    case AI_PRACTICE_SOURCES.MISTAKE:
      return { name: "path" };
    case AI_PRACTICE_SOURCES.COMPREHENSION:
      return { name: "news" };
    default:
      return { name: "chat" };
  }
}