import { describe, expect, it } from "vitest";
import { getDistractorExplanation } from "../distractorExplanation.js";

const t = (key, params = {}) => {
  const templates = {
    "path.wrongChoiceCompare": "compare:{wrong}/{correct}",
    "path.wrongChoiceGrammar": "grammar:{wrong}/{correct}/{grammarPoint}",
    "path.wrongChoiceGrammarDefault": "correct form",
    "path.wrongChoiceSemantics": "semantics:{wrong}/{correct}",
    "path.wrongChoiceScenario": "scenario:{wrong}/{correct}/{scenario}",
  };
  let text = templates[key] || key;
  for (const [k, v] of Object.entries(params)) {
    text = text.replace(`{${k}}`, String(v));
  }
  return text;
};

const t01 = {
  type: "T01",
  options: ["hola", "adiós", "gracias"],
  answerIdx: 0,
};

describe("getDistractorExplanation", () => {
  it("returns null for correct choice or missing selection", () => {
    expect(getDistractorExplanation(t01, 0, t)).toBeNull();
    expect(getDistractorExplanation(t01, null, t)).toBeNull();
    expect(getDistractorExplanation(null, 1, t)).toBeNull();
  });

  it("returns null for non-choice question types", () => {
    expect(getDistractorExplanation({ type: "T09", answer: "hola" }, "ola", t)).toBeNull();
  });

  it("uses compare template for T01", () => {
    expect(getDistractorExplanation(t01, 1, t)).toBe("compare:adiós/hola");
  });

  it("uses grammar template for T05", () => {
    const q = {
      type: "T05",
      options: ["fui", "voy", "iré"],
      answerIdx: 0,
    };
    expect(getDistractorExplanation(q, 1, t)).toBe("grammar:voy/fui/correct form");
  });

  it("uses semantics template for T07 and T08", () => {
    const q = {
      type: "T07",
      options: ["Ana", "casa", "perro"],
      answerIdx: 0,
    };
    expect(getDistractorExplanation(q, 2, t)).toBe("semantics:perro/Ana");
  });

  it("uses scenario template for T12 without pragmaticsNote", () => {
    const q = {
      type: "T12",
      scenario: "朋友问好",
      options: ["Hola", "Adiós"],
      answerIdx: 0,
    };
    expect(getDistractorExplanation(q, 1, t)).toBe("scenario:Adiós/Hola/朋友问好");
  });

  it("formats T02 image option descriptions", () => {
    const q = {
      type: "T02",
      imageOptions: [{ desc: "cat" }, { desc: "dog" }],
      answerIdx: 0,
    };
    expect(getDistractorExplanation(q, 1, t)).toBe("compare:dog/cat");
  });
});