import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  MISTAKE_REVIEW_STORAGE_KEY,
  applyReviewResult,
  countDueMistakes,
  getDueMistakes,
  loadMistakeQueue,
  nextReviewAt,
  recordLessonMistake,
  saveMistakeQueue,
  upsertMistake,
} from "../mistakeReviewStore.js";

const PAIR = "zh-es";
const Q1 = { id: "q1", type: "T09", answer: "hola" };
const Q2 = { id: "q2", type: "T01", options: ["a", "b"], answerIdx: 0 };

describe("mistakeReviewStore", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useRealTimers();
  });

  it("schedules new mistakes for immediate review", () => {
    const now = Date.parse("2026-07-02T10:00:00Z");
    const queue = upsertMistake([], {
      question: Q1,
      userAnswer: "ola",
      pairKey: PAIR,
      now,
    });

    expect(queue).toHaveLength(1);
    expect(queue[0].level).toBe(0);
    expect(queue[0].next_review_at).toBe(nextReviewAt(0, now));
    expect(getDueMistakes(queue, PAIR, { now })).toHaveLength(1);
  });

  it("refreshes an existing mistake when the same question is missed again", () => {
    const first = Date.parse("2026-07-01T10:00:00Z");
    const later = Date.parse("2026-07-02T10:00:00Z");
    let queue = upsertMistake([], {
      question: Q1,
      userAnswer: "ola",
      pairKey: PAIR,
      now: first,
    });
    queue = applyReviewResult(queue, "q1", true, first);
    expect(queue[0].level).toBe(1);

    queue = upsertMistake(queue, {
      question: Q1,
      userAnswer: "holo",
      pairKey: PAIR,
      now: later,
    });

    expect(queue).toHaveLength(1);
    expect(queue[0].level).toBe(0);
    expect(queue[0].wrong_at).toBe(later);
    expect(getDueMistakes(queue, PAIR, { now: later })).toHaveLength(1);
  });

  it("defers mastered mistakes and removes them after the final level", () => {
    const now = Date.parse("2026-07-02T10:00:00Z");
    let queue = upsertMistake([], {
      question: Q1,
      userAnswer: "ola",
      pairKey: PAIR,
      now,
    });

    queue = applyReviewResult(queue, "q1", true, now);
    expect(queue[0].level).toBe(1);
    expect(getDueMistakes(queue, PAIR, { now })).toHaveLength(0);

    const dueLater = queue[0].next_review_at + 1;
    expect(getDueMistakes(queue, PAIR, { now: dueLater })).toHaveLength(1);

    queue = applyReviewResult(queue, "q1", true, dueLater);
    queue = applyReviewResult(queue, "q1", true, dueLater + 1);
    queue = applyReviewResult(queue, "q1", true, dueLater + 2);
    expect(queue).toHaveLength(0);
  });

  it("resets scheduling when a review attempt is wrong", () => {
    const now = Date.parse("2026-07-02T10:00:00Z");
    let queue = upsertMistake([], {
      question: Q1,
      userAnswer: "ola",
      pairKey: PAIR,
      now,
    });
    queue = applyReviewResult(queue, "q1", true, now);
    const wrongAgain = now + 1000;
    queue = applyReviewResult(queue, "q1", false, wrongAgain);

    expect(queue[0].level).toBe(0);
    expect(queue[0].next_review_at).toBe(nextReviewAt(0, wrongAgain));
  });

  it("persists mistakes per language pair in localStorage", () => {
    recordLessonMistake(PAIR, Q1, "ola", 1000);
    recordLessonMistake("zh-fr", Q2, 1, 2000);

    const stored = loadMistakeQueue();
    expect(stored).toHaveLength(2);
    expect(countDueMistakes(stored, PAIR, 1000)).toBe(1);
    expect(countDueMistakes(stored, "zh-fr", 2000)).toBe(1);
  });

  it("limits queue size per pair", () => {
    const now = 0;
    let queue = [];
    for (let i = 0; i < 35; i += 1) {
      queue = upsertMistake(queue, {
        question: { id: `q${i}`, type: "T09", answer: "x" },
        userAnswer: "y",
        pairKey: PAIR,
        now: now + i,
      });
    }
    expect(queue.filter((e) => e.pair_key === PAIR).length).toBe(30);
  });

  it("round-trips through save and load helpers", () => {
    const queue = upsertMistake([], {
      question: Q1,
      userAnswer: "ola",
      pairKey: PAIR,
      now: 1,
    });
    saveMistakeQueue(queue);
    expect(localStorage.getItem(MISTAKE_REVIEW_STORAGE_KEY)).toContain("q1");
    expect(loadMistakeQueue()).toHaveLength(1);
  });
});