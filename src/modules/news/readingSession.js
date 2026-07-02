const SESSION_KEY = "amiga:news-reading-summary";

export function saveReadingSessionSummary({ unknownCount = 0 } = {}) {
  if (!unknownCount || unknownCount <= 0) return;
  try {
    sessionStorage.setItem(
      SESSION_KEY,
      JSON.stringify({ unknownCount, at: Date.now() }),
    );
  } catch {
    /* sessionStorage unavailable */
  }
}

export function peekReadingSessionSummary() {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.unknownCount) return null;
    return parsed;
  } catch {
    return null;
  }
}

/** Read and clear the one-time session banner payload. */
export function consumeReadingSessionSummary() {
  const summary = peekReadingSessionSummary();
  if (summary) {
    try {
      sessionStorage.removeItem(SESSION_KEY);
    } catch {
      /* ignore */
    }
  }
  return summary;
}