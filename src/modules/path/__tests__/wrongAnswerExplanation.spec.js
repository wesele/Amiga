import { describe, expect, it } from "vitest";
import { getWrongAnswerExplanation } from "../wrongAnswerExplanation.js";

const t = (key, params = {}) => {
  const templates = {
    "path.wrongExplanationPragmatics": "📖 {note}",
    "path.wrongExplanationAuthoredHint": "💡 {hint}",
    "path.wrongExplanationGenerated": "💡 {hint}",
    "path.wrongChoiceCompare": "compare:{wrong}/{correct}",
    "path.wrongChoiceGrammar": "grammar:{wrong}/{correct}/{grammarPoint}",
    "path.wrongChoiceGrammarDefault": "form",
    "path.wrongChoiceSemantics": "semantics:{wrong}/{correct}",
    "path.wrongChoiceScenario": "scenario:{wrong}/{correct}/{scenario}",
    "path.wrongHintEliminate": "eliminate:{options}",
    "path.commonMistakeTip": "common:{mistake}",
    "path.nearMissTip": "near:{answer}",
  };
  let text = templates[key] || key;
  for (const [k, v] of Object.entries(params)) {
    text = text.replace(`{${k}}`, String(v));
  }
  return text;
};

const baseCtx = {
  t,
  hintAlreadyShown: false,
  commonMistakeFeedback: "",
  nearMissFeedback: "",
};

describe("getWrongAnswerExplanation", () => {
  it("returns null when common mistake feedback is already shown (P0)", () => {
    const q = {
      type: "T12",
      pragmaticsNote: "语用说明",
      options: ["A", "B"],
      answerIdx: 0,
    };
    expect(
      getWrongAnswerExplanation(q, 1, {
        ...baseCtx,
        commonMistakeFeedback: "已有常见错误提示",
      }),
    ).toBeNull();
  });

  it("returns null when near-miss feedback is already shown (P0)", () => {
    const q = {
      type: "T07",
      options: ["A", "B", "C"],
      answerIdx: 0,
    };
    expect(
      getWrongAnswerExplanation(q, 1, {
        ...baseCtx,
        nearMissFeedback: "很接近了",
      }),
    ).toBeNull();
  });

  it("prefers pragmaticsNote for T12 (P1)", () => {
    const q = {
      type: "T12",
      pragmaticsNote: "过去时才能回答上周末做了什么",
      options: ["Fui", "Voy", "Iré"],
      answerIdx: 0,
    };
    const result = getWrongAnswerExplanation(q, 1, baseCtx);
    expect(result).toEqual({
      text: "📖 过去时才能回答上周末做了什么",
      source: "pragmatics",
    });
  });

  it("shows authored hint when not pre-shown (P2)", () => {
    const q = {
      type: "T05",
      hint: "想想自我介绍时会说什么名字",
      options: ["Ana", "casa"],
      answerIdx: 0,
    };
    const result = getWrongAnswerExplanation(q, 1, baseCtx);
    expect(result).toEqual({
      text: "💡 想想自我介绍时会说什么名字",
      source: "authored-hint",
    });
  });

  it("skips authored hint when already shown before answering", () => {
    const q = {
      type: "T05",
      hint: "作者提示",
      options: ["Ana", "casa"],
      answerIdx: 0,
    };
    const result = getWrongAnswerExplanation(q, 1, {
      ...baseCtx,
      hintAlreadyShown: true,
    });
    expect(result?.source).toBe("distractor-compare");
    expect(result?.text).toBe("grammar:casa/Ana/form");
  });

  it("uses distractor compare for wrong multiple-choice (P3)", () => {
    const q = {
      type: "T01",
      options: ["hola", "adiós"],
      answerIdx: 0,
    };
    const result = getWrongAnswerExplanation(q, 1, baseCtx);
    expect(result).toEqual({
      text: "compare:adiós/hola",
      source: "distractor-compare",
    });
  });

  it("falls back to generated hint when no distractor applies (P4)", () => {
    const q = {
      type: "T06",
      targetSentence: "Yo soy estudiante.",
      words: ["Yo", "soy", "estudiante."],
    };
    const result = getWrongAnswerExplanation(q, ["estudiante.", "soy", "Yo"], baseCtx);
    expect(result?.source).toBe("generated-hint");
    expect(result?.text).toContain("💡");
  });

  it("does not repeat generated hint when pre-shown (P4 skip)", () => {
    const q = {
      type: "T07",
      options: ["Ana", "casa", "perro"],
      answerIdx: 0,
    };
    expect(
      getWrongAnswerExplanation(q, 2, {
        ...baseCtx,
        hintAlreadyShown: true,
      }),
    ).toEqual({
      text: "semantics:perro/Ana",
      source: "distractor-compare",
    });
  });

  it("returns null when no explanation can be produced (P5)", () => {
    expect(getWrongAnswerExplanation(null, 0, baseCtx)).toBeNull();
    expect(
      getWrongAnswerExplanation(
        { type: "T07", options: [], answerIdx: 0 },
        0,
        baseCtx,
      ),
    ).toBeNull();
  });
});