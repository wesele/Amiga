import { describe, it, expect } from "vitest";
import { cleanHtmlText, extractWordTexts, getContext, tokenizeArticleText } from "../articleText.js";

describe("news article text helpers", () => {
  it("re-exports HTML cleanup used by the news reader title", () => {
    expect(cleanHtmlText("<b>News &amp; Notes</b>")).toBe("News & Notes");
  });

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
});
