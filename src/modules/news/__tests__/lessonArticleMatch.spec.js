import { describe, expect, it } from "vitest";
import {
  countWordOverlap,
  lessonArticleReaderRoute,
  mergeArticlesWithStatus,
  normalizeLessonWord,
  pickBestArticleForLessonWords,
  scoreArticleMatch,
} from "../lessonArticleMatch.js";

describe("lessonArticleMatch", () => {
  it("normalizes lesson words for lookup", () => {
    expect(normalizeLessonWord("  Hola ")).toBe("hola");
  });

  it("counts overlap between body text and lesson words", () => {
    const result = countWordOverlap(
      "El banco central subió las tasas. La cuenta bancaria creció.",
      ["banco", "cuenta", "tarjeta"],
    );
    expect(result.count).toBe(2);
    expect(result.matchedWords).toEqual(["banco", "cuenta"]);
  });

  it("returns null when no article overlaps lesson words", () => {
    const match = pickBestArticleForLessonWords(
      [{ id: 1, original_body: "La inflación sigue alta." }],
      ["hola", "gracias"],
    );
    expect(match).toBeNull();
  });

  it("prefers rewritten body over original when scoring", () => {
    const rewritten = scoreArticleMatch(
      {
        id: 1,
        rewritten_body: "Hola y gracias por venir al banco.",
        original_body: "Sin palabras de la lección.",
      },
      ["hola", "gracias", "banco"],
    );
    expect(rewritten?.matchCount).toBe(3);
  });

  it("tie-breaks toward unread and incomplete articles", () => {
    const match = pickBestArticleForLessonWords(
      [
        {
          id: 1,
          original_title: "Old",
          original_body: "Hola y gracias.",
          hot_rank: 1,
          completed: true,
          read_today: true,
        },
        {
          id: 2,
          original_title: "Fresh",
          original_body: "Hola y gracias.",
          hot_rank: 5,
          completed: false,
          read_today: false,
        },
      ],
      ["hola", "gracias"],
    );
    expect(match?.articleId).toBe(2);
    expect(match?.articleTitle).toBe("Fresh");
  });

  it("builds reader route with lessonWords query", () => {
    expect(lessonArticleReaderRoute(7, ["hola", "gracias"])).toEqual({
      name: "reader",
      params: { id: "7" },
      query: { lessonWords: "hola,gracias" },
    });
  });

  it("merges reading status into article candidates", () => {
    const statusMap = new Map([
      [1, { article_id: 1, read_at: "2026-07-03", completed: true, read_today: true }],
      [2, { article_id: 2, read_at: "2026-07-03", scroll_pct: 20 }],
    ]);
    const merged = mergeArticlesWithStatus(
      [
        { id: 1, original_title: "Done", original_body: "hola" },
        { id: 2, original_title: "Reading", original_body: "gracias" },
      ],
      statusMap,
    );
    expect(merged[0].completed).toBe(true);
    expect(merged[0].read_today).toBe(true);
    expect(merged[1].completed).toBe(false);
    expect(merged[1].read_today).toBe(false);
  });
});