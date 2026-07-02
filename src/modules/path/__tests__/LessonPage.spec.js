import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createMemoryHistory, createRouter } from "vue-router";
import { flushPromises, mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import * as api from "@/shared/api.js";
import { setLocale } from "@/shared/i18n";

const ROOT = resolve(__dirname, "../../../..");
const SECTION_ID = "zh-es/U01-PRACTICE";

const LessonPage = (await import("@/modules/path/LessonPage.vue")).default;

function makeRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: "/learn/path", name: "path", component: { template: "<div/>" } },
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
    expect(hintBtn.attributes("disabled")).toBeDefined();
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