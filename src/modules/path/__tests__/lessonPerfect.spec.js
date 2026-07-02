import { describe, expect, it } from "vitest";
import { isPerfectLesson } from "@/modules/path/lessonPerfect.js";

describe("isPerfectLesson", () => {
  it("returns true when every question was correct on first try", () => {
    expect(
      isPerfectLesson({
        mistakeCount: 0,
        correctCount: 5,
        totalQuestions: 5,
        passed: true,
      }),
    ).toBe(true);
  });

  it("returns false when the learner missed any question", () => {
    expect(
      isPerfectLesson({
        mistakeCount: 1,
        correctCount: 4,
        totalQuestions: 5,
        passed: true,
      }),
    ).toBe(false);
  });

  it("returns false when the lesson was not passed", () => {
    expect(
      isPerfectLesson({
        mistakeCount: 0,
        correctCount: 5,
        totalQuestions: 5,
        passed: false,
      }),
    ).toBe(false);
  });

  it("returns false for empty question sets", () => {
    expect(
      isPerfectLesson({
        mistakeCount: 0,
        correctCount: 0,
        totalQuestions: 0,
        passed: true,
      }),
    ).toBe(false);
  });
});