import { describe, expect, it } from "vitest";
import {
  FOCUS_PRACTICE_SESSION_LIMIT,
  isSessionComplete,
  sessionAccuracy,
  sessionProgress,
  sessionProgressPct,
} from "../focusPracticeSession.js";

describe("focusPracticeSession", () => {
  it("defines a five-question session limit", () => {
    expect(FOCUS_PRACTICE_SESSION_LIMIT).toBe(5);
  });

  it("tracks progress through the session", () => {
    expect(sessionProgress(0, 5)).toEqual({ current: 1, total: 5 });
    expect(sessionProgressPct(2, 5)).toBe(60);
    expect(isSessionComplete(5, 5)).toBe(true);
    expect(isSessionComplete(4, 5)).toBe(false);
  });

  it("advances the bar when the current question has been checked", () => {
    expect(sessionProgressPct(0, 10)).toBe(10);
    expect(sessionProgressPct(0, 10, { answered: true })).toBe(20);
    expect(sessionProgressPct(2, 10, { answered: true })).toBe(40);
    expect(sessionProgressPct(9, 10, { answered: true })).toBe(100);
  });

  it("keeps the bar steady when advancing to the next unanswered question", () => {
    expect(sessionProgressPct(0, 10, { answered: true })).toBe(20);
    expect(sessionProgressPct(1, 10)).toBe(20);
  });

  it("computes session accuracy percentage", () => {
    expect(sessionAccuracy(3, 5)).toBe(60);
    expect(sessionAccuracy(0, 0)).toBe(0);
  });
});