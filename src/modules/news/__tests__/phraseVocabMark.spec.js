import { describe, it, expect } from "vitest";
import {
  phraseKey,
  isPhraseMarkable,
  buildPhraseVocabEntry,
  getContextForSelection,
} from "../phraseVocabMark.js";

describe("phraseVocabMark", () => {
  it("phraseKey normalizes case and whitespace", () => {
    expect(phraseKey("  Tasa   de  Interés  ")).toBe("tasa de interés");
    expect(phraseKey("hola")).toBe("hola");
  });

  it("isPhraseMarkable requires at least two words", () => {
    expect(isPhraseMarkable("tasa de interés")).toBe(true);
    expect(isPhraseMarkable("mercado")).toBe(false);
    expect(isPhraseMarkable("")).toBe(false);
  });

  it("buildPhraseVocabEntry includes phrase, context, translation, articleId", () => {
    expect(
      buildPhraseVocabEntry({
        phrase: "tasa de interés",
        translation: "利率",
        articleId: 42,
        contextSentence: "La tasa de interés subió ayer.",
      }),
    ).toEqual({
      word: "tasa de interés",
      context: "La tasa de interés subió ayer.",
      translation: "利率",
      articleId: 42,
    });
  });

  it("buildPhraseVocabEntry falls back context to phrase", () => {
    expect(
      buildPhraseVocabEntry({
        phrase: "ayer fui",
        translation: "昨天我去了",
      }),
    ).toEqual({
      word: "ayer fui",
      context: "ayer fui",
      translation: "昨天我去了",
    });
  });

  it("getContextForSelection returns the containing paragraph", () => {
    const article = [
      "El mercado abrió temprano.",
      "",
      "La tasa de interés subió ayer en España.",
      "",
      "Los analistas reaccionaron.",
    ].join("\n");

    expect(getContextForSelection(article, "tasa de interés")).toBe(
      "La tasa de interés subió ayer en España.",
    );
  });

  it("getContextForSelection falls back to a local snippet", () => {
    const article = "Los precios cambiaron mucho esta semana.";
    expect(getContextForSelection(article, "precios cambiaron")).toContain("precios cambiaron");
  });
});