import { describe, expect, it } from "vitest";
import {
  STEP_IDS,
  buildPostLessonPlan,
  primaryStepRoute,
  shouldShowFreshMistakeInMistakeSection,
} from "../postLessonPlan.js";

const PASSED = { passed: true };

describe("buildPostLessonPlan", () => {
  it("prioritizes daily goal when lessons remain", () => {
    const plan = buildPostLessonPlan({
      result: {
        ...PASSED,
        daily_goal_lessons_today: 1,
        daily_goal_target: 2,
      },
      dueMistakesAtStart: 3,
      dueVocabAtStart: 5,
      focusArea: { typeId: "T05", accuracyPct: 40 },
    });
    expect(plan.primary.id).toBe(STEP_IDS.DAILY_GOAL);
    expect(plan.secondary).toEqual([]);
  });

  it("prioritizes fresh mistakes when daily goal is met", () => {
    const plan = buildPostLessonPlan({
      result: {
        ...PASSED,
        daily_goal_just_met: true,
        daily_goal_lessons_today: 2,
        daily_goal_target: 2,
      },
      freshMistakeCount: 2,
      dueMistakesAtStart: 1,
    });
    expect(plan.primary.id).toBe(STEP_IDS.FRESH_MISTAKE);
    expect(plan.secondary.map((s) => s.id)).toEqual([
      STEP_IDS.MISTAKE_REVIEW,
      STEP_IDS.PATH,
    ]);
    expect(plan.primary.route.name).toBe("path-mistake-review");
  });

  it("prioritizes due mistake review over vocab and focus area", () => {
    const plan = buildPostLessonPlan({
      result: {
        ...PASSED,
        daily_goal_just_met: true,
        daily_goal_lessons_today: 2,
        daily_goal_target: 2,
      },
      dueMistakesAtStart: 2,
      dueVocabAtStart: 4,
      focusArea: { typeId: "T09", accuracyPct: 30 },
    });
    expect(plan.primary.id).toBe(STEP_IDS.MISTAKE_REVIEW);
    expect(plan.secondary.map((s) => s.id)).toEqual([
      STEP_IDS.VOCAB_REVIEW,
      STEP_IDS.FOCUS_AREA,
      STEP_IDS.PATH,
    ]);
  });

  it("prioritizes vocab review over focus area and path", () => {
    const plan = buildPostLessonPlan({
      result: {
        ...PASSED,
        daily_goal_just_met: true,
        daily_goal_lessons_today: 2,
        daily_goal_target: 2,
      },
      dueVocabAtStart: 3,
      focusArea: { typeId: "T05", accuracyPct: 20 },
    });
    expect(plan.primary.id).toBe(STEP_IDS.VOCAB_REVIEW);
    expect(plan.secondary.map((s) => s.id)).toEqual([
      STEP_IDS.FOCUS_AREA,
      STEP_IDS.PATH,
    ]);
  });

  it("routes to focus practice when only weak area remains", () => {
    const plan = buildPostLessonPlan({
      result: {
        ...PASSED,
        daily_goal_just_met: true,
        daily_goal_lessons_today: 2,
        daily_goal_target: 2,
      },
      focusArea: { typeId: "T05", accuracyPct: 15 },
    });
    expect(plan.primary.id).toBe(STEP_IDS.FOCUS_AREA);
    expect(plan.primary.route.name).toBe("path-focus-practice");
    expect(plan.secondary.map((s) => s.id)).toEqual([STEP_IDS.PATH]);
  });

  it("continues to the next lesson when no reviews are due", () => {
    const plan = buildPostLessonPlan({
      result: {
        ...PASSED,
        daily_goal_just_met: true,
        daily_goal_lessons_today: 2,
        daily_goal_target: 2,
        next_section_id: "zh-es/U02-PRACTICE",
      },
    });
    expect(plan.primary.id).toBe(STEP_IDS.NEXT_LESSON);
    expect(plan.primary.route.name).toBe("path-lesson");
    expect(plan.secondary).toEqual([]);
  });

  it("demotes weekly goal to secondary when daily goal is met", () => {
    const plan = buildPostLessonPlan({
      result: {
        ...PASSED,
        daily_goal_just_met: true,
        daily_goal_lessons_today: 2,
        daily_goal_target: 2,
        weekly_goal_active_days: 3,
        weekly_goal_target_days: 5,
      },
    });
    expect(plan.primary.id).toBe(STEP_IDS.PATH);
    expect(plan.secondary.map((s) => s.id)).toEqual([STEP_IDS.WEEKLY_GOAL]);
  });

  it("returns null for a failed lesson", () => {
    expect(buildPostLessonPlan({ result: { passed: false } })).toBeNull();
  });
});

describe("primaryStepRoute", () => {
  it("falls back to path when plan is missing", () => {
    expect(primaryStepRoute(null)).toEqual({ name: "path", query: { focus: "current" } });
  });
});

describe("shouldShowFreshMistakeInMistakeSection", () => {
  it("shows fresh mistakes in the mistake section when daily goal blocks primary", () => {
    const plan = buildPostLessonPlan({
      result: {
        ...PASSED,
        daily_goal_lessons_today: 1,
        daily_goal_target: 2,
      },
      freshMistakeCount: 1,
    });
    expect(
      shouldShowFreshMistakeInMistakeSection(
        { ...PASSED, daily_goal_lessons_today: 1, daily_goal_target: 2 },
        1,
        plan,
      ),
    ).toBe(true);
  });

  it("hides fresh mistakes in the mistake section when they are primary", () => {
    const plan = buildPostLessonPlan({
      result: {
        ...PASSED,
        daily_goal_just_met: true,
        daily_goal_lessons_today: 2,
        daily_goal_target: 2,
      },
      freshMistakeCount: 1,
    });
    expect(
      shouldShowFreshMistakeInMistakeSection(
        { ...PASSED, daily_goal_just_met: true },
        1,
        plan,
      ),
    ).toBe(false);
  });
});