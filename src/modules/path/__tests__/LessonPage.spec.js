import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(__dirname, "../../../..");

describe("LessonPage answer reveal", () => {
  it("shows correct answer hint when the learner answers incorrectly", () => {
    const source = readFileSync(resolve(ROOT, "src/modules/path/LessonPage.vue"), "utf8");
    expect(source).toMatch(/formatCorrectAnswer/);
    expect(source).toMatch(/class="answer-reveal"/);
    expect(source).toMatch(/path\.correctAnswer/);
    expect(source).toMatch(/showResult && !lastCorrect && correctAnswerText/);
  });
});