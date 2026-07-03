import { beforeEach, describe, expect, it } from "vitest";
import {
  LESSON_IN_FLIGHT_STORAGE_KEY,
  LESSON_IN_FLIGHT_TTL_MS,
  buildLessonInFlightSnapshot,
  buildPairKey,
  clearLessonInFlight,
  formatInFlightProgress,
  peekLessonInFlight,
  practiceInFlightSummary,
  rebuildMistakesFromSnapshot,
  rebuildReinforcementQueue,
  saveLessonInFlight,
  shouldPersistLessonInFlight,
  validateLessonInFlight,
} from "../lessonInFlight.js";
import { LESSON_PHASE_MAIN, LESSON_PHASE_REINFORCEMENT } from "../lessonReinforcement.js";

const PAIR_KEY = buildPairKey("zh", "es", "A1");
const SECTION_ID = "zh-es/U01-PRACTICE";
const QUESTIONS = [
  { id: "q1", type: "T05" },
  { id: "q2", type: "T05" },
  { id: "q3", type: "T05" },
];

function baseSnapshot(overrides = {}) {
  return buildLessonInFlightSnapshot({
    pairKey: PAIR_KEY,
    sectionId: SECTION_ID,
    questions: QUESTIONS,
    index: 2,
    correctCount: 2,
    comboCount: 3,
    mistakes: [{ question: QUESTIONS[0] }],
    ...overrides,
  });
}

describe("lessonInFlight", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("builds pair keys with native, target, and CEFR", () => {
    expect(buildPairKey("zh", "es", "A1")).toBe("zh:es:A1");
  });

  it("saves and peeks scoped snapshots", () => {
    const snapshot = baseSnapshot();
    saveLessonInFlight(snapshot);
    expect(peekLessonInFlight(PAIR_KEY, SECTION_ID)).toMatchObject({
      index: 2,
      comboCount: 3,
      questionIds: ["q1", "q2", "q3"],
    });
    expect(peekLessonInFlight("other", SECTION_ID)).toBeNull();
  });

  it("clears a scoped snapshot without touching other sections", () => {
    saveLessonInFlight(baseSnapshot());
    saveLessonInFlight(
      baseSnapshot({ sectionId: "zh-es/U02-PRACTICE", index: 0 }),
    );
    clearLessonInFlight(PAIR_KEY, SECTION_ID);
    expect(peekLessonInFlight(PAIR_KEY, SECTION_ID)).toBeNull();
    expect(peekLessonInFlight(PAIR_KEY, "zh-es/U02-PRACTICE")).not.toBeNull();
  });

  it("validates TTL and question id lists", () => {
    const snapshot = baseSnapshot({
      savedAt: Date.now() - LESSON_IN_FLIGHT_TTL_MS - 1,
    });
    expect(validateLessonInFlight(snapshot, ["q1", "q2", "q3"])).toBe(false);

    const fresh = baseSnapshot();
    expect(validateLessonInFlight(fresh, ["q1", "q2", "q3"])).toBe(true);
    expect(validateLessonInFlight(fresh, ["q1", "q2", "q9"])).toBe(false);
  });

  it("rebuilds reinforcement queues and mistake rows", () => {
    const queue = rebuildReinforcementQueue(QUESTIONS, ["q2", "q1"]);
    expect(queue.map((q) => q.id)).toEqual(["q2", "q1"]);

    const mistakes = rebuildMistakesFromSnapshot(QUESTIONS, {
      mistakeQuestionIds: ["q1", "q2"],
      phase: LESSON_PHASE_REINFORCEMENT,
      reinforcementIndex: 1,
    });
    expect(mistakes).toHaveLength(2);
    expect(mistakes[0].reinforced).toBe(true);
    expect(mistakes[1].reinforced).toBe(false);
  });

  it("formats progress for main and reinforcement phases", () => {
    expect(
      formatInFlightProgress(
        { index: 7, phase: LESSON_PHASE_MAIN, comboCount: 2 },
        15,
      ),
    ).toEqual({
      current: 8,
      total: 15,
      comboCount: 2,
      phase: LESSON_PHASE_MAIN,
    });
    expect(
      formatInFlightProgress(
        {
          index: 14,
          phase: LESSON_PHASE_REINFORCEMENT,
          reinforcementIndex: 1,
          comboCount: 0,
        },
        15,
      ),
    ).toEqual({
      current: 15,
      total: 15,
      comboCount: 0,
      phase: LESSON_PHASE_REINFORCEMENT,
    });
  });

  it("exposes practice summaries only for fresh snapshots", () => {
    saveLessonInFlight(baseSnapshot({ index: 7 }));
    expect(practiceInFlightSummary(PAIR_KEY, SECTION_ID, 15)).toEqual({
      current: 8,
      total: 15,
      comboCount: 3,
      phase: LESSON_PHASE_MAIN,
    });
    localStorage.setItem(
      LESSON_IN_FLIGHT_STORAGE_KEY,
      JSON.stringify({
        entries: {
          [PAIR_KEY]: {
            [SECTION_ID]: baseSnapshot({
              savedAt: Date.now() - LESSON_IN_FLIGHT_TTL_MS - 5,
            }),
          },
        },
      }),
    );
    expect(practiceInFlightSummary(PAIR_KEY, SECTION_ID, 15)).toBeNull();
  });

  it("only persists when the learner has made progress", () => {
    expect(
      shouldPersistLessonInFlight({
        finished: false,
        index: 0,
        correctCount: 0,
        phase: LESSON_PHASE_MAIN,
      }),
    ).toBe(false);
    expect(
      shouldPersistLessonInFlight({
        finished: false,
        index: 1,
        correctCount: 1,
        phase: LESSON_PHASE_MAIN,
      }),
    ).toBe(true);
    expect(
      shouldPersistLessonInFlight({
        finished: true,
        index: 3,
        correctCount: 3,
        phase: LESSON_PHASE_MAIN,
      }),
    ).toBe(false);
  });
});