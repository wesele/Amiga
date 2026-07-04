import { describe, expect, it, vi } from "vitest";
import {
  answerHash,
  explainQuestion,
  explanationId,
  loadCachedExplanation,
  saveExplanationFeedback,
} from "../aiExplanation.js";

describe("AI question explanation helper", () => {
  it("builds a stable cache id without storing raw answer text in the key", () => {
    const question = { id: "q1" };
    const id = explanationId(question, "very private answer", "zh");
    expect(id).toContain("q1:");
    expect(id).not.toContain("very private answer");
    expect(answerHash("x")).toBe(answerHash("x"));
  });

  it("caches generated explanations", async () => {
    localStorage.clear();
    const chatCompletion = vi.fn().mockResolvedValue(
      JSON.stringify({ reason: "时态不对。", example: "Ayer fui.", tip: "看时间词。" }),
    );
    const question = { id: "q2", sourceText: "Ayer ___", options: ["fui"], answerIdx: 0 };
    const first = await explainQuestion({
      question,
      userAnswer: 1,
      correctAnswer: "fui",
      nativeLang: "zh",
      targetLang: "es",
      cefr: "A1",
      chatCompletion,
    });
    const second = await explainQuestion({
      question,
      userAnswer: 1,
      correctAnswer: "fui",
      nativeLang: "zh",
      targetLang: "es",
      cefr: "A1",
      chatCompletion,
    });

    expect(first.reason).toBe("时态不对。");
    expect(second.from_cache).toBe(true);
    expect(chatCompletion).toHaveBeenCalledTimes(1);
    expect(loadCachedExplanation(first.explanation_id)).toBeTruthy();
  });

  it("records feedback by explanation id", () => {
    localStorage.clear();
    const record = saveExplanationFeedback("q1:abc:zh", "useful");
    expect(record.feedback_type).toBe("useful");
    expect(localStorage.getItem("path.ai_explanation_feedback.q1:abc:zh")).toContain("useful");
  });
});
