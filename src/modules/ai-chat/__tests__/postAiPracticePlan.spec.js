import { describe, expect, it } from "vitest";
import { AI_PRACTICE_STEP_IDS, buildPostAiPracticePlan } from "../postAiPracticePlan.js";

const GOAL_UNMET = {
  lessons_today: 0,
  effective_lessons_today: 1,
  target_lessons: 2,
  goal_met: false,
};

const RESUME_TARGET = {
  unit: { title_native: "Unit 1" },
  section: { id: "zh-es/U01-GRAMMAR", kind: "grammar", title_native: "语法" },
};

describe("buildPostAiPracticePlan", () => {
  it("routes to the current path section when daily goal is unmet", () => {
    const plan = buildPostAiPracticePlan({
      source: "vocab",
      dailyGoalSnapshot: GOAL_UNMET,
      resumeTarget: RESUME_TARGET,
      dueVocabCount: 5,
      dueMistakeCount: 2,
    });
    expect(plan.primary.id).toBe(AI_PRACTICE_STEP_IDS.NEXT_LESSON);
    expect(plan.primary.route).toEqual({
      name: "path-teaching",
      params: { nodeId: "zh-es/U01-GRAMMAR" },
    });
  });

  it("routes to path map when daily goal is unmet without resume target", () => {
    const plan = buildPostAiPracticePlan({
      source: "vocab",
      dailyGoalSnapshot: GOAL_UNMET,
      resumeTarget: null,
    });
    expect(plan.primary.id).toBe(AI_PRACTICE_STEP_IDS.DAILY_GOAL);
    expect(plan.primary.route).toEqual({ name: "path" });
  });

  it("prioritizes continue reading after daily goal is met for reading source", () => {
    const plan = buildPostAiPracticePlan({
      source: "reading",
      dailyGoalSnapshot: { goal_met: true, target_lessons: 2, lessons_today: 2 },
      continueReading: {
        articleId: 12,
        title: "Inflación",
        remainingPct: 35,
      },
      nextUnreadArticleId: 15,
      newsUnreadCount: 3,
    });
    expect(plan.primary.id).toBe(AI_PRACTICE_STEP_IDS.CONTINUE_READING);
    expect(plan.primary.route).toEqual({ name: "reader", params: { id: 12 } });
    expect(plan.secondary.map((step) => step.id)).toContain(AI_PRACTICE_STEP_IDS.NEXT_ARTICLE);
  });

  it("offers vocab review when backlog exists and goal is met", () => {
    const plan = buildPostAiPracticePlan({
      source: "vocab",
      dailyGoalSnapshot: { goal_met: true, target_lessons: 2, lessons_today: 2 },
      dueVocabCount: 4,
      dueMistakeCount: 0,
    });
    expect(plan.primary.id).toBe(AI_PRACTICE_STEP_IDS.VOCAB_REVIEW);
    expect(plan.primary.route).toEqual({ name: "vocab-review" });
  });

  it("prioritizes reviewing words learned in the chat session", () => {
    const plan = buildPostAiPracticePlan({
      source: "vocab",
      dailyGoalSnapshot: { goal_met: true, target_lessons: 2, lessons_today: 2 },
      dueVocabCount: 0,
      sessionLearnedWords: ["mercado", "frutas"],
    });
    expect(plan.primary.id).toBe(AI_PRACTICE_STEP_IDS.VOCAB_REVIEW);
    expect(plan.primary.titleKey).toBe("chat.practiceReviewLearnedWords");
    expect(plan.primary.titleParams).toEqual({ n: 2 });
  });

  it("offers mistake review when vocab backlog is empty", () => {
    const plan = buildPostAiPracticePlan({
      source: "mistake",
      dailyGoalSnapshot: { goal_met: true, target_lessons: 2, lessons_today: 2 },
      dueVocabCount: 0,
      dueMistakeCount: 3,
    });
    expect(plan.primary.id).toBe(AI_PRACTICE_STEP_IDS.MISTAKE_REVIEW);
    expect(plan.primary.route).toEqual({ name: "mistake-review" });
  });

  it("defaults to learn hub when no stronger action applies", () => {
    const plan = buildPostAiPracticePlan({
      source: "vocab",
      dailyGoalSnapshot: { goal_met: true, target_lessons: 2, lessons_today: 2 },
      dueVocabCount: 0,
      dueMistakeCount: 0,
    });
    expect(plan.primary.id).toBe(AI_PRACTICE_STEP_IDS.LEARN_HUB);
    expect(plan.primary.route).toEqual({ name: "learn" });
    expect(plan.secondary).toEqual([]);
  });
});