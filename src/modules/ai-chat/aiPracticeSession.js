export const AI_PRACTICE_SOURCES = {
  READING: "reading",
  VOCAB: "vocab",
  MISTAKE: "mistake",
};

/** Whether this chat session was opened from a learning-loop AI practice entry. */
export function isGuidedAiPractice(route) {
  return route?.query?.starterId === "reviewed-words" && Boolean(route?.query?.words);
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
  return null;
}

/** Show wrap-up only after at least one meaningful interaction. */
export function shouldShowPracticeWrapUp({ userMessageCount, usedStarter }) {
  return userMessageCount > 0 || usedStarter;
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
    default:
      return { name: "chat" };
  }
}