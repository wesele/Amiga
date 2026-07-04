import { describe, expect, it } from "vitest";
import { ASSESSMENT_ITEMS, estimateCefr, scoreAssessment } from "../scoring.js";

describe("assessment scoring", () => {
  it("estimates CEFR deterministically", () => {
    expect(estimateCefr(90)).toBe("B1");
    expect(estimateCefr(70)).toBe("A2");
    expect(estimateCefr(30)).toBe("A1");
  });

  it("returns overall, confidence, suggestions and five skill scores", () => {
    const answers = Object.fromEntries(
      ASSESSMENT_ITEMS.map((item) => [item.id, item.type === "text" ? "Me llamo Ana" : item.answer]),
    );
    const result = scoreAssessment(ASSESSMENT_ITEMS, answers);
    expect(result.overall).toBe(100);
    expect(result.cefr).toBe("B1");
    expect(result.confidence).toBeGreaterThan(50);
    expect(Object.keys(result.breakdown)).toEqual([
      "vocabulary",
      "grammar",
      "reading",
      "listening",
      "expression",
    ]);
    expect(result.suggestions.length).toBeGreaterThan(0);
  });
});
