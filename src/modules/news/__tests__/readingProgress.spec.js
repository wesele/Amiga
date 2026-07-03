import { describe, it, expect } from "vitest";
import {
  READING_COMPLETE_SCROLL_PCT,
  computeScrollPct,
  findContinueReadingCandidate,
  isReadingComplete,
  readingCardPhase,
  restoreScrollPosition,
} from "../readingProgress.js";
import { buildStatusMap } from "../newsReadingStatus.js";

describe("readingProgress helpers", () => {
  it("computeScrollPct returns 0–100 based on scroll depth", () => {
    const el = {
      scrollTop: 50,
      scrollHeight: 200,
      clientHeight: 100,
    };
    expect(computeScrollPct(el)).toBe(50);
    expect(computeScrollPct(null)).toBe(0);
  });

  it("restoreScrollPosition maps percentage back to scrollTop", () => {
    const el = { scrollTop: 0, scrollHeight: 300, clientHeight: 100 };
    restoreScrollPosition(el, 50);
    expect(el.scrollTop).toBe(100);
  });

  it("isReadingComplete respects threshold and manual mark", () => {
    expect(isReadingComplete(READING_COMPLETE_SCROLL_PCT - 1)).toBe(false);
    expect(isReadingComplete(READING_COMPLETE_SCROLL_PCT)).toBe(true);
    expect(isReadingComplete(10, true)).toBe(true);
  });

  it("readingCardPhase distinguishes unread, in progress, and completed", () => {
    expect(readingCardPhase(undefined)).toBe("unread");
    expect(readingCardPhase({ read_at: "2026-07-03", completed: false, scroll_pct: 40 }))
      .toBe("in_progress");
    expect(readingCardPhase({ read_at: "2026-07-03", completed: true, scroll_pct: 100 }))
      .toBe("completed");
  });

  it("findContinueReadingCandidate picks highest progress article", () => {
    const articles = [
      { id: 1, original_title: "A" },
      { id: 2, original_title: "B" },
    ];
    const map = buildStatusMap([
      { article_id: 1, read_at: "2026-07-03 10:00:00", completed: false, scroll_pct: 30 },
      { article_id: 2, read_at: "2026-07-03 11:00:00", completed: false, scroll_pct: 55 },
    ]);
    const pick = findContinueReadingCandidate(articles, map);
    expect(pick?.articleId).toBe(2);
    expect(pick?.remainingPct).toBe(45);
  });
});