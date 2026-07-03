import { describe, expect, it } from "vitest";
import {
  CELEBRATE_QUERY,
  CELEBRATION_DURATION_MS,
  celebrationToastCopy,
  findSectionUnit,
  isUnitJustCompleted,
  parseCelebrationQuery,
  pathRouteForCompletion,
  pathRouteWithCelebration,
} from "../pathCompletionCelebration.js";

const t = (key, params = {}) => {
  const table = {
    "path.celebrateNode": `练习完成 · ${params.stars}`,
    "path.celebrateTeaching": `${params.kind}完成`,
    "path.celebrateUnitComplete": `单元完成 · ${params.unit}`,
    "path.perfectLesson": "✨ 完美通关！",
    "path.nodeGrammar": "单元知识",
    "path.nodeVocab": "单词学习",
    "path.nodePractice": "闯关练习",
  };
  return table[key] ?? key;
};

function makeCurriculum(sections) {
  return {
    units: [{ id: "U01", title_native: "基础问候", sections }],
  };
}

describe("pathRouteWithCelebration", () => {
  it("builds path route with celebration query fields", () => {
    expect(
      pathRouteWithCelebration({
        sectionId: "zh-es/U01-S01",
        kind: "practice",
        stars: 3,
        perfect: true,
      }),
    ).toEqual({
      name: "path",
      query: {
        focus: "current",
        [CELEBRATE_QUERY]: "zh-es/U01-S01",
        stars: "3",
        kind: "practice",
        perfect: "1",
      },
    });
  });

  it("includes unit completion fields when provided", () => {
    expect(
      pathRouteWithCelebration({
        sectionId: "zh-es/U01-S01",
        kind: "practice",
        stars: 2,
        unitComplete: true,
        unitTitle: "基础问候",
      }),
    ).toEqual({
      name: "path",
      query: {
        focus: "current",
        [CELEBRATE_QUERY]: "zh-es/U01-S01",
        stars: "2",
        kind: "practice",
        unit: "1",
        unitTitle: "基础问候",
      },
    });
  });
});

describe("pathRouteForCompletion", () => {
  it("returns celebration route for a passed lesson", () => {
    const route = pathRouteForCompletion({
      completedSectionId: "zh-es/U01-S01",
      result: { passed: true, stars: 2 },
      perfectLesson: true,
    });
    expect(route.query[CELEBRATE_QUERY]).toBe("zh-es/U01-S01");
    expect(route.query.perfect).toBe("1");
  });

  it("falls back to focus-only path route without completion context", () => {
    expect(pathRouteForCompletion()).toEqual({ name: "path", query: { focus: "current" } });
    expect(
      pathRouteForCompletion({ completedSectionId: "zh-es/U01-S01", result: { passed: false } }),
    ).toEqual({ name: "path", query: { focus: "current" } });
  });
});

describe("parseCelebrationQuery", () => {
  it("parses a valid celebration query", () => {
    expect(
      parseCelebrationQuery({
        celebrate: "zh-es/U01-GRAMMAR",
        kind: "grammar",
        stars: "0",
      }),
    ).toEqual({
      sectionId: "zh-es/U01-GRAMMAR",
      kind: "grammar",
      stars: 0,
      perfect: false,
      unitComplete: false,
      unitTitle: undefined,
    });
  });

  it("returns null for missing or invalid payloads", () => {
    expect(parseCelebrationQuery({})).toBeNull();
    expect(parseCelebrationQuery({ celebrate: "x", kind: "quiz" })).toBeNull();
    expect(parseCelebrationQuery({ celebrate: "", kind: "practice" })).toBeNull();
  });

  it("clamps stars and reads optional flags", () => {
    expect(
      parseCelebrationQuery({
        celebrate: "zh-es/U01-S01",
        kind: "practice",
        stars: "9",
        perfect: "1",
        unit: "1",
        unitTitle: "单元一",
      }),
    ).toEqual({
      sectionId: "zh-es/U01-S01",
      kind: "practice",
      stars: 3,
      perfect: true,
      unitComplete: true,
      unitTitle: "单元一",
    });
  });
});

describe("isUnitJustCompleted", () => {
  it("returns true when the last section in a unit is fully starred", () => {
    const curriculum = makeCurriculum([
      { id: "zh-es/U01-GRAMMAR", stars: 1 },
      { id: "zh-es/U01-VOCAB", stars: 1 },
      { id: "zh-es/U01-S01", stars: 3 },
    ]);
    expect(isUnitJustCompleted(curriculum, "zh-es/U01-S01")).toBe(true);
  });

  it("returns false when completed section is not the last in the unit", () => {
    const curriculum = makeCurriculum([
      { id: "zh-es/U01-GRAMMAR", stars: 1 },
      { id: "zh-es/U01-VOCAB", stars: 0 },
      { id: "zh-es/U01-S01", stars: 0 },
    ]);
    expect(isUnitJustCompleted(curriculum, "zh-es/U01-GRAMMAR")).toBe(false);
  });

  it("returns false when earlier sections are not completed", () => {
    const curriculum = makeCurriculum([
      { id: "zh-es/U01-GRAMMAR", stars: 1 },
      { id: "zh-es/U01-VOCAB", stars: 0 },
      { id: "zh-es/U01-S01", stars: 3 },
    ]);
    expect(isUnitJustCompleted(curriculum, "zh-es/U01-S01")).toBe(false);
  });
});

describe("findSectionUnit", () => {
  it("finds the owning unit for a section id", () => {
    const curriculum = makeCurriculum([{ id: "zh-es/U01-VOCAB", stars: 1 }]);
    const found = findSectionUnit(curriculum, "zh-es/U01-VOCAB");
    expect(found?.unit.title_native).toBe("基础问候");
    expect(found?.section.id).toBe("zh-es/U01-VOCAB");
  });
});

describe("celebrationToastCopy", () => {
  it("uses practice copy with stars", () => {
    expect(
      celebrationToastCopy(
        { kind: "practice", stars: 3, perfect: false, unitComplete: false },
        t,
        { sectionTitle: "基础问候", kindLabel: "闯关练习" },
      ),
    ).toEqual({ main: "练习完成 · ★★★", sub: "基础问候" });
  });

  it("uses teaching copy without stars", () => {
    expect(
      celebrationToastCopy(
        { kind: "grammar", stars: 0, perfect: false, unitComplete: false },
        t,
        { sectionTitle: "问候语", kindLabel: "单元知识" },
      ),
    ).toEqual({ main: "单元知识完成", sub: "问候语" });
  });

  it("uses unit-complete copy when the unit is finished", () => {
    expect(
      celebrationToastCopy(
        {
          kind: "practice",
          stars: 3,
          perfect: false,
          unitComplete: true,
          unitTitle: "基础问候",
        },
        t,
        { sectionTitle: "闯关练习" },
      ),
    ).toEqual({ main: "单元完成 · 基础问候", sub: "闯关练习" });
  });
});

describe("CELEBRATION_DURATION_MS", () => {
  it("is within the design range", () => {
    expect(CELEBRATION_DURATION_MS).toBeGreaterThanOrEqual(1500);
    expect(CELEBRATION_DURATION_MS).toBeLessThanOrEqual(2000);
  });
});