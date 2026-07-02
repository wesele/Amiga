import { describe, expect, it } from "vitest";
import {
  RECOVERY_STEP_IDS,
  buildFailedLessonPlan,
} from "../failedLessonPlan.js";

describe("buildFailedLessonPlan", () => {
  it("always sets retry as the primary recovery step", () => {
    const plan = buildFailedLessonPlan({ mistakeCount: 0 });
    expect(plan.primary.id).toBe(RECOVERY_STEP_IDS.RETRY);
    expect(plan.primary.route).toBeNull();
    expect(plan.primary.continueKey).toBe("path.retry");
    expect(plan.secondary).toEqual([]);
  });

  it("adds fresh mistake reinforcement when mistakes exist", () => {
    const plan = buildFailedLessonPlan({
      mistakeCount: 4,
      freshMistakeCount: 3,
    });
    expect(plan.primary.id).toBe(RECOVERY_STEP_IDS.RETRY);
    expect(plan.secondary).toHaveLength(1);
    expect(plan.secondary[0].id).toBe(RECOVERY_STEP_IDS.FRESH_MISTAKE);
    expect(plan.secondary[0].count).toBe(3);
    expect(plan.secondary[0].route).toEqual({ name: "path-mistake-review" });
  });

  it("falls back to mistakeCount when freshMistakeCount is zero", () => {
    const plan = buildFailedLessonPlan({
      mistakeCount: 4,
      freshMistakeCount: 0,
    });
    expect(plan.secondary[0].count).toBe(4);
    expect(plan.secondary[0].titleParams).toEqual({ n: 4 });
  });

  it("does not add daily goal, vocab, or focus area nudges", () => {
    const plan = buildFailedLessonPlan({
      mistakeCount: 2,
      freshMistakeCount: 2,
    });
    expect(plan.secondary.map((s) => s.id)).toEqual([
      RECOVERY_STEP_IDS.FRESH_MISTAKE,
    ]);
  });
});