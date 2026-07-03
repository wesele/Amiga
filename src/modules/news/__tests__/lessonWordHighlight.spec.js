import { describe, expect, it } from "vitest";
import {
  applyLessonWordFlags,
  lessonWordsPreview,
  parseLessonWordsQuery,
} from "../lessonWordHighlight.js";

describe("lessonWordHighlight", () => {
  it("parses comma-separated lessonWords query", () => {
    const set = parseLessonWordsQuery("hola, Gracias ,banco");
    expect([...set]).toEqual(["hola", "gracias", "banco"]);
  });

  it("flags matching word tokens", () => {
    const tokens = applyLessonWordFlags(
      [
        { text: "Hola", isWord: true },
        { text: " ", isWord: false },
        { text: "mundo", isWord: true },
      ],
      new Set(["hola"]),
    );
    expect(tokens[0].isLessonWord).toBe(true);
    expect(tokens[2].isLessonWord).toBeUndefined();
  });

  it("builds preview text with limit", () => {
    expect(lessonWordsPreview(["hola", "gracias", "banco", "cuenta"], 3)).toBe(
      "hola, gracias, banco",
    );
  });
});