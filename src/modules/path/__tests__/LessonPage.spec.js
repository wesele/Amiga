import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createMemoryHistory, createRouter } from "vue-router";
import { flushPromises, mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import * as api from "@/shared/api.js";
import { setLocale } from "@/shared/i18n";
import { recordLessonMistake } from "../mistakeReviewStore.js";
import { STATS_STORAGE_KEY } from "@/modules/learn/questionTypeStats.js";
import QuestionRenderer from "../components/QuestionRenderer.vue";

const ROOT = resolve(__dirname, "../../../..");
const SECTION_ID = "zh-es/U01-PRACTICE";

const LessonPage = (await import("@/modules/path/LessonPage.vue")).default;

function makeRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: "/learn/path", name: "path", component: { template: "<div/>" } },
      { path: "/learn/path/practice/:typeId", name: "path-focus-practice", component: { template: "<div/>" } },
      {
        path: "/learn/path/lesson/:sectionId",
        name: "path-lesson",
        component: LessonPage,
      },
    ],
  });
}

function lessonPayload(questionCount = 1) {
  const questions = [
    {
      id: "q1",
      type: "T05",
      sentence: "Hola, me llamo ____.",
      options: ["Ana", "casa", "perro", "libro"],
      answerIdx: 0,
    },
    {
      id: "q2",
      type: "T05",
      sentence: "Buenos ____.",
      options: ["días", "noches", "tardes", "años"],
      answerIdx: 0,
    },
    {
      id: "q3",
      type: "T05",
      sentence: "Muchas ____.",
      options: ["gracias", "noches", "casas", "libros"],
      answerIdx: 0,
    },
    {
      id: "q4",
      type: "T05",
      sentence: "Hasta ____.",
      options: ["luego", "noche", "casa", "perro"],
      answerIdx: 0,
    },
  ];
  return {
    section_title_native: "闯关练习",
    questions: questions.slice(0, questionCount),
  };
}

describe("LessonPage answer reveal", () => {
  it("shows correct answer hint when the learner answers incorrectly", () => {
    const source = readFileSync(resolve(ROOT, "src/modules/path/LessonPage.vue"), "utf8");
    expect(source).toMatch(/formatCorrectAnswer/);
    expect(source).toMatch(/class="answer-reveal"/);
    expect(source).toMatch(/path\.correctAnswer/);
    expect(source).toMatch(/showResult && !lastCorrect && correctAnswerText/);
  });

  it("shows your answer alongside correct answer when practice answer is wrong", () => {
    const source = readFileSync(resolve(ROOT, "src/modules/path/LessonPage.vue"), "utf8");
    expect(source).toMatch(/wrongAnswerFeedback\.js/);
    expect(source).toMatch(/shouldShowYourAnswer/);
    expect(source).toMatch(/yourAnswerText/);
    expect(source).toMatch(/class="your-answer-reveal"/);
    expect(source).toMatch(/showYourAnswer/);
  });

  it("renders your answer and correct answer in the footer after a wrong choice", async () => {
    setActivePinia(createPinia());
    setLocale("zh", { persist: false });
    const mockInvoke = vi.fn().mockImplementation((cmd) => {
      if (cmd === "get_current_user") {
        return Promise.resolve({ id: "u1", native_language: "zh" });
      }
      if (cmd === "get_target_language_cmd") return Promise.resolve("es");
      if (cmd === "get_learning_goals_cmd") {
        return Promise.resolve([{ target_language: "es", cefr_level: "A1" }]);
      }
      if (cmd === "get_section_lesson_cmd") {
        return Promise.resolve(lessonPayload(1));
      }
      return Promise.resolve(null);
    });
    api.__setInvoke(mockInvoke);

    const router = makeRouter();
    await router.push({ name: "path-lesson", params: { sectionId: SECTION_ID } });
    await router.isReady();

    const wrapper = mount(LessonPage, {
      global: { plugins: [router] },
    });
    await flushPromises();

    wrapper.vm.currentAnswer = 1;
    wrapper.vm.onPrimaryAction();
    await flushPromises();

    const yourAnswer = wrapper.find(".your-answer-reveal");
    const correctAnswer = wrapper.find(".answer-reveal");
    expect(yourAnswer.exists()).toBe(true);
    expect(yourAnswer.text()).toContain("你的答案：casa");
    expect(correctAnswer.exists()).toBe(true);
    expect(correctAnswer.text()).toContain("正确答案：Ana");
    expect(wrapper.find(".feedback.bad").exists()).toBe(true);
  });
});

describe("LessonPage answer feedback", () => {
  it("plays sound and haptic feedback when an answer is checked", () => {
    const source = readFileSync(resolve(ROOT, "src/modules/path/LessonPage.vue"), "utf8");
    expect(source).toMatch(/playAnswerFeedback/);
    expect(source).toMatch(/playAnswerFeedback\(lastCorrect\.value\)/);
  });
});

describe("LessonPage question transition", () => {
  it("wraps QuestionRenderer in a slide transition keyed by question position", () => {
    const source = readFileSync(resolve(ROOT, "src/modules/path/LessonPage.vue"), "utf8");
    expect(source).toMatch(/PracticeQuestionTransition/);
    expect(source).toMatch(/practiceQuestionKey\.js/);
    expect(source).toMatch(/:question-key="questionTransitionKey"/);
  });
});

describe("LessonPage choice auto-submit flow", () => {
  let mockInvoke;

  beforeEach(() => {
    setActivePinia(createPinia());
    setLocale("zh", { persist: false });
    mockInvoke = vi.fn().mockImplementation((cmd) => {
      if (cmd === "get_current_user") {
        return Promise.resolve({ id: "u1", native_language: "zh" });
      }
      if (cmd === "get_target_language_cmd") return Promise.resolve("es");
      if (cmd === "get_learning_goals_cmd") {
        return Promise.resolve([{ target_language: "es", cefr_level: "A1" }]);
      }
      if (cmd === "get_section_lesson_cmd") return Promise.resolve(lessonPayload(2));
      return Promise.resolve(null);
    });
    api.__setInvoke(mockInvoke);
  });

  it("wires instant answer auto-check and auto-advance timing helpers", () => {
    const source = readFileSync(resolve(ROOT, "src/modules/path/LessonPage.vue"), "utf8");
    expect(source).toMatch(/practiceAnswerAutoCheck\.js/);
    expect(source).toMatch(/practiceFlowTiming\.js/);
    expect(source).toMatch(/shouldAutoCheckOnAnswerChange/);
    expect(source).toMatch(/scheduleAutoAdvance/);
    expect(source).toMatch(/checkCurrentAnswer/);
  });

  it("auto-checks when the learner taps a choice option", async () => {
    const router = makeRouter();
    await router.push({ name: "path-lesson", params: { sectionId: SECTION_ID } });
    await router.isReady();

    const wrapper = mount(LessonPage, {
      global: { plugins: [router] },
    });
    await flushPromises();

    expect(wrapper.vm.showResult).toBe(false);
    wrapper.vm.currentAnswer = 0;
    await flushPromises();

    expect(wrapper.vm.showResult).toBe(true);
    expect(wrapper.vm.lastCorrect).toBe(true);
    expect(wrapper.find(".feedback.ok").exists()).toBe(true);
  });

  it("auto-checks when the learner completes the last matching pair", async () => {
    mockInvoke.mockImplementation((cmd) => {
      if (cmd === "get_current_user") {
        return Promise.resolve({ id: "u1", native_language: "zh" });
      }
      if (cmd === "get_target_language_cmd") return Promise.resolve("es");
      if (cmd === "get_learning_goals_cmd") {
        return Promise.resolve([{ target_language: "es", cefr_level: "A1" }]);
      }
      if (cmd === "get_section_lesson_cmd") {
        return Promise.resolve({
          section_title_native: "配对",
          questions: [
            {
              id: "match-1",
              type: "T03",
              pairs: [
                { left: "hola", right: "你好" },
                { left: "adiós", right: "再见" },
              ],
            },
          ],
        });
      }
      return Promise.resolve(null);
    });
    api.__setInvoke(mockInvoke);

    const router = makeRouter();
    await router.push({ name: "path-lesson", params: { sectionId: SECTION_ID } });
    await router.isReady();

    const wrapper = mount(LessonPage, {
      global: { plugins: [router] },
    });
    await flushPromises();

    expect(wrapper.vm.showResult).toBe(false);
    wrapper.vm.currentAnswer = [
      { left: "hola", right: "你好" },
      { left: "adiós", right: "再见" },
    ];
    await flushPromises();

    expect(wrapper.vm.showResult).toBe(true);
    expect(wrapper.vm.lastCorrect).toBe(true);
    expect(wrapper.find(".feedback.ok").exists()).toBe(true);
  });

  it("auto-advances to the next question after a brief correct-feedback pause", async () => {
    vi.useFakeTimers();

    const router = makeRouter();
    await router.push({ name: "path-lesson", params: { sectionId: SECTION_ID } });
    await router.isReady();

    const wrapper = mount(LessonPage, {
      global: { plugins: [router] },
    });
    await flushPromises();

    wrapper.vm.currentAnswer = 0;
    await flushPromises();
    expect(wrapper.vm.showResult).toBe(true);

    vi.advanceTimersByTime(700);
    await flushPromises();

    expect(wrapper.vm.index).toBe(1);
    expect(wrapper.vm.showResult).toBe(false);

    vi.useRealTimers();
  });

  it("wires Enter-to-submit for text-input questions", () => {
    const source = readFileSync(resolve(ROOT, "src/modules/path/LessonPage.vue"), "utf8");
    expect(source).toMatch(/@submit="onPrimaryAction"/);
  });

  it("does not auto-submit text-input answers on value change", async () => {
    mockInvoke.mockImplementation((cmd) => {
      if (cmd === "get_current_user") {
        return Promise.resolve({ id: "u1", native_language: "zh" });
      }
      if (cmd === "get_target_language_cmd") return Promise.resolve("es");
      if (cmd === "get_learning_goals_cmd") {
        return Promise.resolve([{ target_language: "es", cefr_level: "A1" }]);
      }
      if (cmd === "get_section_lesson_cmd") {
        return Promise.resolve({
          section_title_native: "拼写",
          questions: [
            { id: "spell-1", type: "T09", hint: "hola", answer: "hola" },
          ],
        });
      }
      return Promise.resolve(null);
    });
    api.__setInvoke(mockInvoke);

    const router = makeRouter();
    await router.push({ name: "path-lesson", params: { sectionId: SECTION_ID } });
    await router.isReady();

    const wrapper = mount(LessonPage, {
      global: { plugins: [router] },
    });
    await flushPromises();

    wrapper.vm.currentAnswer = "hola";
    await flushPromises();

    expect(wrapper.vm.showResult).toBe(false);
  });

  it("checks a text answer when the learner presses Enter", async () => {
    mockInvoke.mockImplementation((cmd) => {
      if (cmd === "get_current_user") {
        return Promise.resolve({ id: "u1", native_language: "zh" });
      }
      if (cmd === "get_target_language_cmd") return Promise.resolve("es");
      if (cmd === "get_learning_goals_cmd") {
        return Promise.resolve([{ target_language: "es", cefr_level: "A1" }]);
      }
      if (cmd === "get_section_lesson_cmd") {
        return Promise.resolve({
          section_title_native: "拼写",
          questions: [
            { id: "spell-1", type: "T09", hint: "hola", answer: "hola" },
          ],
        });
      }
      return Promise.resolve(null);
    });
    api.__setInvoke(mockInvoke);

    const router = makeRouter();
    await router.push({ name: "path-lesson", params: { sectionId: SECTION_ID } });
    await router.isReady();

    const wrapper = mount(LessonPage, {
      global: { plugins: [router] },
    });
    await flushPromises();

    wrapper.vm.currentAnswer = "hola";
    await flushPromises();
    expect(wrapper.vm.showResult).toBe(false);

    const renderer = wrapper.findComponent(QuestionRenderer);
    renderer.vm.$emit("submit");
    await flushPromises();

    expect(wrapper.vm.showResult).toBe(true);
    expect(wrapper.vm.lastCorrect).toBe(true);
  });

  it("wires global Enter-to-continue after feedback", () => {
    const source = readFileSync(resolve(ROOT, "src/modules/path/LessonPage.vue"), "utf8");
    expect(source).toMatch(/usePracticeEnterKey/);
  });

  it("advances to the next question when Enter is pressed after a wrong choice", async () => {
    const router = makeRouter();
    await router.push({ name: "path-lesson", params: { sectionId: SECTION_ID } });
    await router.isReady();

    const wrapper = mount(LessonPage, {
      global: { plugins: [router] },
    });
    await flushPromises();

    wrapper.vm.currentAnswer = 1;
    await flushPromises();
    expect(wrapper.vm.showResult).toBe(true);
    expect(wrapper.vm.lastCorrect).toBe(false);

    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    await flushPromises();

    expect(wrapper.vm.index).toBe(1);
    expect(wrapper.vm.showResult).toBe(false);
  });
});

describe("LessonPage session progress", () => {
  let mockInvoke;

  beforeEach(() => {
    setActivePinia(createPinia());
    setLocale("zh", { persist: false });
    mockInvoke = vi.fn().mockImplementation((cmd) => {
      if (cmd === "get_current_user") {
        return Promise.resolve({ id: "u1", native_language: "zh" });
      }
      if (cmd === "get_target_language_cmd") return Promise.resolve("es");
      if (cmd === "get_learning_goals_cmd") {
        return Promise.resolve([{ target_language: "es", cefr_level: "A1" }]);
      }
      if (cmd === "get_section_lesson_cmd") return Promise.resolve(lessonPayload(4));
      return Promise.resolve(null);
    });
    api.__setInvoke(mockInvoke);
  });

  it("shows current question progress from the first question", async () => {
    const router = makeRouter();
    await router.push({ name: "path-lesson", params: { sectionId: SECTION_ID } });
    await router.isReady();

    const wrapper = mount(LessonPage, {
      global: { plugins: [router] },
    });
    await flushPromises();

    expect(wrapper.find(".progress-label").text()).toBe("1/4");
    expect(wrapper.find(".progress-fill").attributes("style")).toContain("width: 25%");
  });

  it("updates progress after advancing to the next question", async () => {
    vi.useFakeTimers();

    const router = makeRouter();
    await router.push({ name: "path-lesson", params: { sectionId: SECTION_ID } });
    await router.isReady();

    const wrapper = mount(LessonPage, {
      global: { plugins: [router] },
    });
    await flushPromises();

    wrapper.vm.currentAnswer = 0;
    await flushPromises();
    vi.advanceTimersByTime(700);
    await flushPromises();

    expect(wrapper.find(".progress-label").text()).toBe("2/4");
    expect(wrapper.find(".progress-fill").attributes("style")).toContain("width: 50%");

    vi.useRealTimers();
  });
});

describe("LessonPage lesson share", () => {
  it("includes share-win button markup on the summary screen", () => {
    const source = readFileSync(resolve(ROOT, "src/modules/path/LessonPage.vue"), "utf8");
    expect(source).toMatch(/lessonShare\.js/);
    expect(source).toMatch(/shouldShowLessonShare/);
    expect(source).toMatch(/shareLessonResult/);
    expect(source).toMatch(/class="share-lesson-btn"/);
    expect(source).toMatch(/path\.shareLesson/);
  });
});

describe("LessonPage question type stats", () => {
  it("records answer results by question type during the main lesson phase", () => {
    const source = readFileSync(resolve(ROOT, "src/modules/path/LessonPage.vue"), "utf8");
    expect(source).toMatch(/questionTypeStats\.js/);
    expect(source).toMatch(/recordAnswer/);
    expect(source).toMatch(/!inReinforcement\.value && currentQuestion\.value\?\.type/);
  });
});

describe("LessonPage mistake review queue", () => {
  it("persists wrong answers into the spaced-repetition mistake queue", () => {
    const source = readFileSync(resolve(ROOT, "src/modules/path/LessonPage.vue"), "utf8");
    expect(source).toMatch(/mistakeReviewStore\.js/);
    expect(source).toMatch(/recordLessonMistake/);
    expect(source).toMatch(/!inReinforcement\.value\)/);
  });
});

describe("LessonPage common mistake feedback", () => {
  let mockInvoke;

  beforeEach(() => {
    setActivePinia(createPinia());
    setLocale("zh", { persist: false });
    mockInvoke = vi.fn().mockImplementation((cmd) => {
      if (cmd === "get_current_user") {
        return Promise.resolve({ id: "u1", native_language: "zh" });
      }
      if (cmd === "get_target_language_cmd") return Promise.resolve("en");
      if (cmd === "get_learning_goals_cmd") {
        return Promise.resolve([{ target_language: "en", cefr_level: "A2" }]);
      }
      if (cmd === "get_section_lesson_cmd") {
        return Promise.resolve({
          section_title_native: "拼写练习",
          questions: [
            {
              id: "spell-1",
              type: "T09",
              hint: "第三人称单数要加 -s",
              answer: "drinks",
              commonMistakes: ["drink", "drinck"],
            },
          ],
        });
      }
      return Promise.resolve(null);
    });
    api.__setInvoke(mockInvoke);
  });

  it("surfaces author-tagged spelling mistakes with a targeted tip", () => {
    const source = readFileSync(resolve(ROOT, "src/modules/path/LessonPage.vue"), "utf8");
    expect(source).toMatch(/commonMistakeFeedback\.js/);
    expect(source).toMatch(/getCommonMistakeFeedback/);
    expect(source).toMatch(/class="common-mistake-tip"/);
    expect(source).toMatch(/commonMistakeFeedback/);
  });

  it("shows a common-mistake tip when the learner types a tagged wrong spelling", async () => {
    const router = makeRouter();
    await router.push({ name: "path-lesson", params: { sectionId: SECTION_ID } });
    await router.isReady();

    const wrapper = mount(LessonPage, {
      global: { plugins: [router] },
    });
    await flushPromises();

    wrapper.vm.currentAnswer = "drink";
    wrapper.vm.onPrimaryAction();
    await flushPromises();

    const tip = wrapper.find(".common-mistake-tip");
    expect(tip.exists()).toBe(true);
    expect(tip.text()).toContain("drink");
    expect(tip.text()).toContain("第三人称单数要加 -s");
    expect(wrapper.find(".feedback.bad").exists()).toBe(true);
  });
});

describe("LessonPage near-miss feedback", () => {
  let mockInvoke;

  beforeEach(() => {
    setActivePinia(createPinia());
    setLocale("zh", { persist: false });
    mockInvoke = vi.fn().mockImplementation((cmd) => {
      if (cmd === "get_current_user") {
        return Promise.resolve({ id: "u1", native_language: "zh" });
      }
      if (cmd === "get_target_language_cmd") return Promise.resolve("es");
      if (cmd === "get_learning_goals_cmd") {
        return Promise.resolve([{ target_language: "es", cefr_level: "A1" }]);
      }
      if (cmd === "get_section_lesson_cmd") {
        return Promise.resolve({
          section_title_native: "拼写练习",
          questions: [
            {
              id: "spell-near",
              type: "T09",
              hint: "学生",
              answer: "estudiante",
              commonMistakes: [],
            },
          ],
        });
      }
      return Promise.resolve(null);
    });
    api.__setInvoke(mockInvoke);
  });

  it("wires near-miss feedback into the lesson footer", () => {
    const source = readFileSync(resolve(ROOT, "src/modules/path/LessonPage.vue"), "utf8");
    expect(source).toMatch(/nearMissAnswer\.js/);
    expect(source).toMatch(/getNearMissFeedback/);
    expect(source).toMatch(/class="near-miss-tip"/);
    expect(source).toMatch(/nearMissFeedback/);
  });

  it("shows an encouraging tip when the learner is one letter off", async () => {
    const router = makeRouter();
    await router.push({ name: "path-lesson", params: { sectionId: SECTION_ID } });
    await router.isReady();

    const wrapper = mount(LessonPage, {
      global: { plugins: [router] },
    });
    await flushPromises();

    wrapper.vm.currentAnswer = "estudante";
    wrapper.vm.onPrimaryAction();
    await flushPromises();

    const tip = wrapper.find(".near-miss-tip");
    expect(tip.exists()).toBe(true);
    expect(tip.text()).toContain("estudante");
    expect(tip.text()).toContain("estudiante");
    expect(wrapper.find(".common-mistake-tip").exists()).toBe(false);
    expect(wrapper.find(".feedback.bad").exists()).toBe(true);
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

  it("shows the learner's wrong answer alongside the correct one in the recap", () => {
    const source = readFileSync(resolve(ROOT, "src/modules/path/LessonPage.vue"), "utf8");
    expect(source).toMatch(/formatUserAnswer/);
    expect(source).toMatch(/class="mistake-wrong"/);
    expect(source).toMatch(/path\.mistakeReviewPreviousAnswer/);
    expect(source).toMatch(/item\.answer/);
  });
});

describe("LessonPage smart hints", () => {
  let mockInvoke;

  beforeEach(() => {
    setActivePinia(createPinia());
    setLocale("zh", { persist: false });
    mockInvoke = vi.fn().mockImplementation((cmd) => {
      if (cmd === "get_current_user") {
        return Promise.resolve({ id: "u1", native_language: "zh" });
      }
      if (cmd === "get_target_language_cmd") return Promise.resolve("es");
      if (cmd === "get_learning_goals_cmd") {
        return Promise.resolve([{ target_language: "es", cefr_level: "A1" }]);
      }
      if (cmd === "get_section_lesson_cmd") return Promise.resolve(lessonPayload());
      return Promise.resolve(null);
    });
    api.__setInvoke(mockInvoke);
  });

  it("wires hint button and reveal flow in the lesson footer", () => {
    const source = readFileSync(resolve(ROOT, "src/modules/path/LessonPage.vue"), "utf8");
    expect(source).toMatch(/getQuestionHint/);
    expect(source).toMatch(/class="hint-btn"/);
    expect(source).toMatch(/class="hint-text"/);
    expect(source).toMatch(/path\.getHint/);
    expect(source).toMatch(/questionHintTimer\.js/);
    expect(source).toMatch(/scheduleAutoHint/);
    expect(source).toMatch(/path\.hintAutoRevealed/);
  });

  it("shows a contextual hint when the learner taps the hint button", async () => {
    const router = makeRouter();
    await router.push({ name: "path-lesson", params: { sectionId: SECTION_ID } });
    await router.isReady();

    const wrapper = mount(LessonPage, {
      global: { plugins: [router] },
    });
    await flushPromises();

    const hintBtn = wrapper.find(".hint-btn");
    expect(hintBtn.exists()).toBe(true);

    await hintBtn.trigger("click");
    await flushPromises();

    const hint = wrapper.find(".hint-text");
    expect(hint.exists()).toBe(true);
    expect(hint.text()).toContain("casa");
    expect(hint.classes()).not.toContain("is-auto");
    expect(hintBtn.attributes("disabled")).toBeDefined();
  });

  it("auto-reveals a hint after the learner idles on a question", async () => {
    vi.useFakeTimers();

    const router = makeRouter();
    await router.push({ name: "path-lesson", params: { sectionId: SECTION_ID } });
    await router.isReady();

    const wrapper = mount(LessonPage, {
      global: { plugins: [router] },
    });
    await flushPromises();

    expect(wrapper.find(".hint-text").exists()).toBe(false);

    vi.advanceTimersByTime(15_000);
    await flushPromises();

    const hint = wrapper.find(".hint-text");
    expect(hint.exists()).toBe(true);
    expect(hint.text()).toContain("卡住太久");
    expect(hint.text()).toContain("casa");
    expect(hint.classes()).toContain("is-auto");
    expect(wrapper.find(".hint-btn").attributes("disabled")).toBeDefined();

    vi.useRealTimers();
  });
});

describe("LessonPage mistake reinforcement", () => {
  let mockInvoke;

  beforeEach(() => {
    setActivePinia(createPinia());
    setLocale("zh", { persist: false });
    mockInvoke = vi.fn().mockImplementation((cmd) => {
      if (cmd === "get_current_user") {
        return Promise.resolve({ id: "u1", native_language: "zh" });
      }
      if (cmd === "get_target_language_cmd") return Promise.resolve("es");
      if (cmd === "get_learning_goals_cmd") {
        return Promise.resolve([{ target_language: "es", cefr_level: "A1" }]);
      }
      if (cmd === "get_section_lesson_cmd") return Promise.resolve(lessonPayload(2));
      if (cmd === "complete_section_cmd") {
        return Promise.resolve({ passed: true, stars: 2, correctCount: 1 });
      }
      return Promise.resolve(null);
    });
    api.__setInvoke(mockInvoke);
  });

  it("wires reinforcement banner and helper imports in the lesson body", () => {
    const source = readFileSync(resolve(ROOT, "src/modules/path/LessonPage.vue"), "utf8");
    expect(source).toMatch(/lessonReinforcement\.js/);
    expect(source).toMatch(/class="reinforcement-banner"/);
    expect(source).toMatch(/path\.reinforceMistakes/);
    expect(source).toMatch(/shouldStartReinforcement/);
  });

  it("runs a reinforcement round before submitting when the learner missed questions", async () => {
    const router = makeRouter();
    await router.push({ name: "path-lesson", params: { sectionId: SECTION_ID } });
    await router.isReady();

    const wrapper = mount(LessonPage, {
      global: { plugins: [router] },
    });
    await flushPromises();

    wrapper.vm.currentAnswer = 1;
    wrapper.vm.onPrimaryAction();
    await flushPromises();
    wrapper.vm.onPrimaryAction();
    await flushPromises();

    wrapper.vm.currentAnswer = 1;
    wrapper.vm.onPrimaryAction();
    await flushPromises();
    wrapper.vm.onPrimaryAction();
    await flushPromises();

    const banner = wrapper.find(".reinforcement-banner");
    expect(banner.exists()).toBe(true);
    expect(banner.text()).toContain("错题巩固");
    expect(banner.text()).toContain("1/2");

    wrapper.vm.currentAnswer = 0;
    wrapper.vm.onPrimaryAction();
    await flushPromises();
    wrapper.vm.onPrimaryAction();
    await flushPromises();

    expect(wrapper.find(".reinforcement-banner").text()).toContain("2/2");

    wrapper.vm.currentAnswer = 0;
    wrapper.vm.onPrimaryAction();
    await flushPromises();
    wrapper.vm.onPrimaryAction();
    await flushPromises();

    expect(mockInvoke).toHaveBeenCalledWith(
      "complete_section_cmd",
      expect.anything(),
    );
    expect(wrapper.find(".summary").exists()).toBe(true);
  });
});

describe("LessonPage streak milestone celebration", () => {
  let mockInvoke;

  beforeEach(() => {
    setActivePinia(createPinia());
    setLocale("zh", { persist: false });
    mockInvoke = vi.fn().mockImplementation((cmd) => {
      if (cmd === "get_current_user") {
        return Promise.resolve({ id: "u1", native_language: "zh" });
      }
      if (cmd === "get_target_language_cmd") return Promise.resolve("es");
      if (cmd === "get_learning_goals_cmd") {
        return Promise.resolve([{ target_language: "es", cefr_level: "A1" }]);
      }
      if (cmd === "get_section_lesson_cmd") return Promise.resolve(lessonPayload());
      if (cmd === "complete_section_cmd") {
        return Promise.resolve({
          passed: true,
          stars: 3,
          streak_current: 7,
          streak_extended: true,
        });
      }
      return Promise.resolve(null);
    });
    api.__setInvoke(mockInvoke);
  });

  it("wires streak milestone helper and banner markup", () => {
    const source = readFileSync(resolve(ROOT, "src/modules/path/LessonPage.vue"), "utf8");
    expect(source).toMatch(/streakMilestone\.js/);
    expect(source).toMatch(/class="streak-milestone-banner"/);
    expect(source).toMatch(/getStreakMilestone/);
    expect(source).toMatch(/streakMilestoneKey/);
  });

  it("shows milestone banner instead of regular streak banner on milestone days", async () => {
    const router = makeRouter();
    await router.push({ name: "path-lesson", params: { sectionId: SECTION_ID } });
    await router.isReady();

    const wrapper = mount(LessonPage, {
      global: { plugins: [router] },
    });
    await flushPromises();

    wrapper.vm.currentAnswer = 0;
    wrapper.vm.onPrimaryAction();
    await flushPromises();
    wrapper.vm.onPrimaryAction();
    await flushPromises();

    const milestone = wrapper.find(".streak-milestone-banner");
    expect(milestone.exists()).toBe(true);
    expect(milestone.text()).toContain("一周连胜");
    expect(wrapper.find(".streak-banner").exists()).toBe(false);
  });
});

describe("LessonPage daily goal celebration", () => {
  let mockInvoke;

  beforeEach(() => {
    setActivePinia(createPinia());
    setLocale("zh", { persist: false });
    mockInvoke = vi.fn().mockImplementation((cmd) => {
      if (cmd === "get_current_user") {
        return Promise.resolve({ id: "u1", native_language: "zh" });
      }
      if (cmd === "get_target_language_cmd") return Promise.resolve("es");
      if (cmd === "get_learning_goals_cmd") {
        return Promise.resolve([{ target_language: "es", cefr_level: "A1" }]);
      }
      if (cmd === "get_section_lesson_cmd") return Promise.resolve(lessonPayload());
      if (cmd === "complete_section_cmd") {
        return Promise.resolve({
          passed: true,
          stars: 3,
          streak_current: 2,
          streak_extended: false,
          daily_goal_just_met: true,
          daily_goal_lessons_today: 2,
          daily_goal_target: 2,
        });
      }
      return Promise.resolve(null);
    });
    api.__setInvoke(mockInvoke);
  });

  it("includes daily goal celebration markup in the summary screen", () => {
    const source = readFileSync(resolve(ROOT, "src/modules/path/LessonPage.vue"), "utf8");
    expect(source).toMatch(/daily_goal_just_met/);
    expect(source).toMatch(/class="daily-goal-banner"/);
    expect(source).toMatch(/path\.dailyGoalMetCelebration/);
    expect(source).toMatch(/daily_goal_lessons_today/);
    expect(source).toMatch(/daily_goal_target/);
  });

  it("renders the daily goal banner after a passing lesson that meets the goal", async () => {
    const router = makeRouter();
    await router.push({ name: "path-lesson", params: { sectionId: SECTION_ID } });
    await router.isReady();

    const wrapper = mount(LessonPage, {
      global: { plugins: [router] },
    });
    await flushPromises();

    wrapper.vm.currentAnswer = 0;
    wrapper.vm.onPrimaryAction();
    await flushPromises();

    wrapper.vm.onPrimaryAction();
    await flushPromises();

    const banner = wrapper.find(".daily-goal-banner");
    expect(banner.exists()).toBe(true);
    expect(banner.text()).toContain("今日目标达成");
    expect(banner.text()).toContain("2/2");
  });
});

describe("LessonPage daily goal nudge", () => {
  let mockInvoke;

  beforeEach(() => {
    setActivePinia(createPinia());
    setLocale("zh", { persist: false });
    mockInvoke = vi.fn().mockImplementation((cmd) => {
      if (cmd === "get_current_user") {
        return Promise.resolve({ id: "u1", native_language: "zh" });
      }
      if (cmd === "get_target_language_cmd") return Promise.resolve("es");
      if (cmd === "get_learning_goals_cmd") {
        return Promise.resolve([{ target_language: "es", cefr_level: "A1" }]);
      }
      if (cmd === "get_section_lesson_cmd") return Promise.resolve(lessonPayload());
      if (cmd === "complete_section_cmd") {
        return Promise.resolve({
          passed: true,
          stars: 3,
          streak_current: 2,
          streak_extended: false,
          daily_goal_just_met: false,
          daily_goal_lessons_today: 1,
          daily_goal_target: 2,
        });
      }
      return Promise.resolve(null);
    });
    api.__setInvoke(mockInvoke);
  });

  it("wires post-lesson plan helpers in the summary screen", () => {
    const page = readFileSync(resolve(ROOT, "src/modules/path/LessonPage.vue"), "utf8");
    const plan = readFileSync(resolve(ROOT, "src/modules/path/postLessonPlan.js"), "utf8");
    expect(page).toMatch(/postLessonPlan\.js/);
    expect(page).toMatch(/buildPostLessonPlan/);
    expect(page).toMatch(/class="next-steps-panel"/);
    expect(plan).toMatch(/path\.dailyGoalRemaining/);
    expect(plan).toMatch(/path\.dailyGoalContinue/);
  });

  it("shows remaining-lesson nudge and updates the primary action", async () => {
    const router = makeRouter();
    await router.push({ name: "path-lesson", params: { sectionId: SECTION_ID } });
    await router.isReady();

    const wrapper = mount(LessonPage, {
      global: { plugins: [router] },
    });
    await flushPromises();

    wrapper.vm.currentAnswer = 0;
    wrapper.vm.onPrimaryAction();
    await flushPromises();

    wrapper.vm.onPrimaryAction();
    await flushPromises();

    const panel = wrapper.find(".next-steps-panel");
    expect(panel.exists()).toBe(true);
    expect(panel.text()).toContain("还差 1 节课");
    expect(panel.text()).toContain("1/2");
    expect(wrapper.find(".daily-goal-banner:not(.is-nudge)").exists()).toBe(false);

    const primary = wrapper.find(".summary-actions .action-btn.primary");
    expect(primary.text()).toContain("继续学习");
    expect(primary.text()).toContain("还差 1 节");
  });
});

describe("LessonPage weekly goal celebration", () => {
  let mockInvoke;

  beforeEach(() => {
    setActivePinia(createPinia());
    setLocale("zh", { persist: false });
    mockInvoke = vi.fn().mockImplementation((cmd) => {
      if (cmd === "get_current_user") {
        return Promise.resolve({ id: "u1", native_language: "zh" });
      }
      if (cmd === "get_target_language_cmd") return Promise.resolve("es");
      if (cmd === "get_learning_goals_cmd") {
        return Promise.resolve([{ target_language: "es", cefr_level: "A1" }]);
      }
      if (cmd === "get_section_lesson_cmd") return Promise.resolve(lessonPayload());
      if (cmd === "complete_section_cmd") {
        return Promise.resolve({
          passed: true,
          stars: 3,
          streak_current: 5,
          streak_extended: true,
          weekly_goal_just_met: true,
          weekly_goal_active_days: 5,
          weekly_goal_target_days: 5,
        });
      }
      return Promise.resolve(null);
    });
    api.__setInvoke(mockInvoke);
  });

  it("includes weekly goal celebration markup in the summary screen", () => {
    const source = readFileSync(resolve(ROOT, "src/modules/path/LessonPage.vue"), "utf8");
    expect(source).toMatch(/weekly_goal_just_met/);
    expect(source).toMatch(/class="weekly-goal-banner"/);
    expect(source).toMatch(/path\.weeklyGoalMetCelebration/);
    expect(source).toMatch(/weekly_goal_active_days/);
    expect(source).toMatch(/weekly_goal_target_days/);
  });

  it("renders the weekly goal banner after a passing lesson that meets the goal", async () => {
    const router = makeRouter();
    await router.push({ name: "path-lesson", params: { sectionId: SECTION_ID } });
    await router.isReady();

    const wrapper = mount(LessonPage, {
      global: { plugins: [router] },
    });
    await flushPromises();

    wrapper.vm.currentAnswer = 0;
    wrapper.vm.onPrimaryAction();
    await flushPromises();

    wrapper.vm.onPrimaryAction();
    await flushPromises();

    const banner = wrapper.find(".weekly-goal-banner");
    expect(banner.exists()).toBe(true);
    expect(banner.text()).toContain("本周目标达成");
    expect(banner.text()).toContain("5/5");
  });
});

describe("LessonPage weekly goal nudge", () => {
  let mockInvoke;

  beforeEach(() => {
    setActivePinia(createPinia());
    setLocale("zh", { persist: false });
    mockInvoke = vi.fn().mockImplementation((cmd) => {
      if (cmd === "get_current_user") {
        return Promise.resolve({ id: "u1", native_language: "zh" });
      }
      if (cmd === "get_target_language_cmd") return Promise.resolve("es");
      if (cmd === "get_learning_goals_cmd") {
        return Promise.resolve([{ target_language: "es", cefr_level: "A1" }]);
      }
      if (cmd === "get_section_lesson_cmd") return Promise.resolve(lessonPayload());
      if (cmd === "complete_section_cmd") {
        return Promise.resolve({
          passed: true,
          stars: 3,
          streak_current: 3,
          streak_extended: true,
          daily_goal_just_met: true,
          daily_goal_lessons_today: 2,
          daily_goal_target: 2,
          weekly_goal_just_met: false,
          weekly_goal_active_days: 3,
          weekly_goal_target_days: 5,
        });
      }
      return Promise.resolve(null);
    });
    api.__setInvoke(mockInvoke);
  });

  it("wires weekly goal into the next steps queue", () => {
    const page = readFileSync(resolve(ROOT, "src/modules/path/LessonPage.vue"), "utf8");
    const plan = readFileSync(resolve(ROOT, "src/modules/path/postLessonPlan.js"), "utf8");
    expect(page).toMatch(/class="next-steps-queue"/);
    expect(plan).toMatch(/path\.weeklyGoalRemainingNudge/);
  });

  it("shows remaining-days nudge when daily goal is met but weekly goal is not", async () => {
    const router = makeRouter();
    await router.push({ name: "path-lesson", params: { sectionId: SECTION_ID } });
    await router.isReady();

    const wrapper = mount(LessonPage, {
      global: { plugins: [router] },
    });
    await flushPromises();

    wrapper.vm.currentAnswer = 0;
    wrapper.vm.onPrimaryAction();
    await flushPromises();

    wrapper.vm.onPrimaryAction();
    await flushPromises();

    const dailyCelebration = wrapper.find(".daily-goal-banner:not(.is-nudge)");
    expect(dailyCelebration.exists()).toBe(true);
    expect(dailyCelebration.text()).toContain("今日目标达成");

    const queue = wrapper.find(".next-steps-queue");
    expect(queue.exists()).toBe(true);
    expect(queue.text()).toContain("还差 2 天");
    expect(queue.text()).toContain("3/5");
  });
});

describe("LessonPage mistake review nudge", () => {
  let mockInvoke;

  beforeEach(() => {
    localStorage.clear();
    setActivePinia(createPinia());
    setLocale("zh", { persist: false });
    recordLessonMistake(
      "zh-es",
      { id: "due-q1", type: "T09", answer: "hola" },
      "ola",
      Date.now(),
    );
    mockInvoke = vi.fn().mockImplementation((cmd) => {
      if (cmd === "get_current_user") {
        return Promise.resolve({ id: "u1", native_language: "zh" });
      }
      if (cmd === "get_target_language_cmd") return Promise.resolve("es");
      if (cmd === "get_learning_goals_cmd") {
        return Promise.resolve([{ target_language: "es", cefr_level: "A1" }]);
      }
      if (cmd === "get_section_lesson_cmd") return Promise.resolve(lessonPayload());
      if (cmd === "complete_section_cmd") {
        return Promise.resolve({
          passed: true,
          stars: 3,
          daily_goal_just_met: true,
          daily_goal_lessons_today: 2,
          daily_goal_target: 2,
        });
      }
      return Promise.resolve(null);
    });
    api.__setInvoke(mockInvoke);
  });

  it("wires mistake review into the next steps panel", () => {
    const page = readFileSync(resolve(ROOT, "src/modules/path/LessonPage.vue"), "utf8");
    const plan = readFileSync(resolve(ROOT, "src/modules/path/postLessonPlan.js"), "utf8");
    expect(page).toMatch(/class="next-steps-primary"/);
    expect(plan).toMatch(/path\.mistakeReviewRemainingNudge/);
    expect(plan).toMatch(/path\.mistakeReviewContinue/);
    expect(plan).toMatch(/path-mistake-review/);
  });

  it("shows due-mistake nudge and updates the primary action when daily goal is met", async () => {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: "/learn/path", name: "path", component: { template: "<div/>" } },
        {
          path: "/learn/path/review/mistakes",
          name: "path-mistake-review",
          component: { template: "<div/>" },
        },
        {
          path: "/learn/path/lesson/:sectionId",
          name: "path-lesson",
          component: LessonPage,
        },
      ],
    });
    await router.push({ name: "path-lesson", params: { sectionId: SECTION_ID } });
    await router.isReady();

    const wrapper = mount(LessonPage, {
      global: { plugins: [router] },
    });
    await flushPromises();
    expect(wrapper.vm.dueMistakesAtStart).toBe(1);

    wrapper.vm.currentAnswer = 0;
    wrapper.vm.onPrimaryAction();
    await flushPromises();
    wrapper.vm.onPrimaryAction();
    await flushPromises();

    const panel = wrapper.find(".next-steps-panel");
    expect(panel.exists()).toBe(true);
    expect(panel.find(".next-steps-primary").text()).toContain("1 道错题");
    expect(wrapper.find(".daily-goal-banner.is-nudge").exists()).toBe(false);

    const primary = wrapper.find(".summary-actions .action-btn.primary");
    expect(primary.text()).toContain("去复习错题");
  });

  it("routes to mistake review when the nudge primary action is taken", async () => {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: "/learn/path", name: "path", component: { template: "<div/>" } },
        {
          path: "/learn/path/review/mistakes",
          name: "path-mistake-review",
          component: { template: "<div/>" },
        },
        {
          path: "/learn/path/lesson/:sectionId",
          name: "path-lesson",
          component: LessonPage,
        },
      ],
    });
    await router.push({ name: "path-lesson", params: { sectionId: SECTION_ID } });
    await router.isReady();

    const wrapper = mount(LessonPage, {
      global: { plugins: [router] },
    });
    await flushPromises();

    wrapper.vm.currentAnswer = 0;
    wrapper.vm.onPrimaryAction();
    await flushPromises();
    wrapper.vm.onPrimaryAction();
    await flushPromises();

    await wrapper.find(".summary-actions .action-btn.primary").trigger("click");
    await flushPromises();

    expect(router.currentRoute.value.name).toBe("path-mistake-review");
  });
});

describe("LessonPage fresh mistake nudge", () => {
  let mockInvoke;

  function freshMistakeInvoke(dailyGoalResult) {
    return vi.fn().mockImplementation((cmd) => {
      if (cmd === "get_current_user") {
        return Promise.resolve({ id: "u1", native_language: "zh" });
      }
      if (cmd === "get_target_language_cmd") return Promise.resolve("es");
      if (cmd === "get_learning_goals_cmd") {
        return Promise.resolve([{ target_language: "es", cefr_level: "A1" }]);
      }
      if (cmd === "get_unknown_words_cmd") return Promise.resolve([]);
      if (cmd === "get_section_lesson_cmd") return Promise.resolve(lessonPayload());
      if (cmd === "complete_section_cmd") {
        return Promise.resolve({
          passed: true,
          stars: 2,
          ...dailyGoalResult,
        });
      }
      return Promise.resolve(null);
    });
  }

  beforeEach(() => {
    localStorage.clear();
    setActivePinia(createPinia());
    setLocale("zh", { persist: false });
  });

  it("wires fresh mistake handling in the summary screen", () => {
    const page = readFileSync(resolve(ROOT, "src/modules/path/LessonPage.vue"), "utf8");
    const plan = readFileSync(resolve(ROOT, "src/modules/path/postLessonPlan.js"), "utf8");
    expect(page).toMatch(/shouldShowFreshMistakeInMistakeSection/);
    expect(plan).toMatch(/path\.freshMistakeNudge/);
    expect(page).toMatch(/path\.reviewMistakesAction/);
    expect(page).toMatch(/mistake-review-action/);
  });

  it("shows fresh mistake banner and secondary action when daily goal is unfinished", async () => {
    mockInvoke = freshMistakeInvoke({
      daily_goal_lessons_today: 1,
      daily_goal_target: 2,
    });
    api.__setInvoke(mockInvoke);

    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: "/learn/path", name: "path", component: { template: "<div/>" } },
        {
          path: "/learn/path/review/mistakes",
          name: "path-mistake-review",
          component: { template: "<div/>" },
        },
        {
          path: "/learn/path/lesson/:sectionId",
          name: "path-lesson",
          component: LessonPage,
        },
      ],
    });
    await router.push({ name: "path-lesson", params: { sectionId: SECTION_ID } });
    await router.isReady();

    const wrapper = mount(LessonPage, {
      global: { plugins: [router] },
    });
    await flushPromises();
    expect(wrapper.vm.dueMistakesAtStart).toBe(0);

    wrapper.vm.currentAnswer = 1;
    wrapper.vm.onPrimaryAction();
    await flushPromises();
    wrapper.vm.onPrimaryAction();
    await flushPromises();

    wrapper.vm.currentAnswer = 0;
    wrapper.vm.onPrimaryAction();
    await flushPromises();
    wrapper.vm.onPrimaryAction();
    await flushPromises();

    expect(wrapper.find(".next-steps-primary").text()).toContain("还差 1 节");
    expect(wrapper.find(".fresh-mistake-nudge-banner").exists()).toBe(false);

    const secondary = wrapper.find(".mistake-review-action");
    expect(secondary.exists()).toBe(true);
    expect(secondary.text()).toContain("巩固本节错题");

    const primary = wrapper.find(".summary-actions .action-btn.primary");
    expect(primary.text()).toContain("继续学习");
    expect(primary.text()).not.toContain("巩固本节错题");
  });

  it("routes secondary fresh mistake action to mistake review", async () => {
    mockInvoke = freshMistakeInvoke({
      daily_goal_lessons_today: 1,
      daily_goal_target: 2,
    });
    api.__setInvoke(mockInvoke);

    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: "/learn/path", name: "path", component: { template: "<div/>" } },
        {
          path: "/learn/path/review/mistakes",
          name: "path-mistake-review",
          component: { template: "<div/>" },
        },
        {
          path: "/learn/path/lesson/:sectionId",
          name: "path-lesson",
          component: LessonPage,
        },
      ],
    });
    await router.push({ name: "path-lesson", params: { sectionId: SECTION_ID } });
    await router.isReady();

    const wrapper = mount(LessonPage, {
      global: { plugins: [router] },
    });
    await flushPromises();

    wrapper.vm.currentAnswer = 1;
    wrapper.vm.onPrimaryAction();
    await flushPromises();
    wrapper.vm.onPrimaryAction();
    await flushPromises();

    wrapper.vm.currentAnswer = 0;
    wrapper.vm.onPrimaryAction();
    await flushPromises();
    wrapper.vm.onPrimaryAction();
    await flushPromises();

    await wrapper.find(".mistake-review-action").trigger("click");
    await flushPromises();

    expect(router.currentRoute.value.name).toBe("path-mistake-review");
  });

  it("promotes fresh mistakes to the primary action when daily goal is met", async () => {
    mockInvoke = freshMistakeInvoke({
      daily_goal_just_met: true,
      daily_goal_lessons_today: 2,
      daily_goal_target: 2,
    });
    api.__setInvoke(mockInvoke);

    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: "/learn/path", name: "path", component: { template: "<div/>" } },
        {
          path: "/learn/path/review/mistakes",
          name: "path-mistake-review",
          component: { template: "<div/>" },
        },
        {
          path: "/learn/path/lesson/:sectionId",
          name: "path-lesson",
          component: LessonPage,
        },
      ],
    });
    await router.push({ name: "path-lesson", params: { sectionId: SECTION_ID } });
    await router.isReady();

    const wrapper = mount(LessonPage, {
      global: { plugins: [router] },
    });
    await flushPromises();

    wrapper.vm.currentAnswer = 1;
    wrapper.vm.onPrimaryAction();
    await flushPromises();
    wrapper.vm.onPrimaryAction();
    await flushPromises();

    wrapper.vm.currentAnswer = 0;
    wrapper.vm.onPrimaryAction();
    await flushPromises();
    wrapper.vm.onPrimaryAction();
    await flushPromises();

    expect(wrapper.find(".next-steps-primary").text()).toContain("1 道错题");
    const primary = wrapper.find(".summary-actions .action-btn.primary");
    expect(primary.text()).toContain("巩固本节错题");

    await primary.trigger("click");
    await flushPromises();
    expect(router.currentRoute.value.name).toBe("path-mistake-review");
  });
});

describe("LessonPage vocab review nudge", () => {
  const MOCK_VOCAB_WORDS = [
    { id: 1, word: "hola", definitions: { zh: "你好" } },
    { id: 2, word: "gracias", definitions: { zh: "谢谢" } },
    { id: 3, word: "casa", definitions: { zh: "房子" } },
  ];
  let mockInvoke;

  beforeEach(() => {
    localStorage.clear();
    setActivePinia(createPinia());
    setLocale("zh", { persist: false });
    mockInvoke = vi.fn().mockImplementation((cmd) => {
      if (cmd === "get_current_user") {
        return Promise.resolve({ id: "u1", native_language: "zh" });
      }
      if (cmd === "get_target_language_cmd") return Promise.resolve("es");
      if (cmd === "get_learning_goals_cmd") {
        return Promise.resolve([{ target_language: "es", cefr_level: "A1" }]);
      }
      if (cmd === "get_unknown_words_cmd") return Promise.resolve(MOCK_VOCAB_WORDS);
      if (cmd === "get_section_lesson_cmd") return Promise.resolve(lessonPayload());
      if (cmd === "complete_section_cmd") {
        return Promise.resolve({
          passed: true,
          stars: 3,
          daily_goal_just_met: true,
          daily_goal_lessons_today: 2,
          daily_goal_target: 2,
        });
      }
      return Promise.resolve(null);
    });
    api.__setInvoke(mockInvoke);
  });

  it("wires vocab review into the next steps panel", () => {
    const page = readFileSync(resolve(ROOT, "src/modules/path/LessonPage.vue"), "utf8");
    const plan = readFileSync(resolve(ROOT, "src/modules/path/postLessonPlan.js"), "utf8");
    expect(page).toMatch(/class="next-steps-primary"/);
    expect(plan).toMatch(/path\.vocabReviewRemainingNudge/);
    expect(plan).toMatch(/path\.vocabReviewContinue/);
    expect(plan).toMatch(/vocab-review/);
  });

  it("shows due-vocab nudge and updates the primary action when daily goal is met", async () => {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: "/learn/path", name: "path", component: { template: "<div/>" } },
        { path: "/vocab/review", name: "vocab-review", component: { template: "<div/>" } },
        {
          path: "/learn/path/lesson/:sectionId",
          name: "path-lesson",
          component: LessonPage,
        },
      ],
    });
    await router.push({ name: "path-lesson", params: { sectionId: SECTION_ID } });
    await router.isReady();

    const wrapper = mount(LessonPage, {
      global: { plugins: [router] },
    });
    await flushPromises();
    expect(wrapper.vm.dueVocabAtStart).toBe(3);

    wrapper.vm.currentAnswer = 0;
    wrapper.vm.onPrimaryAction();
    await flushPromises();
    wrapper.vm.onPrimaryAction();
    await flushPromises();

    const panel = wrapper.find(".next-steps-panel");
    expect(panel.exists()).toBe(true);
    expect(panel.find(".next-steps-primary").text()).toContain("3 个单词");
    expect(wrapper.find(".daily-goal-banner.is-nudge").exists()).toBe(false);

    const primary = wrapper.find(".summary-actions .action-btn.primary");
    expect(primary.text()).toContain("去复习单词");
  });

  it("routes to vocab review when the nudge primary action is taken", async () => {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: "/learn/path", name: "path", component: { template: "<div/>" } },
        { path: "/vocab/review", name: "vocab-review", component: { template: "<div/>" } },
        {
          path: "/learn/path/lesson/:sectionId",
          name: "path-lesson",
          component: LessonPage,
        },
      ],
    });
    await router.push({ name: "path-lesson", params: { sectionId: SECTION_ID } });
    await router.isReady();

    const wrapper = mount(LessonPage, {
      global: { plugins: [router] },
    });
    await flushPromises();

    wrapper.vm.currentAnswer = 0;
    wrapper.vm.onPrimaryAction();
    await flushPromises();
    wrapper.vm.onPrimaryAction();
    await flushPromises();

    await wrapper.find(".summary-actions .action-btn.primary").trigger("click");
    await flushPromises();

    expect(router.currentRoute.value.name).toBe("vocab-review");
  });

  it("prefers mistake review nudge over vocab review when both are due", async () => {
    recordLessonMistake(
      "zh-es",
      { id: "due-q1", type: "T09", answer: "hola" },
      "ola",
      Date.now(),
    );

    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: "/learn/path", name: "path", component: { template: "<div/>" } },
        {
          path: "/learn/path/review/mistakes",
          name: "path-mistake-review",
          component: { template: "<div/>" },
        },
        { path: "/vocab/review", name: "vocab-review", component: { template: "<div/>" } },
        {
          path: "/learn/path/lesson/:sectionId",
          name: "path-lesson",
          component: LessonPage,
        },
      ],
    });
    await router.push({ name: "path-lesson", params: { sectionId: SECTION_ID } });
    await router.isReady();

    const wrapper = mount(LessonPage, {
      global: { plugins: [router] },
    });
    await flushPromises();

    wrapper.vm.currentAnswer = 0;
    wrapper.vm.onPrimaryAction();
    await flushPromises();
    wrapper.vm.onPrimaryAction();
    await flushPromises();

    expect(wrapper.find(".next-steps-primary").text()).toContain("1 道错题");
    expect(wrapper.find(".next-steps-queue").text()).toContain("3 个单词");
    expect(wrapper.find(".summary-actions .action-btn.primary").text()).toContain("去复习错题");
  });
});

describe("LessonPage focus area nudge", () => {
  let mockInvoke;

  beforeEach(() => {
    localStorage.clear();
    setActivePinia(createPinia());
    setLocale("zh", { persist: false });
    localStorage.setItem(
      STATS_STORAGE_KEY,
      JSON.stringify({ "zh-es": { T09: { correct: 1, wrong: 5 } } }),
    );
    mockInvoke = vi.fn().mockImplementation((cmd) => {
      if (cmd === "get_current_user") {
        return Promise.resolve({ id: "u1", native_language: "zh" });
      }
      if (cmd === "get_target_language_cmd") return Promise.resolve("es");
      if (cmd === "get_learning_goals_cmd") {
        return Promise.resolve([{ target_language: "es", cefr_level: "A1" }]);
      }
      if (cmd === "get_unknown_words_cmd") return Promise.resolve([]);
      if (cmd === "get_section_lesson_cmd") return Promise.resolve(lessonPayload());
      if (cmd === "complete_section_cmd") {
        return Promise.resolve({
          passed: true,
          stars: 3,
          daily_goal_just_met: true,
          daily_goal_lessons_today: 2,
          daily_goal_target: 2,
        });
      }
      return Promise.resolve(null);
    });
    api.__setInvoke(mockInvoke);
  });

  it("wires focus area into the next steps panel", () => {
    const page = readFileSync(resolve(ROOT, "src/modules/path/LessonPage.vue"), "utf8");
    const plan = readFileSync(resolve(ROOT, "src/modules/path/postLessonPlan.js"), "utf8");
    expect(page).toMatch(/class="next-steps-primary"/);
    expect(plan).toMatch(/path\.focusAreaRemainingNudge/);
    expect(plan).toMatch(/path\.focusAreaContinue/);
  });

  it("shows focus area nudge and updates the primary action when daily goal is met", async () => {
    const router = makeRouter();
    await router.push({ name: "path-lesson", params: { sectionId: SECTION_ID } });
    await router.isReady();

    const wrapper = mount(LessonPage, {
      global: { plugins: [router] },
    });
    await flushPromises();
    expect(wrapper.vm.focusAreaAtStart?.typeId).toBe("T09");

    wrapper.vm.currentAnswer = 0;
    wrapper.vm.onPrimaryAction();
    await flushPromises();
    wrapper.vm.onPrimaryAction();
    await flushPromises();

    const panel = wrapper.find(".next-steps-primary");
    expect(panel.exists()).toBe(true);
    expect(panel.text()).toContain("拼写输入");
    expect(panel.text()).toContain("17%");

    const primary = wrapper.find(".summary-actions .action-btn.primary");
    expect(primary.text()).toContain("去强化薄弱题型");
  });

  it("routes to focus practice when the focus area nudge primary action is taken", async () => {
    const router = makeRouter();
    await router.push({ name: "path-lesson", params: { sectionId: SECTION_ID } });
    await router.isReady();

    const wrapper = mount(LessonPage, {
      global: { plugins: [router] },
    });
    await flushPromises();

    wrapper.vm.currentAnswer = 0;
    wrapper.vm.onPrimaryAction();
    await flushPromises();
    wrapper.vm.onPrimaryAction();
    await flushPromises();

    await wrapper.find(".summary-actions .action-btn.primary").trigger("click");
    await flushPromises();

    expect(router.currentRoute.value.name).toBe("path-focus-practice");
    expect(router.currentRoute.value.params.typeId).toBe("T09");
  });

  it("prefers vocab review nudge over focus area when both apply", async () => {
    mockInvoke.mockImplementation((cmd) => {
      if (cmd === "get_current_user") {
        return Promise.resolve({ id: "u1", native_language: "zh" });
      }
      if (cmd === "get_target_language_cmd") return Promise.resolve("es");
      if (cmd === "get_learning_goals_cmd") {
        return Promise.resolve([{ target_language: "es", cefr_level: "A1" }]);
      }
      if (cmd === "get_unknown_words_cmd") {
        return Promise.resolve([{ id: 1, word: "hola", definitions: { zh: "你好" } }]);
      }
      if (cmd === "get_section_lesson_cmd") return Promise.resolve(lessonPayload());
      if (cmd === "complete_section_cmd") {
        return Promise.resolve({
          passed: true,
          stars: 3,
          daily_goal_just_met: true,
          daily_goal_lessons_today: 2,
          daily_goal_target: 2,
        });
      }
      return Promise.resolve(null);
    });

    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: "/learn/path", name: "path", component: { template: "<div/>" } },
        { path: "/vocab/review", name: "vocab-review", component: { template: "<div/>" } },
        {
          path: "/learn/path/lesson/:sectionId",
          name: "path-lesson",
          component: LessonPage,
        },
      ],
    });
    await router.push({ name: "path-lesson", params: { sectionId: SECTION_ID } });
    await router.isReady();

    const wrapper = mount(LessonPage, {
      global: { plugins: [router] },
    });
    await flushPromises();

    wrapper.vm.currentAnswer = 0;
    wrapper.vm.onPrimaryAction();
    await flushPromises();
    wrapper.vm.onPrimaryAction();
    await flushPromises();

    expect(wrapper.find(".next-steps-primary").text()).toContain("1 个单词");
    expect(wrapper.find(".next-steps-queue").text()).toContain("拼写输入");
    expect(wrapper.find(".summary-actions .action-btn.primary").text()).toContain("去复习单词");
  });
});

describe("LessonPage lesson milestone celebration", () => {
  let mockInvoke;

  beforeEach(() => {
    setActivePinia(createPinia());
    setLocale("zh", { persist: false });
    mockInvoke = vi.fn().mockImplementation((cmd) => {
      if (cmd === "get_current_user") {
        return Promise.resolve({ id: "u1", native_language: "zh" });
      }
      if (cmd === "get_target_language_cmd") return Promise.resolve("es");
      if (cmd === "get_learning_goals_cmd") {
        return Promise.resolve([{ target_language: "es", cefr_level: "A1" }]);
      }
      if (cmd === "get_section_lesson_cmd") return Promise.resolve(lessonPayload());
      if (cmd === "complete_section_cmd") {
        return Promise.resolve({
          passed: true,
          stars: 3,
          lesson_milestone_reached: 10,
          lessons_completed_total: 10,
        });
      }
      return Promise.resolve(null);
    });
    api.__setInvoke(mockInvoke);
  });

  it("includes lesson milestone celebration markup", () => {
    const source = readFileSync(resolve(ROOT, "src/modules/path/LessonPage.vue"), "utf8");
    expect(source).toMatch(/lesson_milestone_reached/);
    expect(source).toMatch(/class="lesson-milestone-banner"/);
    expect(source).toMatch(/path\.lessonMilestoneReached/);
  });

  it("renders milestone banner when a lesson milestone is reached", async () => {
    const router = makeRouter();
    await router.push({ name: "path-lesson", params: { sectionId: SECTION_ID } });
    await router.isReady();

    const wrapper = mount(LessonPage, {
      global: { plugins: [router] },
    });
    await flushPromises();

    wrapper.vm.currentAnswer = 0;
    wrapper.vm.onPrimaryAction();
    await flushPromises();
    wrapper.vm.onPrimaryAction();
    await flushPromises();

    const banner = wrapper.find(".lesson-milestone-banner");
    expect(banner.exists()).toBe(true);
    expect(banner.text()).toContain("10 节课");
  });
});

describe("LessonPage perfect lesson celebration", () => {
  let mockInvoke;

  beforeEach(() => {
    setActivePinia(createPinia());
    setLocale("zh", { persist: false });
    mockInvoke = vi.fn().mockImplementation((cmd) => {
      if (cmd === "get_current_user") {
        return Promise.resolve({ id: "u1", native_language: "zh" });
      }
      if (cmd === "get_target_language_cmd") return Promise.resolve("es");
      if (cmd === "get_learning_goals_cmd") {
        return Promise.resolve([{ target_language: "es", cefr_level: "A1" }]);
      }
      if (cmd === "get_section_lesson_cmd") return Promise.resolve(lessonPayload());
      if (cmd === "complete_section_cmd") {
        return Promise.resolve({ passed: true, stars: 3 });
      }
      return Promise.resolve(null);
    });
    api.__setInvoke(mockInvoke);
  });

  it("includes perfect lesson celebration markup", () => {
    const source = readFileSync(resolve(ROOT, "src/modules/path/LessonPage.vue"), "utf8");
    expect(source).toMatch(/lessonPerfect\.js/);
    expect(source).toMatch(/perfectLessonStreak\.js/);
    expect(source).toMatch(/class="perfect-lesson-banner"/);
    expect(source).toMatch(/class="perfect-streak-banner"/);
    expect(source).toMatch(/path\.perfectLesson/);
    expect(source).toMatch(/summaryEmoji/);
  });

  it("renders perfect lesson banner when every answer was correct", async () => {
    const router = makeRouter();
    await router.push({ name: "path-lesson", params: { sectionId: SECTION_ID } });
    await router.isReady();

    const wrapper = mount(LessonPage, {
      global: { plugins: [router] },
    });
    await flushPromises();

    wrapper.vm.currentAnswer = 0;
    wrapper.vm.onPrimaryAction();
    await flushPromises();
    wrapper.vm.onPrimaryAction();
    await flushPromises();

    const banner = wrapper.find(".perfect-lesson-banner");
    expect(banner.exists()).toBe(true);
    expect(banner.text()).toContain("完美通关");
    expect(wrapper.find(".summary-emoji").text()).toBe("✨");
    expect(mockInvoke).toHaveBeenCalledWith(
      "complete_section_cmd",
      expect.objectContaining({ isPerfect: true }),
    );
  });

  it("shows perfect streak milestone banner when backend reports a milestone", async () => {
    mockInvoke.mockImplementation((cmd, args) => {
      if (cmd === "get_current_user") {
        return Promise.resolve({ id: "u1", native_language: "zh" });
      }
      if (cmd === "get_target_language_cmd") return Promise.resolve("es");
      if (cmd === "get_learning_goals_cmd") {
        return Promise.resolve([{ target_language: "es", cefr_level: "A1" }]);
      }
      if (cmd === "get_section_lesson_cmd") return Promise.resolve(lessonPayload());
      if (cmd === "complete_section_cmd") {
        return Promise.resolve({
          passed: true,
          stars: 3,
          perfect_lesson_streak: 3,
          perfect_lesson_milestone_reached: 3,
        });
      }
      return Promise.resolve(null);
    });

    const router = makeRouter();
    await router.push({ name: "path-lesson", params: { sectionId: SECTION_ID } });
    await router.isReady();

    const wrapper = mount(LessonPage, {
      global: { plugins: [router] },
    });
    await flushPromises();

    wrapper.vm.currentAnswer = 0;
    wrapper.vm.onPrimaryAction();
    await flushPromises();
    wrapper.vm.onPrimaryAction();
    await flushPromises();

    const banner = wrapper.find(".perfect-streak-banner");
    expect(banner.exists()).toBe(true);
    expect(banner.text()).toContain("连续 3 课完美通关");
  });

  it("does not show perfect lesson banner after a mistake", async () => {
    const router = makeRouter();
    await router.push({ name: "path-lesson", params: { sectionId: SECTION_ID } });
    await router.isReady();

    const wrapper = mount(LessonPage, {
      global: { plugins: [router] },
    });
    await flushPromises();

    wrapper.vm.currentAnswer = 1;
    wrapper.vm.onPrimaryAction();
    await flushPromises();
    wrapper.vm.onPrimaryAction();
    await flushPromises();

    expect(wrapper.find(".reinforcement-banner").exists()).toBe(true);

    wrapper.vm.currentAnswer = 0;
    wrapper.vm.onPrimaryAction();
    await flushPromises();
    wrapper.vm.onPrimaryAction();
    await flushPromises();

    expect(wrapper.find(".perfect-lesson-banner").exists()).toBe(false);
    expect(wrapper.find(".summary-emoji").text()).toBe("🎉");
    expect(mockInvoke).toHaveBeenCalledWith(
      "complete_section_cmd",
      expect.objectContaining({ isPerfect: false }),
    );
  });
});

describe("LessonPage lesson continue", () => {
  let mockInvoke;

  beforeEach(() => {
    localStorage.clear();
    setActivePinia(createPinia());
    setLocale("zh", { persist: false });
    mockInvoke = vi.fn().mockImplementation((cmd) => {
      if (cmd === "get_current_user") {
        return Promise.resolve({ id: "u1", native_language: "zh" });
      }
      if (cmd === "get_target_language_cmd") return Promise.resolve("es");
      if (cmd === "get_learning_goals_cmd") {
        return Promise.resolve([{ target_language: "es", cefr_level: "A1" }]);
      }
      if (cmd === "get_section_lesson_cmd") return Promise.resolve(lessonPayload());
      if (cmd === "complete_section_cmd") {
        return Promise.resolve({
          passed: true,
          stars: 3,
          next_section_id: "zh-es/U01-VOCAB",
        });
      }
      return Promise.resolve(null);
    });
    api.__setInvoke(mockInvoke);
  });

  it("wires lesson continue helpers on the summary screen", () => {
    const page = readFileSync(resolve(ROOT, "src/modules/path/LessonPage.vue"), "utf8");
    const plan = readFileSync(resolve(ROOT, "src/modules/path/postLessonPlan.js"), "utf8");
    expect(page).toMatch(/lessonContinue\.js/);
    expect(page).toMatch(/shouldContinueToNextLesson/);
    expect(plan).toMatch(/continueRouteAfterLesson/);
    expect(plan).toMatch(/continueNextLesson/);
  });

  it("routes directly to the next section when the lesson passes", async () => {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: "/learn/path", name: "path", component: { template: "<div/>" } },
        {
          path: "/learn/path/teaching/:nodeId",
          name: "path-teaching",
          component: { template: "<div/>" },
        },
        {
          path: "/learn/path/lesson/:sectionId",
          name: "path-lesson",
          component: LessonPage,
        },
      ],
    });
    await router.push({ name: "path-lesson", params: { sectionId: SECTION_ID } });
    await router.isReady();

    const wrapper = mount(LessonPage, {
      global: { plugins: [router] },
    });
    await flushPromises();

    wrapper.vm.currentAnswer = 0;
    wrapper.vm.onPrimaryAction();
    await flushPromises();
    wrapper.vm.onPrimaryAction();
    await flushPromises();

    const primary = wrapper.find(".summary-actions .action-btn.primary");
    expect(primary.text()).toContain("下一课");

    await primary.trigger("click");
    await flushPromises();

    expect(router.currentRoute.value.name).toBe("path-teaching");
    expect(router.currentRoute.value.params.nodeId).toBe("zh-es/U01-VOCAB");
  });
});

describe("LessonPage answer combo", () => {
  let mockInvoke;

  beforeEach(() => {
    setActivePinia(createPinia());
    setLocale("zh", { persist: false });
    mockInvoke = vi.fn().mockImplementation((cmd) => {
      if (cmd === "get_current_user") {
        return Promise.resolve({ id: "u1", native_language: "zh" });
      }
      if (cmd === "get_target_language_cmd") return Promise.resolve("es");
      if (cmd === "get_learning_goals_cmd") {
        return Promise.resolve([{ target_language: "es", cefr_level: "A1" }]);
      }
      if (cmd === "get_section_lesson_cmd") return Promise.resolve(lessonPayload(4));
      if (cmd === "complete_section_cmd") {
        return Promise.resolve({ passed: true, stars: 2 });
      }
      return Promise.resolve(null);
    });
    api.__setInvoke(mockInvoke);
  });

  it("wires combo helpers and lesson UI markup", () => {
    const source = readFileSync(resolve(ROOT, "src/modules/path/LessonPage.vue"), "utf8");
    expect(source).toMatch(/lessonCombo\.js/);
    expect(source).toMatch(/lessonComboStats\.js/);
    expect(source).toMatch(/class="combo-badge"/);
    expect(source).toMatch(/class="combo-toast"/);
    expect(source).toMatch(/class="combo-personal-best"/);
    expect(source).toMatch(/path\.comboActive/);
    expect(source).toMatch(/updateCombo/);
  });

  it("shows combo badge and milestone toast after consecutive correct answers", async () => {
    const router = makeRouter();
    await router.push({ name: "path-lesson", params: { sectionId: SECTION_ID } });
    await router.isReady();

    const wrapper = mount(LessonPage, {
      global: { plugins: [router] },
    });
    await flushPromises();

    const answerCorrect = async () => {
      wrapper.vm.currentAnswer = 0;
      wrapper.vm.onPrimaryAction();
      await flushPromises();
      wrapper.vm.onPrimaryAction();
      await flushPromises();
    };

    await answerCorrect();
    expect(wrapper.find(".combo-badge").exists()).toBe(false);

    await answerCorrect();
    const badge = wrapper.find(".combo-badge");
    expect(badge.exists()).toBe(true);
    expect(badge.text()).toContain("2 连击");

    wrapper.vm.currentAnswer = 0;
    wrapper.vm.onPrimaryAction();
    await flushPromises();

    const toast = wrapper.find(".combo-toast");
    expect(toast.exists()).toBe(true);
    expect(toast.text()).toContain("三连击");
    expect(wrapper.find(".combo-badge").text()).toContain("3 连击");
  });

  it("resets combo after a wrong answer", async () => {
    const router = makeRouter();
    await router.push({ name: "path-lesson", params: { sectionId: SECTION_ID } });
    await router.isReady();

    const wrapper = mount(LessonPage, {
      global: { plugins: [router] },
    });
    await flushPromises();

    wrapper.vm.currentAnswer = 0;
    wrapper.vm.onPrimaryAction();
    await flushPromises();
    wrapper.vm.onPrimaryAction();
    await flushPromises();

    wrapper.vm.currentAnswer = 0;
    wrapper.vm.onPrimaryAction();
    await flushPromises();
    wrapper.vm.onPrimaryAction();
    await flushPromises();

    expect(wrapper.find(".combo-badge").text()).toContain("2 连击");

    wrapper.vm.currentAnswer = 1;
    wrapper.vm.onPrimaryAction();
    await flushPromises();

    expect(wrapper.find(".combo-badge").exists()).toBe(false);
  });

  it("celebrates a new personal-best combo streak", async () => {
    localStorage.setItem(
      "lesson_combo_stats_v1",
      JSON.stringify({ "zh-es": { best: 2 } }),
    );
    const router = makeRouter();
    await router.push({ name: "path-lesson", params: { sectionId: SECTION_ID } });
    await router.isReady();

    const wrapper = mount(LessonPage, {
      global: { plugins: [router] },
    });
    await flushPromises();

    const answerCorrect = async () => {
      wrapper.vm.currentAnswer = 0;
      wrapper.vm.onPrimaryAction();
      await flushPromises();
      wrapper.vm.onPrimaryAction();
      await flushPromises();
    };

    await answerCorrect();
    await answerCorrect();
    expect(wrapper.find(".combo-personal-best").exists()).toBe(false);

    wrapper.vm.currentAnswer = 0;
    wrapper.vm.onPrimaryAction();
    await flushPromises();

    const personalBest = wrapper.find(".combo-personal-best");
    expect(personalBest.exists()).toBe(true);
    expect(personalBest.text()).toContain("新纪录");
    expect(personalBest.text()).toContain("3 连击");
  });
});

describe("LessonPage failed lesson recovery", () => {
  let mockInvoke;

  beforeEach(() => {
    setActivePinia(createPinia());
    setLocale("zh", { persist: false });
    mockInvoke = vi.fn().mockImplementation((cmd) => {
      if (cmd === "get_current_user") {
        return Promise.resolve({ id: "u1", native_language: "zh" });
      }
      if (cmd === "get_target_language_cmd") return Promise.resolve("es");
      if (cmd === "get_learning_goals_cmd") {
        return Promise.resolve([{ target_language: "es", cefr_level: "A1" }]);
      }
      if (cmd === "get_section_lesson_cmd") return Promise.resolve(lessonPayload(1));
      if (cmd === "complete_section_cmd") {
        return Promise.resolve({ passed: false, stars: 0 });
      }
      return Promise.resolve(null);
    });
    api.__setInvoke(mockInvoke);
  });

  it("wires failed lesson recovery helpers in the summary screen", () => {
    const page = readFileSync(resolve(ROOT, "src/modules/path/LessonPage.vue"), "utf8");
    const plan = readFileSync(resolve(ROOT, "src/modules/path/failedLessonPlan.js"), "utf8");
    expect(page).toMatch(/failedLessonPlan\.js/);
    expect(page).toMatch(/buildFailedLessonPlan/);
    expect(page).toMatch(/path\.recoveryStep\.title/);
    expect(plan).toMatch(/path\.recoveryStep\.retry/);
    expect(plan).toMatch(/path\.recoveryStep\.freshMistake/);
  });

  it("shows recovery panel and swaps CTA priority when the lesson fails", async () => {
    const router = makeRouter();
    await router.push({ name: "path-lesson", params: { sectionId: SECTION_ID } });
    await router.isReady();

    const wrapper = mount(LessonPage, {
      global: { plugins: [router] },
    });
    await flushPromises();

    wrapper.vm.currentAnswer = 1;
    wrapper.vm.onPrimaryAction();
    await flushPromises();
    wrapper.vm.onPrimaryAction();
    await flushPromises();

    wrapper.vm.currentAnswer = 1;
    wrapper.vm.onPrimaryAction();
    await flushPromises();
    wrapper.vm.onPrimaryAction();
    await flushPromises();

    const panels = wrapper.findAll(".next-steps-panel");
    expect(panels.length).toBe(1);
    expect(panels[0].text()).toContain("恢复学习");
    expect(panels[0].text()).toContain("再练一次");
    expect(panels[0].text()).toContain("巩固本节");

    const primary = wrapper.find(".summary-actions .action-btn.primary");
    const secondary = wrapper.find(".summary-actions .action-btn.secondary");
    expect(primary.text()).toContain("再练一次");
    expect(secondary.text()).toContain("返回路径");

    await wrapper.find(".summary-actions .action-btn.primary").trigger("click");
    await flushPromises();

    expect(wrapper.find(".summary").exists()).toBe(false);
    expect(wrapper.vm.finished).toBe(false);
  });
});