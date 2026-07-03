import { describe, it, expect } from "vitest";
import { achievementUnlockHint } from "../achievementHints.js";

describe("achievementUnlockHint", () => {
  it("computes remaining and maps lessons to path", () => {
    const hint = achievementUnlockHint(
      { category: "lessons", threshold: 25 },
      18,
    );
    expect(hint.remaining).toBe(7);
    expect(hint.hintParams).toEqual({ remaining: 7, target: 25 });
    expect(hint.route).toEqual({ name: "path" });
    expect(hint.actionKey).toBe("achievements.actionPath");
  });

  it("maps vocab to vocab-review", () => {
    const hint = achievementUnlockHint(
      { category: "vocab", threshold: 100 },
      80,
    );
    expect(hint.route).toEqual({ name: "vocab-review" });
    expect(hint.actionKey).toBe("achievements.actionVocab");
  });

  it("maps mistakes to path-mistake-review", () => {
    const hint = achievementUnlockHint(
      { category: "mistakes", threshold: 10 },
      3,
    );
    expect(hint.route).toEqual({ name: "path-mistake-review" });
    expect(hint.actionKey).toBe("achievements.actionMistakes");
  });

  it("uses resume section route for streak when available", () => {
    const hint = achievementUnlockHint(
      { category: "streak", threshold: 7 },
      5,
      { resumeTarget: { section: { id: "s1", kind: "practice", question_count: 5 } } },
    );
    expect(hint.route).toEqual({ name: "path-lesson", params: { sectionId: "s1" } });
  });
});