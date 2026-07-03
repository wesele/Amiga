import { describe, expect, it } from "vitest";
import {
  buildComprehensionPracticeContext,
  buildComprehensionPracticeStarter,
  collectWrongComprehensionDetails,
  formatComprehensionItemsBrief,
  shouldOfferComprehensionAiPractice,
} from "../comprehensionAiPractice.js";

const QUIZ_RESULT = {
  score: 1,
  total: 2,
  skipped: false,
  details: [
    {
      correct: false,
      question: {
        kind: "main_idea",
        prompt_native: "这篇文章主要讲了什么？",
        evidence_sentence: "El banco central subió las tasas.",
        explanation_native: "文章重点是央行加息。",
      },
    },
    {
      correct: true,
      question: {
        kind: "detail",
        prompt_native: "细节题",
        evidence_sentence: "La inflación sigue alta.",
        explanation_native: "通胀偏高。",
      },
    },
  ],
};

describe("comprehensionAiPractice", () => {
  it("collects only wrong, non-skipped comprehension details", () => {
    expect(collectWrongComprehensionDetails(QUIZ_RESULT)).toHaveLength(1);
    expect(collectWrongComprehensionDetails({ ...QUIZ_RESULT, skipped: true })).toEqual([]);
    expect(collectWrongComprehensionDetails(null)).toEqual([]);
  });

  it("offers practice when there are wrong answers", () => {
    expect(shouldOfferComprehensionAiPractice({ comprehensionResult: QUIZ_RESULT })).toBe(true);
    expect(
      shouldOfferComprehensionAiPractice({
        comprehensionResult: { score: 2, total: 2, skipped: false, details: [] },
      }),
    ).toBe(false);
  });

  it("builds practice context and starter payload", () => {
    const context = buildComprehensionPracticeContext({
      articleTitle: "通胀新闻",
      articleId: 42,
      comprehensionResult: QUIZ_RESULT,
      targetLang: "es",
    });
    expect(context).toMatchObject({
      articleId: 42,
      articleTitle: "通胀新闻",
      wrongCount: 1,
      targetLang: "es",
    });
    expect(context.items[0]).toMatchObject({
      kind: "main_idea",
      promptNative: "这篇文章主要讲了什么？",
      evidenceSentence: "El banco central subió las tasas.",
    });

    const starter = buildComprehensionPracticeStarter({
      ...context,
      targetLabel: "西班牙语",
    });
    expect(starter.id).toBe("comprehension-practice");
    expect(starter.labelParams).toEqual({ title: "通胀新闻", n: 1 });
    expect(starter.messageParams.target).toBe("西班牙语");
    expect(starter.messageParams.itemsBrief).toContain("这篇文章主要讲了什么？");
  });

  it("formats a numbered items brief", () => {
    const brief = formatComprehensionItemsBrief([
      {
        promptNative: "主旨？",
        evidenceSentence: "Frase clave.",
        explanationNative: "解释",
      },
    ]);
    expect(brief).toBe("1. 主旨？\nFrase clave.\n(解释)");
  });
});