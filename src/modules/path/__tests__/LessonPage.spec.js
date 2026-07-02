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
});

describe("LessonPage answer feedback", () => {
  it("plays sound and haptic feedback when an answer is checked", () => {
    const source = readFileSync(resolve(ROOT, "src/modules/path/LessonPage.vue"), "utf8");
    expect(source).toMatch(/playAnswerFeedback/);
    expect(source).toMatch(/playAnswerFeedback\(lastCorrect\.value\)/);
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