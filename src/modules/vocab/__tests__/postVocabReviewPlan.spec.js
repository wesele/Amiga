import { describe, expect, it } from "vitest";
import {
  VOCAB_STEP_IDS,
  buildPostVocabReviewPlan,
  isAiPracticeStep,
  isContinueReviewStep,
} from "../postVocabReviewPlan.js";

const GOAL_UNMET = {
  daily_goal: {
    lessons_today: 0,
    effective_lessons_today: 1,
    target_lessons: 2,
    goal_met: false,
  },
};

const RESUME_TARGET = {
  unit: { title_native: "Unit 1" },
  section: { id: "zh-es/U01-GRAMMAR", kind: "grammar", title_native: "语法" },
};

describe("buildPostVocabReviewPlan", () => {
  it("prioritizes continue review when backlog is larger than the reading session", () => {
    const plan = buildPostVocabReviewPlan({
      reviewResult: GOAL_UNMET,
      remainingDue: 12,
      fromReading: true,
      sessionWordCount: 4,
      masteredCount: 4,
      reviewedWords: ["a", "b", "c", "d"],
      newsUnreadCount: 3,
      resumeTarget: RESUME_TARGET,
    });
    expect(plan.primary.id).toBe(VOCAB_STEP_IDS.CONTINUE_REVIEW);
    expect(isContinueReviewStep(plan.primary)).toBe(true);
    expect(plan.secondary.map((s) => s.id)).toContain(VOCAB_STEP_IDS.BACK_TO_NEWS);
    expect(plan.secondary.map((s) => s.id)).not.toContain(VOCAB_STEP_IDS.CONTINUE_REVIEW);
  });

  it("prioritizes news when reading session is done and unread articles remain", () => {
    const plan = buildPostVocabReviewPlan({
      reviewResult: GOAL_UNMET,
      remainingDue: 2,
      fromReading: true,
      sessionWordCount: 4,
      masteredCount: 4,
      reviewedWords: ["a", "b", "c", "d"],
      newsUnreadCount: 2,
      resumeTarget: RESUME_TARGET,
    });
    expect(plan.primary.id).toBe(VOCAB_STEP_IDS.BACK_TO_NEWS);
    expect(plan.primary.route).toEqual({ name: "news" });
    expect(plan.secondary.map((s) => s.id)).toEqual([
      VOCAB_STEP_IDS.CONTINUE_REVIEW,
      VOCAB_STEP_IDS.NEXT_LESSON,
      VOCAB_STEP_IDS.AI_PRACTICE,
      VOCAB_STEP_IDS.LEARN_HUB,
    ]);
  });

  it("routes to the current path section when daily goal is unmet", () => {
    const plan = buildPostVocabReviewPlan({
      reviewResult: GOAL_UNMET,
      remainingDue: 0,
      fromReading: false,
      sessionWordCount: 0,
      masteredCount: 2,
      reviewedWords: ["hola"],
      newsUnreadCount: 0,
      resumeTarget: RESUME_TARGET,
    });
    expect(plan.primary.id).toBe(VOCAB_STEP_IDS.NEXT_LESSON);
    expect(plan.primary.route).toEqual({
      name: "path-teaching",
      params: { nodeId: "zh-es/U01-GRAMMAR" },
    });
  });

  it("routes to path map when daily goal is unmet and there is no resume target", () => {
    const plan = buildPostVocabReviewPlan({
      reviewResult: GOAL_UNMET,
      remainingDue: 0,
      fromReading: false,
      sessionWordCount: 0,
      masteredCount: 1,
      reviewedWords: ["hola"],
      newsUnreadCount: 0,
      resumeTarget: null,
    });
    expect(plan.primary.id).toBe(VOCAB_STEP_IDS.DAILY_GOAL);
    expect(plan.primary.route).toEqual({ name: "path" });
  });

  it("offers Amiga practice after a strong reading review session", () => {
    const plan = buildPostVocabReviewPlan({
      reviewResult: { daily_goal: { goal_met: true, target_lessons: 2, lessons_today: 2 } },
      remainingDue: 0,
      fromReading: true,
      sessionWordCount: 5,
      masteredCount: 5,
      reviewedWords: ["alpha", "beta", "gamma", "delta", "epsilon"],
      newsUnreadCount: 0,
      resumeTarget: null,
    });
    expect(plan.primary.id).toBe(VOCAB_STEP_IDS.AI_PRACTICE);
    expect(isAiPracticeStep(plan.primary)).toBe(true);
    expect(plan.primary.reviewedWords).toEqual([
      "alpha",
      "beta",
      "gamma",
      "delta",
      "epsilon",
    ]);
  });

  it("defaults to the learn hub when no stronger action applies", () => {
    const plan = buildPostVocabReviewPlan({
      reviewResult: { daily_goal: { goal_met: true, target_lessons: 2, lessons_today: 2 } },
      remainingDue: 0,
      fromReading: false,
      sessionWordCount: 0,
      masteredCount: 1,
      reviewedWords: ["hola"],
      newsUnreadCount: 0,
      resumeTarget: null,
    });
    expect(plan.primary.id).toBe(VOCAB_STEP_IDS.LEARN_HUB);
    expect(plan.primary.route).toEqual({ name: "learn" });
    expect(plan.secondary).toEqual([]);
  });
});