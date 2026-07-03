import { describe, expect, it } from "vitest";
import {
  TEACHING_STEP_IDS,
  buildPostTeachingPlan,
  primaryTeachingStepRoute,
} from "../postTeachingPlan.js";

const COMPLETE = {
  passed: true,
  level_upgraded: false,
  streak_current: 3,
  streak_extended: false,
  daily_goal_just_met: false,
  daily_goal_lessons_today: 1,
  daily_goal_target: 3,
};

describe("buildPostTeachingPlan", () => {
  it("prioritizes next node when the teaching chain is intact", () => {
    const plan = buildPostTeachingPlan({
      result: {
        ...COMPLETE,
        next_section_id: "zh-es/U01-VOCAB",
      },
      dueMistakesAtStart: 4,
      dueVocabAtStart: 5,
      unitTitle: "基础问候",
    });
    expect(plan.primary.id).toBe(TEACHING_STEP_IDS.NEXT_NODE);
    expect(plan.primary.route.name).toBe("path-teaching");
    expect(plan.primary.continueKey).toBe("path.teachingContinue.toVocab");
    expect(plan.secondary.map((s) => s.id)).toEqual([
      TEACHING_STEP_IDS.DAILY_GOAL,
      TEACHING_STEP_IDS.MISTAKE_REVIEW,
      TEACHING_STEP_IDS.VOCAB_REVIEW,
    ]);
  });

  it("routes vocab completion to practice as the next node", () => {
    const plan = buildPostTeachingPlan({
      result: {
        ...COMPLETE,
        next_section_id: "zh-es/U01-PRACTICE",
      },
    });
    expect(plan.primary.id).toBe(TEACHING_STEP_IDS.NEXT_NODE);
    expect(plan.primary.route.name).toBe("path-lesson");
    expect(plan.primary.continueKey).toBe("path.teachingContinue.toPractice");
  });

  it("falls back to daily goal when the chain breaks on level upgrade", () => {
    const plan = buildPostTeachingPlan({
      result: {
        ...COMPLETE,
        level_upgraded: true,
        new_cefr_level: "A2",
        next_section_id: "zh-es/U02-GRAMMAR",
      },
    });
    expect(plan.primary.id).toBe(TEACHING_STEP_IDS.DAILY_GOAL);
    expect(plan.secondary.length).toBeGreaterThan(0);
  });

  it("falls back to mistake review when no next node and daily goal is met", () => {
    const plan = buildPostTeachingPlan({
      result: {
        ...COMPLETE,
        daily_goal_just_met: true,
        daily_goal_lessons_today: 3,
        daily_goal_target: 3,
        next_section_id: "",
        level_upgraded: true,
      },
      dueMistakesAtStart: 2,
      dueVocabAtStart: 4,
    });
    expect(plan.primary.id).toBe(TEACHING_STEP_IDS.MISTAKE_REVIEW);
    expect(plan.secondary.map((s) => s.id)).toEqual([
      TEACHING_STEP_IDS.VOCAB_REVIEW,
      TEACHING_STEP_IDS.LEARN_HUB,
    ]);
  });

  it("includes AI practice in secondary when session unknown words reach threshold", () => {
    const plan = buildPostTeachingPlan({
      result: {
        ...COMPLETE,
        next_section_id: "zh-es/U01-PRACTICE",
      },
      sessionUnknownWords: ["hola", "adiós", "gracias"],
    });
    expect(plan.primary.id).toBe(TEACHING_STEP_IDS.NEXT_NODE);
    expect(plan.secondary.map((s) => s.id)).toContain(TEACHING_STEP_IDS.AI_PRACTICE);
  });

  it("skips AI practice and vocab review nudges after in-flow micro review", () => {
    const plan = buildPostTeachingPlan({
      result: {
        ...COMPLETE,
        next_section_id: "zh-es/U01-PRACTICE",
      },
      sessionUnknownWords: ["hola", "adiós", "gracias"],
      microReviewCompleted: true,
      dueVocabAtStart: 4,
    });
    expect(plan.primary.id).toBe(TEACHING_STEP_IDS.NEXT_NODE);
    expect(plan.secondary.map((s) => s.id)).not.toContain(TEACHING_STEP_IDS.AI_PRACTICE);
    expect(plan.secondary.map((s) => s.id)).not.toContain(TEACHING_STEP_IDS.VOCAB_REVIEW);
  });

  it("adds celebration query when returning to the path map after teaching", () => {
    const plan = buildPostTeachingPlan({
      result: {
        ...COMPLETE,
        daily_goal_just_met: true,
        daily_goal_lessons_today: 3,
        daily_goal_target: 3,
        next_section_id: "",
        level_upgraded: true,
      },
      completedSectionId: "zh-es/U01-GRAMMAR",
    });
    expect(plan.primary.id).toBe(TEACHING_STEP_IDS.PATH);
    expect(plan.primary.route.query.celebrate).toBe("zh-es/U01-GRAMMAR");
    expect(plan.primary.route.query.kind).toBe("grammar");
  });

  it("includes read news when streak is at risk and unread articles exist", () => {
    const plan = buildPostTeachingPlan({
      result: {
        ...COMPLETE,
        next_section_id: "zh-es/U01-VOCAB",
        streak_current: 5,
        streak_extended: false,
        daily_goal_just_met: false,
      },
      newsUnreadCount: 3,
      localHour: 20,
    });
    expect(plan.secondary.map((s) => s.id)).toContain(TEACHING_STEP_IDS.READ_NEWS);
  });

  it("replaces read news with matched article when vocab lesson has overlap", () => {
    const plan = buildPostTeachingPlan({
      result: {
        ...COMPLETE,
        next_section_id: "zh-es/U01-PRACTICE",
        streak_current: 5,
        streak_extended: false,
        daily_goal_just_met: false,
      },
      isVocabLesson: true,
      lessonWords: ["hola", "gracias", "banco"],
      articles: [
        {
          id: 9,
          original_title: "Saludos",
          original_body: "Hola y gracias por visitar el banco.",
          completed: false,
          read_today: false,
        },
      ],
      newsUnreadCount: 2,
      localHour: 20,
    });
    expect(plan.secondary.map((s) => s.id)).toContain(
      TEACHING_STEP_IDS.READ_MATCHED_ARTICLE,
    );
    expect(plan.secondary.map((s) => s.id)).not.toContain(TEACHING_STEP_IDS.READ_NEWS);
    const matched = plan.secondary.find(
      (step) => step.id === TEACHING_STEP_IDS.READ_MATCHED_ARTICLE,
    );
    expect(matched.route.query.lessonWords).toContain("hola");
  });

  it("falls back without matched article step when overlap is missing", () => {
    const plan = buildPostTeachingPlan({
      result: {
        ...COMPLETE,
        next_section_id: "zh-es/U01-PRACTICE",
        streak_current: 5,
        streak_extended: false,
      },
      isVocabLesson: true,
      lessonWords: ["hola", "gracias"],
      articles: [{ id: 1, original_body: "La inflación sube." }],
      newsUnreadCount: 2,
      localHour: 20,
    });
    expect(plan.secondary.map((s) => s.id)).not.toContain(
      TEACHING_STEP_IDS.READ_MATCHED_ARTICLE,
    );
    expect(plan.secondary.map((s) => s.id)).toContain(TEACHING_STEP_IDS.READ_NEWS);
  });

  it("returns null when result is missing", () => {
    expect(buildPostTeachingPlan({ result: null })).toBeNull();
  });
});

describe("primaryTeachingStepRoute", () => {
  it("falls back to path when plan is missing", () => {
    expect(primaryTeachingStepRoute(null)).toEqual({
      name: "path",
      query: { focus: "current" },
    });
  });
});