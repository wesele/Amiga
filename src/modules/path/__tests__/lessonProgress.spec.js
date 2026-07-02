import { describe, expect, it } from "vitest";
import {
  lessonSessionProgress,
  lessonSessionProgressPct,
} from "../lessonProgress.js";

describe("lessonProgress", () => {
  it("tracks main-round progress from the first question", () => {
    expect(
      lessonSessionProgress({ index: 0, totalQuestions: 10 }),
    ).toEqual({ current: 1, total: 10 });
    expect(
      lessonSessionProgressPct({ index: 0, totalQuestions: 10 }),
    ).toBe(10);
    expect(
      lessonSessionProgressPct({ index: 2, totalQuestions: 10 }),
    ).toBe(30);
  });

  it("tracks reinforcement progress separately from the main round", () => {
    expect(
      lessonSessionProgress({
        inReinforcement: true,
        reinforcementIndex: 1,
        reinforcementTotal: 3,
      }),
    ).toEqual({ current: 2, total: 3 });
    expect(
      lessonSessionProgressPct({
        inReinforcement: true,
        reinforcementIndex: 1,
        reinforcementTotal: 3,
      }),
    ).toBe(67);
  });

  it("ticks progress forward when the current question has been answered", () => {
    expect(
      lessonSessionProgressPct({
        index: 0,
        totalQuestions: 10,
        answered: true,
      }),
    ).toBe(20);
    expect(
      lessonSessionProgressPct({
        inReinforcement: true,
        reinforcementIndex: 0,
        reinforcementTotal: 4,
        answered: true,
      }),
    ).toBe(50);
  });
});