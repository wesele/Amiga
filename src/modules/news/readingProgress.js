export const READING_COMPLETE_SCROLL_PCT = 90;
export const SCROLL_SAVE_THROTTLE_MS = 3000;

/** Compute scroll depth as 0–100 integer. */
export function computeScrollPct(scrollEl) {
  if (!scrollEl) return 0;
  const { scrollTop, scrollHeight, clientHeight } = scrollEl;
  const maxScroll = scrollHeight - clientHeight;
  if (maxScroll <= 0) {
    return scrollHeight > 0 ? 100 : 0;
  }
  return Math.min(100, Math.max(0, Math.round((scrollTop / maxScroll) * 100)));
}

/** Restore scroll position from a saved percentage. */
export function restoreScrollPosition(scrollEl, scrollPct) {
  if (!scrollEl || scrollPct <= 0) return;
  const { scrollHeight, clientHeight } = scrollEl;
  const maxScroll = scrollHeight - clientHeight;
  if (maxScroll <= 0) return;
  scrollEl.scrollTop = Math.round((maxScroll * scrollPct) / 100);
}

/** Whether the session counts as fully read. */
export function isReadingComplete(scrollPct, userMarkedComplete = false) {
  return userMarkedComplete || scrollPct >= READING_COMPLETE_SCROLL_PCT;
}

/** Derive list card phase from a status row. */
export function readingCardPhase(status) {
  if (!status?.read_at) return "unread";
  if (status.completed) return "completed";
  return "in_progress";
}

/**
 * Pick the best in-progress article to continue (highest scroll_pct, then latest read_at).
 * @returns {{ articleId: number, title: string, scrollPct: number, remainingPct: number } | null}
 */
export function findContinueReadingCandidate(articles, statusMap) {
  let best = null;
  for (const article of articles || []) {
    const status = statusMap?.get?.(article.id);
    if (readingCardPhase(status) !== "in_progress") continue;
    const scrollPct = status.scroll_pct ?? 0;
    const readAt = status.read_at || "";
    if (
      !best
      || scrollPct > best.scrollPct
      || (scrollPct === best.scrollPct && readAt > best.readAt)
    ) {
      best = {
        articleId: article.id,
        title: article.original_title || "",
        scrollPct,
        readAt,
        remainingPct: Math.max(0, 100 - scrollPct),
      };
    }
  }
  return best;
}