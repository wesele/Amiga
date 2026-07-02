import { describe, expect, it } from "vitest";
import {
  LESSON_PHASE_MAIN,
  LESSON_PHASE_REINFORCEMENT,
  buildReinforcementQueue,
  isLastReinforcementQuestion,
  reinforcementLabel,
  shouldStartReinforcement,
} from "@/modules/path/lessonReinforcement.js";

describe("lessonReinforcement", () => {
  it("starts reinforcement only when there are mistakes in the main phase", () => {
    expect(shouldStartReinforcement([], LESSON_PHASE_MAIN)).toBe(false);
    expect(
      shouldStartReinforcement([{ question: { id: "q1" } }], LESSON_PHASE_MAIN),
    ).toBe(true);
    expect(
      shouldStartReinforcement(
        [{ question: { id: "q1" } }],
        LESSON_PHASE_REINFORCEMENT,
      ),
    ).toBe(false);
  });

  it("builds a queue from mistaken questions", () => {
    const q1 = { id: "q1" };
    const q2 = { id: "q2" };
    expect(
      buildReinforcementQueue([
        { question: q1 },
        { question: null },
        { question: q2 },
      ]),
    ).toEqual([q1, q2]);
  });

  it("tracks reinforcement progress labels", () => {
    expect(reinforcementLabel(0, 3)).toEqual({ current: 1, total: 3 });
    expect(reinforcementLabel(2, 3)).toEqual({ current: 3, total: 3 });
    expect(isLastReinforcementQuestion(2, 3)).toBe(true);
    expect(isLastReinforcementQuestion(1, 3)).toBe(false);
  });
});