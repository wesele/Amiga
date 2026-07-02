import { describe, expect, it } from "vitest";
import {
  buildMistakeFeedbackSnapshot,
  markMistakeReinforced,
  mistakeItemKey,
  mistakeSummaryLines,
} from "../mistakeSummaryFeedback.js";

const t = (key, params = {}) => {
  const templates = {
    "path.commonMistakeTip": "常见错误：{mistake} → {correct}",
    "path.commonMistakeWithHint": "常见错误：{mistake}，提示：{hint}",
    "path.nearMissTip": "很接近：{answer}",
    "path.wrongExplanationAuthoredHint": "💡 {hint}",
    "path.wrongExplanationPragmatics": "📖 {note}",
    "path.reviewMistakesHint": "复习一下答错的题目，加深记忆后再继续",
  };
  let text = templates[key] || key;
  for (const [k, v] of Object.entries(params)) {
    text = text.replace(`{${k}}`, String(v));
  }
  return text;
};

describe("buildMistakeFeedbackSnapshot", () => {
  it("captures common mistake feedback with highest priority", () => {
    const question = {
      type: "T09",
      answer: "hola",
      commonMistakes: ["ola"],
      hint: "h 不能省略",
    };
    const snapshot = buildMistakeFeedbackSnapshot(question, "ola", {
      t,
      hintAlreadyShown: false,
      hintText: "",
    });
    expect(snapshot.commonMistakeFeedback).toContain("ola");
    expect(snapshot.nearMissFeedback).toBe("");
    expect(snapshot.wrongExplanation).toBe("");
  });

  it("captures near-miss feedback when common mistake does not apply", () => {
    const question = {
      type: "T09",
      answer: "hola",
      commonMistakes: [],
    };
    const snapshot = buildMistakeFeedbackSnapshot(question, "hol", {
      t,
      hintAlreadyShown: false,
      hintText: "",
    });
    expect(snapshot.commonMistakeFeedback).toBe("");
    expect(snapshot.nearMissFeedback).toContain("hol");
    expect(snapshot.wrongExplanation).toBe("");
  });

  it("captures wrong explanation when no P0 feedback is present", () => {
    const question = {
      type: "T12",
      pragmaticsNote: "要用过去时",
      options: ["Fui", "Voy"],
      answerIdx: 0,
    };
    const snapshot = buildMistakeFeedbackSnapshot(question, 1, {
      t,
      hintAlreadyShown: false,
      hintText: "",
    });
    expect(snapshot.wrongExplanation).toContain("过去时");
    expect(snapshot.wrongExplanationSource).toBe("pragmatics");
  });

  it("stores hint text shown before the wrong answer", () => {
    const question = {
      type: "T05",
      hint: "想想自我介绍",
      options: ["Ana", "casa"],
      answerIdx: 0,
    };
    const snapshot = buildMistakeFeedbackSnapshot(question, 1, {
      t,
      hintAlreadyShown: true,
      hintText: "想想自我介绍",
    });
    expect(snapshot.hintText).toBe("想想自我介绍");
  });
});

describe("mistakeSummaryLines", () => {
  it("prefers common mistake feedback over wrong explanation", () => {
    const lines = mistakeSummaryLines(
      {
        feedback: {
          commonMistakeFeedback: "常见拼写错误",
          wrongExplanation: "不应展示",
        },
      },
      t,
    );
    expect(lines).toEqual([{ type: "common-mistake", text: "常见拼写错误" }]);
  });

  it("prefers near-miss feedback over wrong explanation", () => {
    const lines = mistakeSummaryLines(
      {
        feedback: {
          nearMissFeedback: "很接近了",
          wrongExplanation: "不应展示",
        },
      },
      t,
    );
    expect(lines).toEqual([{ type: "near-miss", text: "很接近了" }]);
  });

  it("shows wrong explanation when no P0 feedback exists", () => {
    const lines = mistakeSummaryLines(
      {
        feedback: {
          wrongExplanation: "💡 想想名字",
        },
      },
      t,
    );
    expect(lines).toEqual([{ type: "wrong-explanation", text: "💡 想想名字" }]);
  });

  it("falls back to review hint when no feedback is available", () => {
    const lines = mistakeSummaryLines({ feedback: {} }, t);
    expect(lines).toEqual([
      { type: "fallback", text: "复习一下答错的题目，加深记忆后再继续" },
    ]);
  });
});

describe("markMistakeReinforced", () => {
  it("marks the matching mistake as reinforced", () => {
    const mistakes = [
      { question: { id: "q1" }, answer: 1, reinforced: false },
      { question: { id: "q2" }, answer: 0, reinforced: false },
    ];
    const updated = markMistakeReinforced(mistakes, "q2");
    expect(updated[0].reinforced).toBe(false);
    expect(updated[1].reinforced).toBe(true);
  });

  it("returns the original array when question id is missing", () => {
    const mistakes = [{ question: { id: "q1" }, reinforced: false }];
    expect(markMistakeReinforced(mistakes, null)).toBe(mistakes);
  });
});

describe("mistakeItemKey", () => {
  it("uses question id when available", () => {
    expect(mistakeItemKey({ question: { id: "q9" } }, 2)).toBe("q9");
  });

  it("falls back to index when question id is missing", () => {
    expect(mistakeItemKey({ question: {} }, 2)).toBe(2);
  });
});