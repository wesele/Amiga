import { describe, expect, it } from "vitest";
import {
  briefingStarDisplay,
  estimatePracticeMinutes,
  findUnfinishedPrepSections,
  isBriefingEligible,
  prepBriefingChips,
  prepTeachingNodeId,
  shouldShowNodeBriefing,
  starThresholds,
} from "../pathNodeBriefing.js";

describe("estimatePracticeMinutes", () => {
  it("returns 0 for empty practice", () => {
    expect(estimatePracticeMinutes(0)).toBe(0);
  });

  it("enforces a 2-minute floor", () => {
    expect(estimatePracticeMinutes(1)).toBe(2);
    expect(estimatePracticeMinutes(2)).toBe(2);
  });

  it("scales with question count at 45s per question", () => {
    expect(estimatePracticeMinutes(8)).toBe(6);
    expect(estimatePracticeMinutes(12)).toBe(9);
  });
});

describe("starThresholds", () => {
  it("matches backend stars_from_score cutoffs", () => {
    expect(starThresholds()).toEqual({ one: 70, two: 85, three: 100 });
  });
});

describe("briefingStarDisplay", () => {
  it("shows pass line when not yet cleared", () => {
    expect(briefingStarDisplay({ stars: 0, best_score: 0 })).toEqual({
      mode: "unpassed",
      thresholds: { one: 70, two: 85, three: 100 },
    });
  });

  it("shows earned stars and best score when cleared", () => {
    expect(briefingStarDisplay({ stars: 2, best_score: 88 })).toEqual({
      mode: "passed",
      stars: 2,
      bestScore: 88,
      thresholds: { one: 70, two: 85, three: 100 },
    });
  });
});

describe("prepTeachingNodeId", () => {
  it("derives grammar and vocab node ids from a practice section", () => {
    expect(prepTeachingNodeId("zh-es/U01-PR01", "GRAMMAR")).toBe("zh-es/U01-GRAMMAR");
    expect(prepTeachingNodeId("zh-es/U01-PR01", "VOCAB")).toBe("zh-es/U01-VOCAB");
  });
});

describe("findUnfinishedPrepSections", () => {
  const unit = {
    sections: [
      { id: "g", kind: "grammar", stars: 0, locked: false },
      { id: "v", kind: "vocab", stars: 1, locked: false },
      { id: "p", kind: "practice", stars: 0, locked: false, question_count: 8 },
    ],
  };

  it("returns unfinished prep nodes for practice sections", () => {
    expect(findUnfinishedPrepSections(unit, unit.sections[2])).toEqual([unit.sections[0]]);
  });

  it("returns empty for grammar/vocab or missing unit", () => {
    expect(findUnfinishedPrepSections(unit, unit.sections[0])).toEqual([]);
    expect(findUnfinishedPrepSections(null, unit.sections[2])).toEqual([]);
  });
});

describe("shouldShowNodeBriefing", () => {
  it("shows for manual map node clicks", () => {
    expect(shouldShowNodeBriefing()).toBe(true);
    expect(shouldShowNodeBriefing({})).toBe(true);
  });

  it("bypasses FAB, learn hub continue, and post-lesson flows", () => {
    expect(shouldShowNodeBriefing({ fromJumpFab: true })).toBe(false);
    expect(shouldShowNodeBriefing({ fromContinue: true })).toBe(false);
    expect(shouldShowNodeBriefing({ fromPostLesson: true })).toBe(false);
  });
});

describe("isBriefingEligible", () => {
  it("rejects locked and empty practice nodes", () => {
    expect(isBriefingEligible({ kind: "practice", locked: true, question_count: 8 })).toBe(false);
    expect(isBriefingEligible({ kind: "practice", locked: false, question_count: 0 })).toBe(false);
  });

  it("accepts unlocked teaching and practice nodes", () => {
    expect(isBriefingEligible({ kind: "grammar", locked: false })).toBe(true);
    expect(isBriefingEligible({ kind: "vocab", locked: false })).toBe(true);
    expect(isBriefingEligible({ kind: "practice", locked: false, question_count: 5 })).toBe(true);
  });
});

describe("prepBriefingChips", () => {
  it("limits grammar points and vocab words", () => {
    expect(
      prepBriefingChips({
        grammar_points: ["a", "b", "c"],
        words: [{ word: "hola" }, { word: "adiós" }, { word: "gracias" }, { word: "por" }, { word: "favor" }],
      }),
    ).toEqual({
      grammarPoints: ["a", "b"],
      words: ["hola", "adiós", "gracias", "por"],
    });
  });

  it("returns empty chips when teaching is missing", () => {
    expect(prepBriefingChips(null)).toEqual({ grammarPoints: [], words: [] });
  });
});