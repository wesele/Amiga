import { describe, it, expect } from "vitest";
import {
  extractWordTexts,
  getContext,
  tokenizeArticleText,
  applyMasteryToTokens,
} from "../articleText.js";
import { buildMasteryMap } from "../wordMastery.js";

describe("news article text helpers", () => {
  it("extracts unique lower-case words", () => {
    expect(extractWordTexts("Hola hola mundo, AI y casa.")).toEqual([
      "hola",
      "mundo",
      "ai",
      "casa",
    ]);
  });

  it("returns local context around a word", () => {
    expect(getContext("uno dos tres cuatro cinco", "tres")).toContain("dos tres cuatro");
  });

  it("tokenizes words, punctuation, spaces, and markdown bold markers", () => {
    const tokens = tokenizeArticleText("Hola, **mundo**!");

    expect(tokens.map((token) => token.text)).toEqual(["Hola", ",", " ", "mundo", "!"]);
    expect(tokens.filter((token) => token.isWord).map((token) => token.text)).toEqual([
      "Hola",
      "mundo",
    ]);
  });

  it("applyMasteryToTokens annotates word tokens", () => {
    const tokens = tokenizeArticleText("Hola mundo");
    const map = buildMasteryMap([
      { word: "hola", mastery: 2 },
      { word: "mundo", mastery: 0 },
    ]);
    const annotated = applyMasteryToTokens(tokens, map);
    const hola = annotated.find((t) => t.text === "Hola");
    const mundo = annotated.find((t) => t.text === "mundo");
    expect(hola.masteryLevel).toBe(2);
    expect(hola.isNewWord).toBe(false);
    expect(mundo.masteryLevel).toBe(0);
    expect(mundo.isNewWord).toBe(true);
  });
});
