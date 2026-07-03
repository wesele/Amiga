export const READING_COMPLETE_SCROLL_PCT = 90;
export const SCROLL_SAVE_THROTTLE_MS = 3000;
/** Minimum scroll depth before surfacing continue-reading as a primary focus. */
export const CONTINUE_READING_FOCUS_MIN_PCT = 10;

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

/** Whether an article is a valid continue-reading focus candidate. */
export function isContinueReadingCandidate(article) {
  if (!article) return false;
  const scrollPct = article.scrollPct ?? 0;
  const remainingPct = article.remainingPct ?? Math.max(0, 100 - scrollPct);
  return (
    scrollPct >= CONTINUE_READING_FOCUS_MIN_PCT
    && remainingPct > 0
    && scrollPct < READING_COMPLETE_SCROLL_PCT
  );
}

/**
 * Stable sort: in-progress articles first (highest scroll_pct, then latest read_at),
 * then unread/completed, preserving hot_rank within each group.
 */
export function sortArticlesWithInProgressFirst(articles, statusMap) {
  const list = [...(articles || [])];
  const phaseRank = (article) => {
    const phase = readingCardPhase(statusMap?.get?.(article.id));
    if (phase === "in_progress") return 0;
    if (phase === "unread") return 1;
    return 2;
  };
  const inProgressKey = (article) => {
    const status = statusMap?.get?.(article.id);
    if (readingCardPhase(status) !== "in_progress") return null;
    return {
      scrollPct: status.scroll_pct ?? 0,
      readAt: status.read_at || "",
    };
  };

  return list.sort((a, b) => {
    const phaseDiff = phaseRank(a) - phaseRank(b);
    if (phaseDiff !== 0) return phaseDiff;

    const aProgress = inProgressKey(a);
    const bProgress = inProgressKey(b);
    if (aProgress && bProgress) {
      if (bProgress.scrollPct !== aProgress.scrollPct) {
        return bProgress.scrollPct - aProgress.scrollPct;
      }
      if (bProgress.readAt !== aProgress.readAt) {
        return bProgress.readAt.localeCompare(aProgress.readAt);
      }
    }

    return (a.hot_rank ?? 0) - (b.hot_rank ?? 0);
  });
}