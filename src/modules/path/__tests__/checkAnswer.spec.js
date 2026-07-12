import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { checkAnswer, checkAnswerAsync } from "../checkAnswer.js";
import * as api from "@/shared/api.js";

describe("checkAnswer", () => {
  it("checks multiple-choice by answerIdx", () => {
    const q = { type: "T07", answerIdx: 2 };
    expect(checkAnswer(q, 2)).toBe(true);
    expect(checkAnswer(q, 1)).toBe(false);
  });

  it("checks T03 pairs", () => {
    const q = {
      type: "T03",
      pairs: [{ left: "hola", right: "你好" }, { left: "adiós", right: "再见" }],
    };
    expect(checkAnswer(q, [{ left: "hola", right: "你好" }, { left: "adiós", right: "再见" }])).toBe(true);
    expect(checkAnswer(q, [{ left: "hola", right: "再见" }])).toBe(false);
  });

  it("checks T06 sentence order", () => {
    const q = { type: "T06", targetSentence: "Yo soy estudiante." };
    expect(checkAnswer(q, ["Yo", "soy", "estudiante."])).toBe(true);
    expect(checkAnswer(q, ["soy", "Yo", "estudiante."])).toBe(false);
  });

  it("normalizes accents for T09", () => {
    const q = { type: "T09", answer: "café", commonMistakes: [] };
    expect(checkAnswer(q, "cafe")).toBe(true);
  });
});

describe("checkAnswerAsync", () => {
  let mockInvoke;

  beforeEach(() => {
    mockInvoke = vi.fn();
    api.__setInvoke(mockInvoke);
  });

  afterEach(() => {
    api.__resetInvoke();
  });

  it("returns true immediately if there is a local exact match (no LLM call)", async () => {
    const q = {
      type: "T10",
      sourceText: "我想买一件T恤。",
      acceptedAnswers: ["Quiero comprar una camiseta."],
    };
    const res = await checkAnswerAsync(q, "Quiero comprar una camiseta.");
    expect(res).toBe(true);
    expect(mockInvoke).not.toHaveBeenCalled();
  });

  it("calls grade_translation_cmd if there is no local match", async () => {
    const q = {
      type: "T10",
      sourceText: "我想买一件T恤。",
      acceptedAnswers: ["Quiero comprar una camiseta."],
      language: "es",
    };
    mockInvoke.mockResolvedValue(true);

    const res = await checkAnswerAsync(q, "Yo quiero comprar una camiseta.", "es");
    expect(res).toBe(true);
    expect(mockInvoke).toHaveBeenCalledWith("grade_translation_cmd", {
      sourceText: "我想买一件T恤。",
      acceptedAnswers: ["Quiero comprar una camiseta."],
      userAnswer: "Yo quiero comprar una camiseta.",
      targetLang: "es",
    });
  });

  it("returns false if LLM says the answer is incorrect", async () => {
    const q = {
      type: "T10",
      sourceText: "我想买一件T恤。",
      acceptedAnswers: ["Quiero comprar una camiseta."],
      language: "es",
    };
    mockInvoke.mockResolvedValue(false);

    const res = await checkAnswerAsync(q, "Quiero comer una manzana.", "es");
    expect(res).toBe(false);
  });

  it("falls back to local match if LLM call fails", async () => {
    const q = {
      type: "T10",
      sourceText: "我想买一件T恤。",
      acceptedAnswers: ["Quiero comprar una camiseta."],
      language: "es",
    };
    mockInvoke.mockRejectedValue(new Error("LLM offline"));

    const resExact = await checkAnswerAsync(q, "Quiero comprar una camiseta.", "es");
    expect(resExact).toBe(true);

    const resIncorrect = await checkAnswerAsync(q, "Quiero comer una manzana.", "es");
    expect(resIncorrect).toBe(false);
  });
});