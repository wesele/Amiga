import { describe, expect, it } from "vitest";
import {
  buildGrammarPracticeContext,
  buildGrammarPracticeStarter,
  formatGrammarPointsPreview,
  shouldOfferGrammarAiPractice,
} from "../grammarAiPractice.js";

describe("grammarAiPractice", () => {
  it("offers practice only for grammar lessons with points", () => {
    expect(shouldOfferGrammarAiPractice({ kind: "grammar", grammarPoints: ["ser"] })).toBe(true);
    expect(shouldOfferGrammarAiPractice({ kind: "vocab", grammarPoints: ["ser"] })).toBe(false);
    expect(shouldOfferGrammarAiPractice({ kind: "grammar", grammarPoints: [] })).toBe(false);
  });

  it("builds context with capped points and scenarios", () => {
    const context = buildGrammarPracticeContext({
      sectionId: "zh-es/U01-GRAMMAR",
      unitTitleNative: "基础问候",
      grammarPoints: ["a", "b", "c", "d"],
      scenarios: ["见面", "告别", "点餐"],
      targetLang: "es",
    });
    expect(context.grammarPoints).toEqual(["a", "b", "c"]);
    expect(context.scenarios).toEqual(["见面", "告别"]);
  });

  it("formats preview with ellipsis when more than three points", () => {
    expect(formatGrammarPointsPreview(["a", "b", "c", "d"])).toBe("a、b、c…");
  });

  it("builds grammar-practice starter with points and scenarios", () => {
    const starter = buildGrammarPracticeStarter(
      buildGrammarPracticeContext({
        unitTitleNative: "过去时 -ar",
        grammarPoints: ["-ar 变位", "不规则动词"],
        scenarios: ["描述昨天"],
        targetLang: "es",
      }),
    );
    expect(starter.id).toBe("grammar-practice");
    expect(starter.messageParams.points).toContain("-ar 变位");
    expect(starter.messageParams.scenarios).toBe("描述昨天");
  });
});