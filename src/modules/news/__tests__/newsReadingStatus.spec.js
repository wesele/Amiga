import { describe, it, expect } from "vitest";
import {
  aggregateListSummary,
  articleCardState,
  buildArticleReviewSessionWords,
  buildDueWordKeySet,
  buildStatusMap,
  collectUnknownWordsFromStatusMap,
  countUnreadArticles,
  parseUnknownWordEntries,
  parseUnknownWords,
  serializeUnknownWordEntries,
} from "../newsReadingStatus.js";

describe("newsReadingStatus helpers", () => {
  it("parseUnknownWords dedupes and ignores invalid JSON", () => {
    expect(parseUnknownWords('["Hola","hola","  "]')).toEqual(["hola"]);
    expect(parseUnknownWords("not-json")).toEqual([]);
    expect(parseUnknownWords(null)).toEqual([]);
  });

  it("parseUnknownWordEntries supports legacy strings and object entries with context", () => {
    expect(parseUnknownWordEntries('["casa","perro"]')).toEqual([
      { word: "casa", context: "" },
      { word: "perro", context: "" },
    ]);
    const mixed = JSON.stringify([
      { word: "inflación", context: "La inflación subió." },
      "tasa",
      { word: "tasa", context: "El banco subió la tasa." },
    ]);
    expect(parseUnknownWordEntries(mixed)).toEqual([
      { word: "inflación", context: "La inflación subió." },
      { word: "tasa", context: "El banco subió la tasa." },
    ]);
  });

  it("serializeUnknownWordEntries round-trips review context", () => {
    const json = serializeUnknownWordEntries([
      { word: "casa", context: "Mi casa es grande." },
      { word: "perro", context: "" },
    ]);
    expect(JSON.parse(json)).toEqual([
      { word: "casa", context: "Mi casa es grande." },
      { word: "perro", context: "" },
    ]);
  });

  it("buildStatusMap indexes rows by article id", () => {
    const map = buildStatusMap([
      { article_id: 2, read_at: "2026-01-01" },
      { article_id: 5, read_at: "2026-01-02" },
    ]);
    expect(map.get(2).read_at).toBe("2026-01-01");
    expect(map.get(5).read_at).toBe("2026-01-02");
  });

  it("articleCardState marks unread, read today, and review chip", () => {
    const unread = articleCardState({ id: 1 }, undefined);
    expect(unread.isUnread).toBe(true);
    expect(unread.readBadge).toBeNull();

    const inProgress = articleCardState(
      { id: 2 },
      {
        read_at: "2026-07-03 10:00:00",
        completed: false,
        scroll_pct: 42,
      },
    );
    expect(inProgress.isInProgress).toBe(true);
    expect(inProgress.progressLine).toEqual({ key: "cardInProgress", pct: 42 });
    expect(inProgress.showContinueChip).toBe(true);
    expect(inProgress.cardClass).toBe("is-in-progress");

    const read = articleCardState(
      { id: 3 },
      {
        read_at: "2026-07-03 10:00:00",
        read_today: true,
        completed: true,
        unknown_count: 2,
        words_unknown: '["casa","perro"]',
      },
      { dueWordKeys: new Set(["casa"]) },
    );
    expect(read.readBadge).toBe("cardReadToday");
    expect(read.unknownLine).toEqual({ key: "cardUnknownWords", n: 2 });
    expect(read.showReviewChip).toBe(true);

    const mastered = articleCardState(
      { id: 4 },
      {
        read_at: "2026-07-02 10:00:00",
        read_today: false,
        completed: true,
        unknown_count: 1,
        words_unknown: '["sol"]',
      },
      { dueWordKeys: new Set() },
    );
    expect(mastered.readBadge).toBe("cardRead");
    expect(mastered.showReviewChip).toBe(false);
  });

  it("aggregateListSummary and countUnreadArticles tally progress", () => {
    const articles = [{ id: 1 }, { id: 2 }, { id: 3 }];
    const map = buildStatusMap([
      { article_id: 1, read_at: "2026-07-03", read_today: true, completed: true },
      { article_id: 2, read_at: "2026-07-02", read_today: false, completed: true },
      { article_id: 3, read_at: "2026-07-03", completed: false, scroll_pct: 20 },
    ]);
    expect(aggregateListSummary(map, articles)).toEqual({
      readToday: 1,
      unread: 0,
      inProgress: 1,
      total: 3,
    });
    expect(countUnreadArticles(map, articles)).toBe(0);
  });

  it("collectUnknownWordsFromStatusMap and buildDueWordKeySet support review flow", () => {
    const map = buildStatusMap([
      { article_id: 9, words_unknown: '["casa","perro"]' },
      { article_id: 10, words_unknown: '["perro"]' },
    ]);
    expect(collectUnknownWordsFromStatusMap(map)).toEqual(["casa", "perro"]);

    const due = buildDueWordKeySet([
      { word: "casa", mastery: 1 },
      { word: "perro", mastery: 2 },
    ]);
    expect(due.has("casa")).toBe(true);
    expect(due.has("perro")).toBe(false);

    const sessionWords = buildArticleReviewSessionWords(
      {
        words_unknown: JSON.stringify([
          { word: "casa", context: "Mi casa es grande." },
        ]),
      },
      9,
    );
    expect(sessionWords).toEqual([
      { word: "casa", context: "Mi casa es grande.", articleId: 9 },
    ]);
  });
});