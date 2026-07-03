import { describe, expect, it } from "vitest";
import {
  RECOVERY_STEP_IDS,
  buildFailedLessonPlan,
} from "../failedLessonPlan.js";

const grammarPrep = {
  id: "zh-es/U01-GRAMMAR",
  kind: "grammar",
  stars: 0,
  locked: false,
};

const vocabPrep = {
  id: "zh-es/U01-VOCAB",
  kind: "vocab",
  stars: 0,
  locked: false,
};

function mistake(type) {
  return { question: { type } };
}

describe("buildFailedLessonPlan", () => {
  it("falls back to retry when there are no mistakes", () => {
    const plan = buildFailedLessonPlan({ mistakeCount: 0 });
    expect(plan.primary.id).toBe(RECOVERY_STEP_IDS.RETRY);
    expect(plan.primary.route).toBeNull();
    expect(plan.primary.continueKey).toBe("path.retry");
    expect(plan.secondary).toEqual([]);
  });

  it("prioritizes grammar prep when prep is unfinished and grammar mistakes dominate", () => {
    const plan = buildFailedLessonPlan({
      mistakeCount: 3,
      freshMistakeCount: 3,
      mistakes: [mistake("T05"), mistake("T05"), mistake("T08")],
      unfinishedPrep: [grammarPrep, vocabPrep],
    });
    expect(plan.primary.id).toBe(RECOVERY_STEP_IDS.GRAMMAR_PREP);
    expect(plan.primary.route).toEqual({
      name: "path-teaching",
      params: { nodeId: "zh-es/U01-GRAMMAR" },
    });
    expect(plan.primary.continueKey).toBe("path.recoveryContinue.grammarPrep");
    expect(plan.secondary.some((step) => step.id === RECOVERY_STEP_IDS.RETRY)).toBe(true);
  });

  it("prioritizes vocab prep when grammar prep is done but vocab mistakes remain", () => {
    const plan = buildFailedLessonPlan({
      mistakeCount: 2,
      mistakes: [mistake("T01"), mistake("T09")],
      unfinishedPrep: [vocabPrep],
    });
    expect(plan.primary.id).toBe(RECOVERY_STEP_IDS.VOCAB_PREP);
    expect(plan.primary.route).toEqual({
      name: "path-teaching",
      params: { nodeId: "zh-es/U01-VOCAB" },
    });
  });

  it("does not suggest prep when unfinished prep does not match mistake profile", () => {
    const plan = buildFailedLessonPlan({
      mistakeCount: 2,
      mistakes: [mistake("T01"), mistake("T09")],
      unfinishedPrep: [grammarPrep],
    });
    expect(plan.primary.id).toBe(RECOVERY_STEP_IDS.RETRY);
    expect(plan.secondary.map((step) => step.id)).not.toContain(RECOVERY_STEP_IDS.GRAMMAR_PREP);
  });

  it("prioritizes focus area practice when dominant type matches weak area", () => {
    const plan = buildFailedLessonPlan({
      mistakeCount: 3,
      mistakes: [mistake("T07"), mistake("T07"), mistake("T05")],
      unfinishedPrep: [],
      focusArea: { typeId: "T07", accuracyPct: 62 },
    });
    expect(plan.primary.id).toBe(RECOVERY_STEP_IDS.FOCUS_AREA);
    expect(plan.primary.route).toEqual({
      name: "path-focus-practice",
      params: { typeId: "T07" },
    });
  });

  it("promotes fresh mistake reinforcement when fresh count reaches two", () => {
    const plan = buildFailedLessonPlan({
      mistakeCount: 4,
      freshMistakeCount: 3,
      mistakes: [mistake("T03"), mistake("T04"), mistake("T06"), mistake("T12")],
    });
    expect(plan.primary.id).toBe(RECOVERY_STEP_IDS.FRESH_MISTAKE);
    expect(plan.primary.count).toBe(3);
    expect(plan.secondary[0].id).toBe(RECOVERY_STEP_IDS.RETRY);
  });

  it("keeps retry primary with a single unmatched mistake", () => {
    const plan = buildFailedLessonPlan({
      mistakeCount: 1,
      freshMistakeCount: 1,
      mistakes: [mistake("T03")],
    });
    expect(plan.primary.id).toBe(RECOVERY_STEP_IDS.RETRY);
    expect(plan.secondary.map((step) => step.id)).toEqual([
      RECOVERY_STEP_IDS.FRESH_MISTAKE,
      RECOVERY_STEP_IDS.PATH,
    ]);
    expect(plan.secondary[0].count).toBe(1);
  });
});