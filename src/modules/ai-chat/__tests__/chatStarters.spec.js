import { describe, it, expect } from "vitest";
import { buildReviewedWordsStarter, pickChatStarters } from "@/modules/ai-chat/chatStarters.js";

const unit = { title_native: "日常活动", title_target: "Daily routines" };

describe("buildReviewedWordsStarter", () => {
  it("builds a reviewed-words starter with preview and full word list", () => {
    const starter = buildReviewedWordsStarter(["alpha", "beta", "gamma", "delta"]);
    expect(starter.id).toBe("reviewed-words");
    expect(starter.labelParams.preview).toBe("alpha, beta, gamma");
    expect(starter.messageParams.words).toBe("alpha, beta, gamma, delta");
  });

  it("returns null when no words are provided", () => {
    expect(buildReviewedWordsStarter([])).toBeNull();
  });
});

describe("pickChatStarters", () => {
  it("prefers grammar practice when current node is grammar with points", () => {
    const starters = pickChatStarters({
      currentSection: {
        unit,
        section: { kind: "grammar", title_native: "单元知识" },
      },
      teachingPreview: { grammar_points: ["过去时 -ar"] },
      targetLabel: "西班牙语",
    });
    expect(starters).toHaveLength(1);
    expect(starters[0].id).toBe("practice-grammar");
  });

  it("prefers vocab quiz when current node is vocab with words", () => {
    const starters = pickChatStarters({
      currentSection: {
        unit,
        section: { kind: "vocab", title_native: "单词学习" },
      },
      teachingPreview: { words: [{ word: "hola" }] },
      targetLabel: "西班牙语",
    });
    expect(starters[0].id).toBe("practice-vocab");
  });

  it("offers unit roleplay for practice nodes", () => {
    const starters = pickChatStarters({
      currentSection: {
        unit,
        section: { kind: "practice", title_native: "打招呼" },
      },
      targetLabel: "西班牙语",
    });
    expect(starters[0].id).toBe("practice-unit");
  });

  it("adds weak-type chip when focus area exists and section chip is present", () => {
    const starters = pickChatStarters({
      currentSection: {
        unit,
        section: { kind: "practice", title_native: "打招呼" },
      },
      focusArea: { typeId: "T07", accuracyPct: 60 },
      targetLabel: "西班牙语",
    });
    expect(starters).toHaveLength(2);
    expect(starters[1].id).toBe("weak-type");
  });

  it("falls back to free chat when no curriculum context", () => {
    const starters = pickChatStarters({ targetLabel: "English" });
    expect(starters).toHaveLength(1);
    expect(starters[0].id).toBe("free-chat");
  });

  it("returns at most three starters", () => {
    const starters = pickChatStarters({
      currentSection: {
        unit,
        section: { kind: "practice", title_native: "打招呼" },
      },
      focusArea: { typeId: "T07", accuracyPct: 60 },
      targetLabel: "西班牙语",
    });
    expect(starters.length).toBeLessThanOrEqual(3);
  });
});