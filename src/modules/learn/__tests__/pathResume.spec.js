import { describe, expect, it } from "vitest";
import {
  canResumeSection,
  findCurrentSection,
  pathSectionRoute,
  sectionKindIcon,
  sectionKindKey,
} from "../pathResume.js";

function makeCurriculum(sections, status = "active") {
  return {
    status,
    units: [{ id: "U01", title_native: "单元一", sections }],
  };
}

describe("findCurrentSection", () => {
  it("returns the section marked current in an active curriculum", () => {
    const curriculum = makeCurriculum([
      { id: "s1", kind: "grammar", current: false, locked: false },
      { id: "s2", kind: "practice", current: true, locked: false, question_count: 5 },
    ]);
    const hit = findCurrentSection(curriculum);
    expect(hit?.section.id).toBe("s2");
    expect(hit?.unit.id).toBe("U01");
  });

  it("returns null when curriculum is not active", () => {
    const curriculum = makeCurriculum(
      [{ id: "s1", kind: "practice", current: true, locked: false, question_count: 3 }],
      "level_complete",
    );
    expect(findCurrentSection(curriculum)).toBeNull();
  });

  it("returns null when no section is current", () => {
    const curriculum = makeCurriculum([
      { id: "s1", kind: "practice", current: false, locked: false, question_count: 3 },
    ]);
    expect(findCurrentSection(curriculum)).toBeNull();
  });
});

describe("canResumeSection", () => {
  it("allows grammar and vocab nodes", () => {
    expect(canResumeSection({ kind: "grammar", locked: false })).toBe(true);
    expect(canResumeSection({ kind: "vocab", locked: false })).toBe(true);
  });

  it("requires questions for practice nodes", () => {
    expect(
      canResumeSection({ kind: "practice", locked: false, question_count: 4 }),
    ).toBe(true);
    expect(
      canResumeSection({ kind: "practice", locked: false, question_count: 0 }),
    ).toBe(false);
  });

  it("rejects locked sections", () => {
    expect(
      canResumeSection({ kind: "grammar", locked: true }),
    ).toBe(false);
  });
});

describe("pathSectionRoute", () => {
  it("routes teaching nodes to path-teaching", () => {
    expect(pathSectionRoute({ id: "zh-es/U01-GRAMMAR", kind: "grammar" })).toEqual({
      name: "path-teaching",
      params: { nodeId: "zh-es/U01-GRAMMAR" },
    });
  });

  it("routes practice nodes to path-lesson", () => {
    expect(pathSectionRoute({ id: "zh-es/U01-PRACTICE", kind: "practice" })).toEqual({
      name: "path-lesson",
      params: { sectionId: "zh-es/U01-PRACTICE" },
    });
  });
});

describe("sectionKindKey and sectionKindIcon", () => {
  it("maps kinds to i18n keys and icons", () => {
    expect(sectionKindKey("grammar")).toBe("path.nodeGrammar");
    expect(sectionKindKey("vocab")).toBe("path.nodeVocab");
    expect(sectionKindKey("practice")).toBe("path.nodePractice");
    expect(sectionKindIcon("grammar")).toBe("📖");
    expect(sectionKindIcon("vocab")).toBe("🃏");
    expect(sectionKindIcon("practice")).toBe("⚡");
  });
});