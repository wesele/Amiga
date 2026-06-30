import { describe, expect, it } from "vitest";
import { pickLearningGoal } from "../learningGoal.js";

describe("pickLearningGoal", () => {
  it("returns the goal with the highest id for the target language", () => {
    const goals = [
      { id: 1, target_language: "es", cefr_level: "A1" },
      { id: 3, target_language: "es", cefr_level: "A2" },
      { id: 2, target_language: "en", cefr_level: "A1" },
    ];
    expect(pickLearningGoal(goals, "es")).toEqual(goals[1]);
  });

  it("returns null when no goal matches", () => {
    expect(pickLearningGoal([{ id: 1, target_language: "en", cefr_level: "A1" }], "es")).toBeNull();
  });
});