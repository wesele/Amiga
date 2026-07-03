import { describe, expect, it } from "vitest";
import { analyzeSessionMistakeTypes } from "../sessionMistakeAnalysis.js";

function mistake(type) {
  return { question: { type } };
}

describe("analyzeSessionMistakeTypes", () => {
  it("returns zeros for empty mistakes", () => {
    expect(analyzeSessionMistakeTypes([])).toEqual({
      dominantType: null,
      grammarCount: 0,
      vocabCount: 0,
      listeningCount: 0,
      typeCounts: {},
    });
  });

  it("counts grammar, vocab, and listening buckets", () => {
    const analysis = analyzeSessionMistakeTypes([
      mistake("T05"),
      mistake("T08"),
      mistake("T01"),
      mistake("T07"),
      mistake("T11"),
    ]);
    expect(analysis.grammarCount).toBe(2);
    expect(analysis.vocabCount).toBe(1);
    expect(analysis.listeningCount).toBe(2);
  });

  it("picks the most frequent type as dominant", () => {
    const analysis = analyzeSessionMistakeTypes([
      mistake("T05"),
      mistake("T05"),
      mistake("T08"),
    ]);
    expect(analysis.dominantType).toBe("T05");
    expect(analysis.typeCounts).toEqual({ T05: 2, T08: 1 });
  });

  it("ignores mistakes without a question type", () => {
    const analysis = analyzeSessionMistakeTypes([
      { question: null },
      mistake("T09"),
    ]);
    expect(analysis.vocabCount).toBe(1);
    expect(analysis.dominantType).toBe("T09");
  });
});