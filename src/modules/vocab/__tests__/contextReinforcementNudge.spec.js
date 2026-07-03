import { describe, expect, it } from "vitest";
import {
  buildContextRevisitAction,
  contextReinforcementCopy,
  contextSentenceForHighlight,
  normalizeWordForContextReinforcement,
  shouldOfferContextReinforcement,
  truncateContextSnippet,
} from "../contextReinforcementNudge.js";
import {
  VOCAB_CONTEXT_REVISIT_PAYLOAD_KEY,
  VOCAB_REVIEW_RESUME_KEY,
} from "../vocabContextRevisit.js";

const t = (key) => key;

describe("contextReinforcementNudge", () => {
  const newsWord = {
    id: 10,
    word: "frontera",
    mastery: 1,
    has_user_context: true,
    context_article_id: 42,
    example: "Cruzaron la frontera al amanecer.",
  };

  it("offers reinforcement only for still-learning words with article context", () => {
    expect(shouldOfferContextReinforcement(newsWord, 1)).toBe(true);
    expect(shouldOfferContextReinforcement(newsWord, 2)).toBe(false);
    expect(
      shouldOfferContextReinforcement(
        { word: "casa", mastery: 1, example: "Mi casa." },
        1,
      ),
    ).toBe(false);
  });

  it("normalizes in-reader session cards with article id", () => {
    expect(
      normalizeWordForContextReinforcement(
        { word: "asilo", example: "Pidió asilo político." },
        { articleId: 7, fromSession: true },
      ),
    ).toEqual({
      word: "asilo",
      example: "Pidió asilo político.",
      context_article_id: 7,
      has_user_context: true,
    });
  });

  it("truncates long snippets for the nudge", () => {
    const long = "a".repeat(80);
    expect(truncateContextSnippet(long, 60)).toBe(`${"a".repeat(60)}…`);
    expect(truncateContextSnippet("  corto  ")).toBe("corto");
  });

  it("builds reinforcement copy with example snippet", () => {
    const copy = contextReinforcementCopy(newsWord, t, new Map());
    expect(copy.title).toBe("vocab.contextReinforceTitle");
    expect(copy.snippet).toContain("frontera");
    expect(copy.actionLabel).toBe("vocab.contextReinforceAction");
  });

  it("prefers live session context over stored example", () => {
    const map = new Map([["frontera", "En la frontera norte."]]);
    expect(contextSentenceForHighlight(newsWord, map)).toBe("En la frontera norte.");
  });

  it("persists revisit payload and resume when building revisit action", () => {
    sessionStorage.clear();
    const route = buildContextRevisitAction({
      word: newsWord,
      sessionContextMap: new Map(),
      resume: { index: 1, flipped: true, wordId: 10 },
    });
    expect(route).toEqual({
      name: "reader",
      params: { id: "42" },
      query: { vocabContextRevisit: "1", returnTo: "vocab-review" },
    });
    expect(JSON.parse(sessionStorage.getItem(VOCAB_REVIEW_RESUME_KEY))).toEqual({
      index: 1,
      flipped: true,
      wordId: 10,
    });
    expect(sessionStorage.getItem(VOCAB_CONTEXT_REVISIT_PAYLOAD_KEY)).toContain("frontera");
  });
});