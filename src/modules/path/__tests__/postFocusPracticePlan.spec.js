import { describe, expect, it } from "vitest";
import {
  FOCUS_STEP_IDS,
  buildPostFocusPracticePlan,
  isAiPracticeStep,
  isContinueFocusStep,
  isNextWeakStep,
} from "../postFocusPracticePlan.js";

const GOAL_UNMET = {
  daily_goal: {
    lessons_today: 0,
    effective_lessons_today: 1,
    target_lessons: 2,
    goal_met: false,
  },
};

const GOAL_MET = {
  daily_goal: {
    lessons_today: 2,
    effective_lessons_today: 2,
    target_lessons: 2,
    goal_met: true,
  },
};

const NOT_GRADUATED = {
  beforePct: 58,
  afterPct: 63,
  delta: 5,
  graduated: false,
  progressPct: 63,
  remainingPct: 7,
};

const GRADUATED = {
  beforePct: 62,
  afterPct: 68,
  delta: 6,
  graduated: true,
  progressPct: 100,
  remainingPct: 0,
};

const RESUME_TARGET = {
  unit: { title_native: "Unit 1" },
  section: { id: "zh-es/U01-GRAMMAR", kind: "grammar", title_native: "语法" },
};

describe("buildPostFocusPracticePlan", () => {
  it("prioritizes continue focus when the round was imperfect and not graduated", () => {
    const plan = buildPostFocusPracticePlan({
      streakUpdate: GOAL_UNMET,
      progressSummary: NOT_GRADUATED,
      currentTypeId: "T07",
      nextWeakTypeId: null,
      roundAccuracyPct: 80,
      questionCount: 10,
      dueMistakes: 3,
      dueVocabCount: 5,
      newsUnreadCount: 2,
      resumeTarget: RESUME_TARGET,
    });
    expect(plan.primary.id).toBe(FOCUS_STEP_IDS.CONTINUE_FOCUS);
    expect(isContinueFocusStep(plan.primary)).toBe(true);
    expect(plan.secondary.map((s) => s.id)).toContain(FOCUS_STEP_IDS.NEXT_LESSON);
    expect(plan.secondary.map((s) => s.id)).not.toContain(FOCUS_STEP_IDS.CONTINUE_FOCUS);
    expect(plan.secondary.length).toBeLessThanOrEqual(3);
  });

  it("prioritizes next weak type after graduation", () => {
    const plan = buildPostFocusPracticePlan({
      streakUpdate: GOAL_MET,
      progressSummary: GRADUATED,
      currentTypeId: "T07",
      nextWeakTypeId: "T09",
      roundAccuracyPct: 90,
      questionCount: 10,
      dueMistakes: 0,
      dueVocabCount: 0,
      newsUnreadCount: 0,
      resumeTarget: null,
    });
    expect(plan.primary.id).toBe(FOCUS_STEP_IDS.NEXT_WEAK);
    expect(isNextWeakStep(plan.primary)).toBe(true);
    expect(plan.primary.route).toEqual({
      name: "path-focus-practice",
      params: { typeId: "T09" },
    });
  });

  it("routes to the current path section when daily goal is unmet", () => {
    const plan = buildPostFocusPracticePlan({
      streakUpdate: GOAL_UNMET,
      progressSummary: GRADUATED,
      currentTypeId: "T07",
      nextWeakTypeId: null,
      roundAccuracyPct: 100,
      questionCount: 10,
      dueMistakes: 0,
      dueVocabCount: 0,
      newsUnreadCount: 0,
      resumeTarget: RESUME_TARGET,
    });
    expect(plan.primary.id).toBe(FOCUS_STEP_IDS.NEXT_LESSON);
    expect(plan.primary.route).toEqual({
      name: "path-teaching",
      params: { nodeId: "zh-es/U01-GRAMMAR" },
    });
  });

  it("routes to path map when daily goal is unmet and there is no resume target", () => {
    const plan = buildPostFocusPracticePlan({
      streakUpdate: GOAL_UNMET,
      progressSummary: GRADUATED,
      currentTypeId: "T07",
      nextWeakTypeId: null,
      roundAccuracyPct: 100,
      questionCount: 10,
      dueMistakes: 0,
      dueVocabCount: 0,
      newsUnreadCount: 0,
      resumeTarget: null,
    });
    expect(plan.primary.id).toBe(FOCUS_STEP_IDS.DAILY_GOAL);
    expect(plan.primary.route).toEqual({ name: "path" });
  });

  it("prioritizes mistake review when mistakes are due after a perfect round", () => {
    const plan = buildPostFocusPracticePlan({
      streakUpdate: GOAL_MET,
      progressSummary: NOT_GRADUATED,
      currentTypeId: "T07",
      nextWeakTypeId: null,
      roundAccuracyPct: 100,
      questionCount: 10,
      dueMistakes: 3,
      dueVocabCount: 5,
      newsUnreadCount: 2,
      resumeTarget: null,
    });
    expect(plan.primary.id).toBe(FOCUS_STEP_IDS.MISTAKE_REVIEW);
    expect(plan.primary.route).toEqual({ name: "path-mistake-review" });
    expect(plan.secondary.map((s) => s.id)).toContain(FOCUS_STEP_IDS.VOCAB_REVIEW);
  });

  it("offers consolidation when the round was perfect but still not graduated", () => {
    const plan = buildPostFocusPracticePlan({
      streakUpdate: GOAL_MET,
      progressSummary: NOT_GRADUATED,
      currentTypeId: "T07",
      nextWeakTypeId: null,
      roundAccuracyPct: 100,
      questionCount: 10,
      dueMistakes: 0,
      dueVocabCount: 0,
      newsUnreadCount: 0,
      resumeTarget: null,
    });
    expect(plan.primary.id).toBe(FOCUS_STEP_IDS.CONTINUE_FOCUS);
    expect(isContinueFocusStep(plan.primary)).toBe(true);
  });

  it("offers news reading when daily goal is met and unread articles remain", () => {
    const plan = buildPostFocusPracticePlan({
      streakUpdate: GOAL_MET,
      progressSummary: NOT_GRADUATED,
      currentTypeId: "T07",
      nextWeakTypeId: null,
      roundAccuracyPct: 70,
      questionCount: 10,
      dueMistakes: 0,
      dueVocabCount: 0,
      newsUnreadCount: 4,
      resumeTarget: null,
    });
    expect(plan.primary.id).toBe(FOCUS_STEP_IDS.CONTINUE_FOCUS);
    expect(plan.secondary.map((s) => s.id)).toContain(FOCUS_STEP_IDS.READ_NEWS);
  });

  it("offers Amiga practice after graduation with a strong round", () => {
    const plan = buildPostFocusPracticePlan({
      streakUpdate: GOAL_MET,
      progressSummary: GRADUATED,
      currentTypeId: "T07",
      nextWeakTypeId: null,
      roundAccuracyPct: 85,
      questionCount: 10,
      dueMistakes: 0,
      dueVocabCount: 0,
      newsUnreadCount: 0,
      resumeTarget: null,
    });
    expect(plan.primary.id).toBe(FOCUS_STEP_IDS.AI_PRACTICE);
    expect(isAiPracticeStep(plan.primary)).toBe(true);
    expect(plan.primary.weakTypeIds).toEqual(["T07"]);
  });

  it("defaults to the learn hub when graduated with no next weak and no AI type", () => {
    const plan = buildPostFocusPracticePlan({
      streakUpdate: GOAL_MET,
      progressSummary: GRADUATED,
      currentTypeId: null,
      nextWeakTypeId: null,
      roundAccuracyPct: 50,
      questionCount: 10,
      dueMistakes: 0,
      dueVocabCount: 0,
      newsUnreadCount: 0,
      resumeTarget: null,
    });
    expect(plan.primary.id).toBe(FOCUS_STEP_IDS.LEARN_HUB);
    expect(plan.primary.route).toEqual({ name: "learn" });
  });
});