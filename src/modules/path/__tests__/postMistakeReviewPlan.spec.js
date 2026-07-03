import { describe, expect, it } from "vitest";
import {
  MISTAKE_STEP_IDS,
  buildPostMistakeReviewPlan,
  isAiPracticeStep,
  isContinueReviewStep,
} from "../postMistakeReviewPlan.js";

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

const RESUME_TARGET = {
  unit: { title_native: "Unit 1" },
  section: { id: "zh-es/U01-GRAMMAR", kind: "grammar", title_native: "语法" },
};

const FOCUS_AREA = { typeId: "T07", accuracyPct: 55 };

describe("buildPostMistakeReviewPlan", () => {
  it("prioritizes continue review when backlog is larger than the session", () => {
    const plan = buildPostMistakeReviewPlan({
      reviewResult: GOAL_UNMET,
      remainingDue: 8,
      sessionTotal: 5,
      masteredCount: 2,
      dueVocabCount: 3,
      focusArea: FOCUS_AREA,
      newsUnreadCount: 2,
      resumeTarget: RESUME_TARGET,
      weakTypeIds: ["T09"],
    });
    expect(plan.primary.id).toBe(MISTAKE_STEP_IDS.CONTINUE_REVIEW);
    expect(isContinueReviewStep(plan.primary)).toBe(true);
    expect(plan.secondary.map((s) => s.id)).toContain(MISTAKE_STEP_IDS.NEXT_LESSON);
    expect(plan.secondary.map((s) => s.id)).not.toContain(MISTAKE_STEP_IDS.CONTINUE_REVIEW);
    expect(plan.secondary.length).toBeLessThanOrEqual(3);
  });

  it("routes to the current path section when daily goal is unmet", () => {
    const plan = buildPostMistakeReviewPlan({
      reviewResult: GOAL_UNMET,
      remainingDue: 0,
      sessionTotal: 5,
      masteredCount: 1,
      dueVocabCount: 0,
      focusArea: null,
      newsUnreadCount: 0,
      resumeTarget: RESUME_TARGET,
    });
    expect(plan.primary.id).toBe(MISTAKE_STEP_IDS.NEXT_LESSON);
    expect(plan.primary.route).toEqual({
      name: "path-teaching",
      params: { nodeId: "zh-es/U01-GRAMMAR" },
    });
  });

  it("routes to path map when daily goal is unmet and there is no resume target", () => {
    const plan = buildPostMistakeReviewPlan({
      reviewResult: GOAL_UNMET,
      remainingDue: 0,
      sessionTotal: 5,
      masteredCount: 1,
      dueVocabCount: 0,
      focusArea: null,
      newsUnreadCount: 0,
      resumeTarget: null,
    });
    expect(plan.primary.id).toBe(MISTAKE_STEP_IDS.DAILY_GOAL);
    expect(plan.primary.route).toEqual({ name: "path" });
  });

  it("prioritizes vocab review when mistakes are cleared and words are due", () => {
    const plan = buildPostMistakeReviewPlan({
      reviewResult: GOAL_MET,
      remainingDue: 0,
      sessionTotal: 5,
      masteredCount: 2,
      dueVocabCount: 5,
      focusArea: FOCUS_AREA,
      newsUnreadCount: 3,
      resumeTarget: null,
    });
    expect(plan.primary.id).toBe(MISTAKE_STEP_IDS.VOCAB_REVIEW);
    expect(plan.primary.route).toEqual({ name: "vocab-review" });
    expect(plan.secondary.map((s) => s.id)).toContain(MISTAKE_STEP_IDS.FOCUS_AREA);
  });

  it("offers news reading when daily goal is met and unread articles remain", () => {
    const plan = buildPostMistakeReviewPlan({
      reviewResult: GOAL_MET,
      remainingDue: 1,
      sessionTotal: 5,
      masteredCount: 1,
      dueVocabCount: 0,
      focusArea: null,
      newsUnreadCount: 4,
      resumeTarget: null,
    });
    expect(plan.primary.id).toBe(MISTAKE_STEP_IDS.READ_NEWS);
    expect(plan.primary.route).toEqual({ name: "news" });
    expect(plan.secondary.map((s) => s.id)).toContain(MISTAKE_STEP_IDS.CONTINUE_REVIEW);
  });

  it("offers Amiga practice after a strong mistake review session", () => {
    const plan = buildPostMistakeReviewPlan({
      reviewResult: GOAL_MET,
      remainingDue: 0,
      sessionTotal: 5,
      masteredCount: 3,
      dueVocabCount: 0,
      focusArea: null,
      newsUnreadCount: 0,
      resumeTarget: null,
      weakTypeIds: ["T09", "T07"],
    });
    expect(plan.primary.id).toBe(MISTAKE_STEP_IDS.AI_PRACTICE);
    expect(isAiPracticeStep(plan.primary)).toBe(true);
    expect(plan.primary.weakTypeIds).toEqual(["T09", "T07"]);
  });

  it("defaults to the learn hub when no stronger action applies", () => {
    const plan = buildPostMistakeReviewPlan({
      reviewResult: GOAL_MET,
      remainingDue: 0,
      sessionTotal: 5,
      masteredCount: 1,
      dueVocabCount: 0,
      focusArea: null,
      newsUnreadCount: 0,
      resumeTarget: null,
      weakTypeIds: [],
    });
    expect(plan.primary.id).toBe(MISTAKE_STEP_IDS.LEARN_HUB);
    expect(plan.primary.route).toEqual({ name: "learn" });
    expect(plan.secondary).toEqual([]);
  });
});