// @vitest-environment node
import { describe, it, expect } from "vitest";
import { cleanHtmlText, cleanRssSummary, extractWordTexts, getContext, tokenizeArticleText } from "../articleText.js";

describe("news article text helpers", () => {
  it("re-exports HTML cleanup used by the news reader title", () => {
    expect(cleanHtmlText("<b>News &amp; Notes</b>")).toBe("News & Notes");
    expect(
      cleanRssSummary(
        "Por qué la IA pierde el hilo y se equivoca - The Conversation",
        '<a href="https://news.google.com/rss/articles/CBMi123">Por qué la IA pierde el hilo y se equivoca</a>&nbsp;&nbsp;<font color="#6f6f6f">The Conversation</font>',
      ),
    ).toBe("");
    expect(
      cleanRssSummary(
        "Incendio en Valencia",
        'El fuego mantiene en vilo a 80.000 personas&nbsp;<a href="https://www.elmundo.es/a.html">Leer</a>',
      ),
    ).toBe("El fuego mantiene en vilo a 80.000 personas");
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
