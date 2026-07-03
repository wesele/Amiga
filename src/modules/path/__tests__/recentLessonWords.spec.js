import { beforeEach, describe, expect, it } from "vitest";
import {
  RECENT_LESSON_WORDS_EXPIRY_MS,
  RECENT_LESSON_FRESH_MS,
  clearRecentLessonWords,
  consumeRecentLessonWordsForArticle,
  dismissRecentLessonWords,
  isRecentLessonFresh,
  peekRecentLessonWords,
  resolveLessonArticleMatch,
  saveRecentLessonWords,
} from "../recentLessonWords.js";

const NOW = 1_700_000_000_000;
const PAIR = "zh:es:A1";

describe("recentLessonWords", () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it("saves and peeks recent lesson words for a pair", () => {
    saveRecentLessonWords(
      {
        words: ["hola", "gracias", "hola"],
        sectionId: "zh-es/U01-PRACTICE",
        sectionTitle: "闯关练习",
        pairKey: PAIR,
      },
      { now: NOW },
    );

    const recent = peekRecentLessonWords({ pairKey: PAIR, now: NOW });
    expect(recent).toMatchObject({
      words: ["hola", "gracias"],
      sectionTitle: "闯关练习",
      completedAt: NOW,
      pairKey: PAIR,
      consumed: false,
    });
  });

  it("ignores payloads with fewer than two words", () => {
    saveRecentLessonWords({ words: ["hola"], pairKey: PAIR }, { now: NOW });
    expect(peekRecentLessonWords({ pairKey: PAIR, now: NOW })).toBeNull();
  });

  it("expires payloads older than 24h", () => {
    saveRecentLessonWords({ words: ["hola", "gracias"], pairKey: PAIR }, { now: NOW });
    expect(
      peekRecentLessonWords({
        pairKey: PAIR,
        now: NOW + RECENT_LESSON_WORDS_EXPIRY_MS + 1,
      }),
    ).toBeNull();
  });

  it("invalidates when pairKey mismatches", () => {
    saveRecentLessonWords({ words: ["hola", "gracias"], pairKey: PAIR }, { now: NOW });
    expect(peekRecentLessonWords({ pairKey: "zh:en:A1", now: NOW })).toBeNull();
  });

  it("dismiss marks payload consumed", () => {
    saveRecentLessonWords({ words: ["hola", "gracias"], pairKey: PAIR }, { now: NOW });
    dismissRecentLessonWords();
    expect(peekRecentLessonWords({ pairKey: PAIR, now: NOW })).toBeNull();
  });

  it("consumes when learner finishes lesson-word article", () => {
    saveRecentLessonWords({ words: ["hola", "gracias"], pairKey: PAIR }, { now: NOW });
    expect(
      consumeRecentLessonWordsForArticle(9, { lessonWordsQuery: "hola,gracias", now: NOW }),
    ).toBe(true);
    expect(peekRecentLessonWords({ pairKey: PAIR, now: NOW })).toBeNull();
  });

  it("detects fresh lesson completion window", () => {
    expect(isRecentLessonFresh(NOW, { now: NOW + RECENT_LESSON_FRESH_MS - 1 })).toBe(true);
    expect(isRecentLessonFresh(NOW, { now: NOW + RECENT_LESSON_FRESH_MS })).toBe(false);
  });

  it("resolves article match and clears when nothing matches", () => {
    saveRecentLessonWords({ words: ["hola", "gracias"], pairKey: PAIR }, { now: NOW });

    const articles = [
      {
        id: 7,
        original_title: "Tech",
        original_body: "hola mundo",
        rewritten_body: "hola mundo gracias",
        hot_rank: 1,
      },
    ];
    const statusMap = new Map([
      [7, { article_id: 7, read_today: false, completed: false, scroll_pct: 0 }],
    ]);

    const match = resolveLessonArticleMatch(articles, statusMap, { pairKey: PAIR, now: NOW });
    expect(match).toMatchObject({
      articleId: 7,
      articleTitle: "Tech",
      matchCount: 2,
      readToday: false,
    });

    clearRecentLessonWords();
    saveRecentLessonWords({ words: ["perro", "gato"], pairKey: PAIR }, { now: NOW });
    expect(resolveLessonArticleMatch(articles, statusMap, { pairKey: PAIR, now: NOW })).toBeNull();
    expect(peekRecentLessonWords({ pairKey: PAIR, now: NOW })).toBeNull();
  });
});