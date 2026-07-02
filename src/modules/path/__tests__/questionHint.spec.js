import { describe, expect, it } from "vitest";
import { getPostAnswerHint, getQuestionHint, hasQuestionHint } from "../questionHint.js";

const t = (key, params = {}) => {
  const templates = {
    "path.hintEliminate": "排除：{options}",
    "path.hintMatchPair": "{left} → {right}",
    "path.hintWordOrder": "{count} words, first: {first}",
    "path.hintSpelling": "starts with {prefix}",
    "path.wrongHintEliminate": "not these: {options}",
    "path.wrongHintMatchPair": "pair: {left} → {right}",
    "path.wrongHintWordOrder": "{count} words, start: {first}",
    "path.wrongHintSpelling": "starts with {prefix}",
  };
  let text = templates[key] || key;
  for (const [k, v] of Object.entries(params)) {
    text = text.replace(`{${k}}`, String(v));
  }
  return text;
};

describe("getQuestionHint", () => {
  it("prefers author-written hint when present", () => {
    const q = { type: "T05", hint: "想想自我介绍时会说什么名字", options: ["A", "B"], answerIdx: 0 };
    expect(getQuestionHint(q, t)).toBe("想想自我介绍时会说什么名字");
  });

  it("suggests eliminating wrong options for multiple-choice", () => {
    const q = {
      type: "T07",
      options: ["Ana", "casa", "perro", "libro"],
      answerIdx: 0,
    };
    expect(getQuestionHint(q, t)).toBe("排除：casa、perro");
  });

  it("reveals one matching pair for T03", () => {
    const q = {
      type: "T03",
      pairs: [
        { left: "hola", right: "你好" },
        { left: "adiós", right: "再见" },
      ],
    };
    expect(getQuestionHint(q, t)).toBe("hola → 你好");
  });

  it("shows word count and first word for T06", () => {
    const q = { type: "T06", targetSentence: "Yo soy estudiante." };
    expect(getQuestionHint(q, t)).toBe("3 words, first: Yo");
  });

  it("shows spelling prefix for free-text answers", () => {
    expect(getQuestionHint({ type: "T09", answer: "café" }, t)).toBe("starts with ca");
    expect(getQuestionHint({ type: "T10", acceptedAnswers: ["Hello"] }, t)).toBe("starts with He");
  });

  it("returns null when no hint can be generated", () => {
    expect(getQuestionHint({ type: "T07", options: [], answerIdx: 0 }, t)).toBeNull();
    expect(getQuestionHint(null, t)).toBeNull();
  });
});

describe("getPostAnswerHint", () => {
  it("uses corrective tone for generated choice hints", () => {
    const q = {
      type: "T07",
      options: ["Ana", "casa", "perro", "libro"],
      answerIdx: 0,
    };
    expect(getPostAnswerHint(q, t)).toBe("not these: casa、perro");
  });

  it("ignores author-written hint", () => {
    const q = {
      type: "T05",
      hint: "作者写的提示",
      options: ["A", "B"],
      answerIdx: 0,
    };
    expect(getPostAnswerHint(q, t)).toBe("not these: B");
  });

  it("returns null when no post-answer hint can be generated", () => {
    expect(getPostAnswerHint({ type: "T07", options: [], answerIdx: 0 }, t)).toBeNull();
  });
});

describe("hasQuestionHint", () => {
  it("detects hint availability without needing i18n", () => {
    expect(hasQuestionHint({ type: "T09", hint: "语境提示" })).toBe(true);
    expect(hasQuestionHint({ type: "T07", options: ["A", "B"], answerIdx: 0 })).toBe(true);
    expect(hasQuestionHint({ type: "T07", options: [], answerIdx: 0 })).toBe(false);
    expect(hasQuestionHint(null)).toBe(false);
  });
});