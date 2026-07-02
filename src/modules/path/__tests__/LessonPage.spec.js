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

describe("LessonPage mistake review", () => {
  it("tracks wrong answers and shows a recap on the summary screen", () => {
    const source = readFileSync(resolve(ROOT, "src/modules/path/LessonPage.vue"), "utf8");
    expect(source).toMatch(/const mistakes = ref\(\[\]\)/);
    expect(source).toMatch(/mistakes\.value\.push/);
    expect(source).toMatch(/class="mistake-review"/);
    expect(source).toMatch(/path\.reviewMistakes/);
    expect(source).toMatch(/formatQuestionPrompt/);
  });
});