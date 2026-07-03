import { describe, expect, it, beforeEach } from "vitest";
import {
  clearVocabReviewResume,
  contextSentencesForHighlight,
  loadVocabReviewResume,
  resolveVocabReviewResumeIndex,
  saveVocabContextRevisitPayload,
  saveVocabReviewResume,
  shouldReturnToVocabReview,
  shouldShowContextRevisitLink,
  vocabContextRevisitRoute,
  VOCAB_CONTEXT_REVISIT_PAYLOAD_KEY,
  VOCAB_REVIEW_RESUME_KEY,
} from "../vocabContextRevisit.js";

describe("vocabContextRevisit", () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it("shows revisit link only when context, article id, and example exist", () => {
    expect(
      shouldShowContextRevisitLink({
        has_user_context: true,
        context_article_id: 42,
        example: "Cruzaron la frontera al amanecer.",
      }),
    ).toBe(true);
    expect(
      shouldShowContextRevisitLink({
        has_user_context: true,
        context_article_id: null,
        example: "Cruzaron la frontera al amanecer.",
      }),
    ).toBe(false);
    expect(
      shouldShowContextRevisitLink({
        has_user_context: false,
        context_article_id: 42,
        example: "Cruzaron la frontera al amanecer.",
      }),
    ).toBe(false);
  });

  it("builds reader route with revisit query params", () => {
    expect(
      vocabContextRevisitRoute({
        context_article_id: 99,
      }),
    ).toEqual({
      name: "reader",
      params: { id: "99" },
      query: {
        vocabContextRevisit: "1",
        returnTo: "vocab-review",
      },
    });
  });

  it("extracts highlight sentences from word example", () => {
    expect(
      contextSentencesForHighlight({
        example: "  La frontera está cerrada. ",
      }),
    ).toEqual(["La frontera está cerrada."]);
    expect(contextSentencesForHighlight({ example: "  " })).toEqual([]);
  });

  it("persists revisit payload and resume state in sessionStorage", () => {
    saveVocabContextRevisitPayload({
      articleId: 7,
      sentence: "Pidió asilo político.",
      word: "asilo",
    });
    saveVocabReviewResume({ index: 2, flipped: true, wordId: 10 });

    expect(sessionStorage.getItem(VOCAB_CONTEXT_REVISIT_PAYLOAD_KEY)).toContain("asilo");
    expect(JSON.parse(sessionStorage.getItem(VOCAB_REVIEW_RESUME_KEY))).toEqual({
      index: 2,
      flipped: true,
      wordId: 10,
    });
    expect(loadVocabReviewResume()).toEqual({
      index: 2,
      flipped: true,
      wordId: 10,
    });
    clearVocabReviewResume();
    expect(loadVocabReviewResume()).toBeNull();
  });

  it("resolves resume index by word id when queue order shifts", () => {
    const words = [
      { id: 1, word: "hola" },
      { id: 10, word: "frontera" },
    ];
    expect(
      resolveVocabReviewResumeIndex(words, { index: 0, flipped: true, wordId: 10 }),
    ).toBe(1);
  });

  it("detects returnTo vocab-review query", () => {
    expect(shouldReturnToVocabReview({ query: { returnTo: "vocab-review" } })).toBe(true);
    expect(shouldReturnToVocabReview({ query: {} })).toBe(false);
  });
});