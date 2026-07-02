import { describe, expect, it } from "vitest";
import {
  freshMistakeCount,
  freshMistakeCountFromSession,
  shouldFreshMistakeTakePrimary,
  shouldShowFreshMistakeAction,
  shouldShowFreshMistakeNudge,
  shouldShowFreshMistakeOnFailure,
} from "../freshMistakeNudge.js";

const PAIR = "zh-es";
const NOW = 1_000_000;

function queueEntry(questionId, { due = true, pairKey = PAIR } = {}) {
  return {
    question_id: questionId,
    pair_key: pairKey,
    question: { id: questionId, type: "T09", hint: "hola" },
    level: 0,
    next_review_at: due ? NOW - 1 : NOW + 999_999,
  };
}

describe("freshMistakeNudge", () => {
  it("counts session mistakes that are due now", () => {
    const ids = new Set(["q1", "q2"]);
    const queue = [queueEntry("q1"), queueEntry("q2"), queueEntry("q3")];
    expect(freshMistakeCountFromSession(ids, queue, PAIR, NOW)).toBe(2);
  });

  it("ignores session mistakes that are not yet due", () => {
    const ids = new Set(["q1"]);
    const queue = [queueEntry("q1", { due: false })];
    expect(freshMistakeCountFromSession(ids, queue, PAIR, NOW)).toBe(0);
  });

  it("derives fresh count from dueNow minus dueAtStart", () => {
    expect(freshMistakeCount(3, 0)).toBe(3);
    expect(freshMistakeCount(5, 2)).toBe(3);
    expect(freshMistakeCount(1, 1)).toBe(0);
  });

  it("shows nudge when lesson passed and fresh mistakes exist", () => {
    expect(
      shouldShowFreshMistakeNudge({ passed: true }, { freshCount: 2 }),
    ).toBe(true);
    expect(
      shouldShowFreshMistakeNudge({ passed: true }, { freshCount: 0 }),
    ).toBe(false);
    expect(
      shouldShowFreshMistakeNudge({ passed: false }, { freshCount: 2 }),
    ).toBe(false);
  });

  it("mirrors action visibility to the nudge", () => {
    expect(
      shouldShowFreshMistakeAction({ passed: true }, { freshCount: 1 }),
    ).toBe(true);
    expect(
      shouldShowFreshMistakeAction({ passed: false }, { freshCount: 1 }),
    ).toBe(false);
  });

  it("takes primary only when daily goal nudge is inactive", () => {
    expect(
      shouldFreshMistakeTakePrimary(
        { passed: true },
        { freshCount: 2, dailyGoalNudgeActive: false },
      ),
    ).toBe(true);
    expect(
      shouldFreshMistakeTakePrimary(
        { passed: true },
        { freshCount: 2, dailyGoalNudgeActive: true },
      ),
    ).toBe(false);
  });

  it("still counts mistakes after reinforcement even when all reinforcement answers are correct", () => {
    const ids = new Set(["q1", "q2"]);
    const queue = [queueEntry("q1"), queueEntry("q2")];
    expect(freshMistakeCountFromSession(ids, queue, PAIR, NOW)).toBe(2);
    expect(shouldShowFreshMistakeNudge({ passed: true }, { freshCount: 2 })).toBe(true);
  });

  it("shows fresh mistake action on failure when mistakes were recorded to SRS", () => {
    expect(
      shouldShowFreshMistakeOnFailure({ mistakeCount: 4, freshCount: 3 }),
    ).toBe(true);
    expect(
      shouldShowFreshMistakeOnFailure({ mistakeCount: 4, freshCount: 0 }),
    ).toBe(false);
    expect(
      shouldShowFreshMistakeOnFailure({ mistakeCount: 0, freshCount: 2 }),
    ).toBe(false);
  });

  it("keeps pass-path nudge gated on passed result", () => {
    expect(
      shouldShowFreshMistakeNudge({ passed: false }, { freshCount: 2 }),
    ).toBe(false);
  });
});