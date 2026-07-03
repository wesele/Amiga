import { describe, expect, it } from "vitest";
import {
  READING_STEP_IDS,
  buildPostReadingPlan,
  isAiPracticeStep,
  isVocabReviewStep,
} from "../postReadingPlan.js";

const GOAL_UNMET = {
  goal_met: false,
  target_lessons: 2,
  lessons_today: 0,
  effective_lessons_today: 1,
};

const RESUME_TARGET = {
  unit: { title_native: "Unit 1" },
  section: { id: "zh-es/U01-GRAMMAR", kind: "grammar", title_native: "语法" },
};

describe("buildPostReadingPlan", () => {
  it("prioritizes vocab review when unknown words were marked", () => {
    const plan = buildPostReadingPlan({
      unknownCount: 3,
      dailyGoalSnapshot: GOAL_UNMET,
      resumeTarget: RESUME_TARGET,
      nextUnreadArticleId: 42,
      newsUnreadCount: 2,
      sessionWordCount: 3,
      sessionWords: ["a", "b", "c"],
    });
    expect(plan.primary.id).toBe(READING_STEP_IDS.VOCAB_REVIEW);
    expect(isVocabReviewStep(plan.primary)).toBe(true);
    expect(plan.secondary.map((s) => s.id)).toEqual([
      READING_STEP_IDS.NEXT_LESSON,
      READING_STEP_IDS.NEXT_ARTICLE,
      READING_STEP_IDS.AI_PRACTICE,
    ]);
  });

  it("routes to the current path section when daily goal is unmet and there are no unknown words", () => {
    const plan = buildPostReadingPlan({
      unknownCount: 0,
      dailyGoalSnapshot: GOAL_UNMET,
      resumeTarget: RESUME_TARGET,
      nextUnreadArticleId: 42,
      newsUnreadCount: 2,
      sessionWordCount: 1,
      sessionWords: ["hola"],
    });
    expect(plan.primary.id).toBe(READING_STEP_IDS.NEXT_LESSON);
    expect(plan.primary.route).toEqual({
      name: "path-teaching",
      params: { nodeId: "zh-es/U01-GRAMMAR" },
    });
    expect(plan.secondary.map((s) => s.id)).toEqual([
      READING_STEP_IDS.NEXT_ARTICLE,
      READING_STEP_IDS.NEWS_LIST,
    ]);
  });

  it("routes to path map when daily goal is unmet and there is no resume target", () => {
    const plan = buildPostReadingPlan({
      unknownCount: 0,
      dailyGoalSnapshot: GOAL_UNMET,
      resumeTarget: null,
      nextUnreadArticleId: null,
      newsUnreadCount: 0,
      sessionWordCount: 0,
      sessionWords: [],
    });
    expect(plan.primary.id).toBe(READING_STEP_IDS.DAILY_GOAL);
    expect(plan.primary.route).toEqual({ name: "path" });
  });

  it("offers the next unread article when the daily goal is met", () => {
    const plan = buildPostReadingPlan({
      unknownCount: 0,
      dailyGoalSnapshot: { goal_met: true, target_lessons: 2, lessons_today: 2 },
      resumeTarget: null,
      nextUnreadArticleId: 99,
      newsUnreadCount: 3,
      sessionWordCount: 1,
      sessionWords: ["hola"],
    });
    expect(plan.primary.id).toBe(READING_STEP_IDS.NEXT_ARTICLE);
    expect(plan.primary.route).toEqual({ name: "reader", params: { id: 99 } });
  });

  it("offers Amiga practice after a word-rich reading session", () => {
    const plan = buildPostReadingPlan({
      unknownCount: 0,
      dailyGoalSnapshot: { goal_met: true, target_lessons: 2, lessons_today: 2 },
      resumeTarget: null,
      nextUnreadArticleId: null,
      newsUnreadCount: 0,
      sessionWordCount: 4,
      sessionWords: ["alpha", "beta", "gamma", "delta"],
    });
    expect(plan.primary.id).toBe(READING_STEP_IDS.AI_PRACTICE);
    expect(isAiPracticeStep(plan.primary)).toBe(true);
    expect(plan.primary.sessionWords).toEqual(["alpha", "beta", "gamma", "delta"]);
  });

  it("defaults to the learn hub when no stronger action applies", () => {
    const plan = buildPostReadingPlan({
      unknownCount: 0,
      dailyGoalSnapshot: { goal_met: true, target_lessons: 2, lessons_today: 2 },
      resumeTarget: null,
      nextUnreadArticleId: null,
      newsUnreadCount: 0,
      sessionWordCount: 1,
      sessionWords: ["hola"],
    });
    expect(plan.primary.id).toBe(READING_STEP_IDS.LEARN_HUB);
    expect(plan.primary.route).toEqual({ name: "learn" });
    expect(plan.secondary).toEqual([
      expect.objectContaining({ id: READING_STEP_IDS.NEWS_LIST }),
    ]);
  });

  it("downgrades vocab review primary when micro-review already completed", () => {
    const plan = buildPostReadingPlan({
      unknownCount: 3,
      microReviewCompleted: true,
      dailyGoalSnapshot: { goal_met: true, target_lessons: 2, lessons_today: 2 },
      resumeTarget: null,
      nextUnreadArticleId: null,
      newsUnreadCount: 0,
      sessionWordCount: 4,
      sessionWords: ["a", "b", "c", "d"],
    });
    expect(plan.primary.id).toBe(READING_STEP_IDS.AI_PRACTICE);
    expect(isVocabReviewStep(plan.primary)).toBe(false);
  });

  it("prioritizes vocab review in checkpoint mode and adds continue-article to the queue", () => {
    const plan = buildPostReadingPlan({
      mode: "checkpoint",
      scrollPct: 42,
      unknownCount: 3,
      dailyGoalSnapshot: GOAL_UNMET,
      resumeTarget: RESUME_TARGET,
      nextUnreadArticleId: 42,
      newsUnreadCount: 2,
      sessionWordCount: 3,
      sessionWords: ["a", "b", "c"],
    });
    expect(plan.primary.id).toBe(READING_STEP_IDS.VOCAB_REVIEW);
    expect(plan.secondary[0].id).toBe(READING_STEP_IDS.CONTINUE_ARTICLE);
    expect(plan.secondary[0].subtitleParams).toEqual({ remainingPct: 58 });
  });

  it("defaults checkpoint primary to continue reading when there are no unknown words", () => {
    const plan = buildPostReadingPlan({
      mode: "checkpoint",
      scrollPct: 40,
      unknownCount: 0,
      dailyGoalSnapshot: GOAL_UNMET,
      resumeTarget: RESUME_TARGET,
      nextUnreadArticleId: null,
      newsUnreadCount: 0,
      sessionWordCount: 0,
      sessionWords: [],
    });
    expect(plan.primary.id).toBe(READING_STEP_IDS.CONTINUE_ARTICLE);
    expect(plan.primary.continueKey).toBe("news.checkpointContinueAction");
    expect(plan.secondary.map((s) => s.id)).not.toContain(READING_STEP_IDS.CONTINUE_ARTICLE);
  });

  it("caps the secondary queue at three items", () => {
    const plan = buildPostReadingPlan({
      unknownCount: 2,
      dailyGoalSnapshot: GOAL_UNMET,
      resumeTarget: RESUME_TARGET,
      nextUnreadArticleId: 7,
      newsUnreadCount: 4,
      sessionWordCount: 5,
      sessionWords: ["a", "b", "c", "d", "e"],
    });
    expect(plan.secondary).toHaveLength(3);
  });
});