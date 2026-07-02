import { describe, expect, it } from "vitest";
import { FOCUS_IDS, pickLearningHubFocus } from "../learningHubFocus.js";

const resumeTarget = {
  section: {
    id: "zh-es/U01-PRACTICE",
    kind: "practice",
    title_native: "闯关练习",
  },
};

describe("learningHubFocus", () => {
  it("prioritizes streak at risk in the evening", () => {
    const focus = pickLearningHubFocus({
      dailyGoal: {
        streak_current: 12,
        practiced_today: false,
        goal_met: false,
        lessons_today: 0,
        target_lessons: 2,
      },
      resumeTarget,
      dueMistakes: 3,
      localHour: 21,
    });
    expect(focus.id).toBe(FOCUS_IDS.STREAK_AT_RISK);
    expect(focus.route.name).toBe("path-lesson");
  });

  it("routes streak-at-risk to mistake review when the daily goal is met", () => {
    const focus = pickLearningHubFocus({
      dailyGoal: {
        streak_current: 8,
        practiced_today: false,
        goal_met: true,
      },
      dueMistakes: 2,
      localHour: 20,
    });
    expect(focus.id).toBe(FOCUS_IDS.STREAK_AT_RISK);
    expect(focus.actionId).toBe(FOCUS_IDS.MISTAKE_REVIEW);
    expect(focus.route.name).toBe("path-mistake-review");
  });

  it("prefers continuing the current section when the daily goal is unfinished", () => {
    const focus = pickLearningHubFocus({
      dailyGoal: {
        goal_met: false,
        practiced_today: true,
        streak_current: 3,
      },
      resumeTarget,
      dueMistakes: 2,
      localHour: 10,
    });
    expect(focus.id).toBe(FOCUS_IDS.CONTINUE_SECTION);
    expect(focus.route.name).toBe("path-lesson");
  });

  it("surfaces due mistakes when no resume target is available", () => {
    const focus = pickLearningHubFocus({
      dailyGoal: { goal_met: true, practiced_today: true },
      dueMistakes: 4,
      localHour: 10,
    });
    expect(focus.id).toBe(FOCUS_IDS.MISTAKE_REVIEW);
    expect(focus.route.name).toBe("path-mistake-review");
  });

  it("surfaces vocab review when mistakes are cleared", () => {
    const focus = pickLearningHubFocus({
      dailyGoal: { goal_met: true, practiced_today: true },
      dueVocabWords: [{ word: "hola" }],
      localHour: 10,
    });
    expect(focus.id).toBe(FOCUS_IDS.VOCAB_REVIEW);
    expect(focus.route.name).toBe("vocab-review");
  });

  it("treats review credit as daily goal progress for remaining lessons", () => {
    const focus = pickLearningHubFocus({
      dailyGoal: {
        goal_met: false,
        lessons_today: 0,
        review_sessions_today: 1,
        effective_lessons_today: 1,
        target_lessons: 2,
      },
      localHour: 10,
    });
    expect(focus.id).toBe(FOCUS_IDS.DAILY_GOAL);
    expect(focus.remaining).toBe(1);
  });

  it("falls back to explore path when everything is complete", () => {
    const focus = pickLearningHubFocus({
      dailyGoal: { goal_met: true, practiced_today: true },
      localHour: 10,
    });
    expect(focus.id).toBe(FOCUS_IDS.EXPLORE_PATH);
    expect(focus.route.name).toBe("path");
  });
});