import { describe, expect, it } from "vitest";
import {
  continueRouteAfterLesson,
  sectionKindFromId,
  shouldContinueToNextLesson,
  teachingContinueCtaKeys,
} from "../lessonContinue.js";

describe("sectionKindFromId", () => {
  it("maps grammar and vocab teaching nodes", () => {
    expect(sectionKindFromId("zh-es/U01-GRAMMAR")).toBe("grammar");
    expect(sectionKindFromId("zh-es/U01-VOCAB")).toBe("vocab");
  });

  it("treats other ids as practice sections", () => {
    expect(sectionKindFromId("zh-es/U01-PRACTICE")).toBe("practice");
    expect(sectionKindFromId("zh-es/U02-S01")).toBe("practice");
  });

  it("returns null for empty ids", () => {
    expect(sectionKindFromId("")).toBeNull();
    expect(sectionKindFromId(null)).toBeNull();
  });
});

describe("continueRouteAfterLesson", () => {
  it("routes to the next teaching node after a passing lesson", () => {
    expect(
      continueRouteAfterLesson({
        passed: true,
        next_section_id: "zh-es/U01-VOCAB",
      }),
    ).toEqual({
      name: "path-teaching",
      params: { nodeId: "zh-es/U01-VOCAB" },
    });
  });

  it("routes to the next practice lesson when available", () => {
    expect(
      continueRouteAfterLesson({
        passed: true,
        next_section_id: "zh-es/U02-PRACTICE",
      }),
    ).toEqual({
      name: "path-lesson",
      params: { sectionId: "zh-es/U02-PRACTICE" },
    });
  });

  it("returns null when the lesson failed or there is no next node", () => {
    expect(
      continueRouteAfterLesson({
        passed: false,
        next_section_id: "zh-es/U02-PRACTICE",
      }),
    ).toBeNull();
    expect(
      continueRouteAfterLesson({
        passed: true,
        next_section_id: null,
      }),
    ).toBeNull();
  });

  it("returns null after a level upgrade so learners can see the celebration", () => {
    expect(
      continueRouteAfterLesson({
        passed: true,
        level_upgraded: true,
        next_section_id: "zh-es/U02-GRAMMAR",
      }),
    ).toBeNull();
  });
});

describe("teachingContinueCtaKeys", () => {
  it("maps grammar completion to vocab CTA keys", () => {
    expect(
      teachingContinueCtaKeys({
        passed: true,
        next_section_id: "zh-es/U01-VOCAB",
      }),
    ).toEqual({
      labelKey: "path.teachingContinue.toVocab",
      subtitleKey: "path.teachingContinue.toVocabSub",
    });
  });

  it("maps vocab completion to practice CTA keys", () => {
    expect(
      teachingContinueCtaKeys({
        passed: true,
        next_section_id: "zh-es/U01-PRACTICE",
      }),
    ).toEqual({
      labelKey: "path.teachingContinue.toPractice",
      subtitleKey: "path.teachingContinue.toPracticeSub",
    });
  });

  it("returns null when auto-continue is blocked", () => {
    expect(
      teachingContinueCtaKeys({
        passed: true,
        level_upgraded: true,
        next_section_id: "zh-es/U02-GRAMMAR",
      }),
    ).toBeNull();
  });
});

describe("shouldContinueToNextLesson", () => {
  it("is true only when a direct continue route exists", () => {
    expect(
      shouldContinueToNextLesson({
        passed: true,
        next_section_id: "zh-es/U01-VOCAB",
      }),
    ).toBe(true);
    expect(
      shouldContinueToNextLesson({
        passed: true,
        next_section_id: null,
      }),
    ).toBe(false);
  });
});