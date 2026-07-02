import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createMemoryHistory, createRouter } from "vue-router";
import { flushPromises, mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import * as api from "@/shared/api.js";
import { setLocale } from "@/shared/i18n";
import { STATS_STORAGE_KEY } from "../questionTypeStats.js";
import { ACCURACY_PEAK_KEY } from "@/modules/profile/accuracyPeakStats.js";
import { COMBO_STATS_KEY } from "@/modules/path/lessonComboStats.js";
import { recordLessonMistake } from "@/modules/path/mistakeReviewStore.js";
import { recordMistakesMastered } from "@/modules/path/mistakeMasteryStats.js";

const ROOT = resolve(__dirname, "../../../..");
function readVue(rel) {
  return readFileSync(resolve(ROOT, rel), "utf8");
}

vi.mock("@tauri-apps/plugin-shell", () => ({}));

const LearnHubPage = (await import("@/modules/learn/LearnHubPage.vue")).default;

const MOCK_CURRICULUM = {
  status: "active",
  units: [
    {
      id: "U01",
      title_native: "问候与介绍",
      sections: [
        {
          id: "zh-es/U01-GRAMMAR",
          kind: "grammar",
          title_native: "单元知识",
          current: false,
          locked: false,
        },
        {
          id: "zh-es/U01-PRACTICE",
          kind: "practice",
          title_native: "闯关练习",
          current: true,
          locked: false,
          question_count: 6,
        },
      ],
    },
  ],
};

function defaultInvoke(cmd) {
  if (cmd === "get_target_language_cmd") return Promise.resolve("es");
  if (cmd === "get_chat_sessions_cmd") return Promise.resolve([]);
  if (cmd === "get_current_user") {
    return Promise.resolve({ id: "u1", native_language: "zh" });
  }
  if (cmd === "get_learning_goals_cmd") {
    return Promise.resolve([{ target_language: "es", cefr_level: "A1" }]);
  }
  if (cmd === "get_path_curriculum_cmd") return Promise.resolve(MOCK_CURRICULUM);
  if (cmd === "get_daily_goal_progress_cmd") {
    return Promise.resolve({
      lessons_today: 1,
      target_lessons: 2,
      progress_pct: 50,
      goal_met: false,
      streak_current: 3,
      practiced_today: true,
    });
  }
  if (cmd === "get_weekly_activity_cmd") {
    return Promise.resolve({
      active_days: 3,
      days: [
        { date: "2026-06-26", weekday: 4, active: false, is_today: false },
        { date: "2026-06-27", weekday: 5, active: true, is_today: false },
        { date: "2026-06-28", weekday: 6, active: false, is_today: false },
        { date: "2026-06-29", weekday: 0, active: true, is_today: false },
        { date: "2026-06-30", weekday: 1, active: false, is_today: false },
        { date: "2026-07-01", weekday: 2, active: false, is_today: false },
        { date: "2026-07-02", weekday: 3, active: true, is_today: true },
      ],
    });
  }
  if (cmd === "create_chat_session_cmd") return Promise.resolve("translator-sess");
  if (cmd === "get_unknown_words_cmd") {
    return Promise.resolve([
      { id: 1, word: "hola" },
      { id: 2, word: "gracias" },
      { id: 3, word: "casa" },
      { id: 4, word: "perro" },
    ]);
  }
  if (cmd === "get_lesson_milestone_progress_cmd") {
    return Promise.resolve({
      completed: 7,
      next_milestone: 10,
      progress_pct: 70,
    });
  }
  if (cmd === "get_learning_streak_cmd") {
    return Promise.resolve({ current: 5, longest: 5, practiced_today: true });
  }
  if (cmd === "get_perfect_lesson_streak_cmd") {
    return Promise.resolve({ current: 0, best: 0 });
  }
  if (cmd === "get_user_vocab_stats_cmd") {
    return Promise.resolve({ total_known: 72, total_learning: 8, total: 1000 });
  }
  return Promise.resolve(null);
}

function makeRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: "/learn", name: "learn", component: LearnHubPage },
      { path: "/learn/path", name: "path", component: { template: "<div/>" } },
      {
        path: "/learn/path/teach/:nodeId",
        name: "path-teaching",
        component: { template: "<div/>" },
      },
      {
        path: "/learn/path/practice/:typeId",
        name: "path-focus-practice",
        component: { template: "<div/>" },
      },
      {
        path: "/learn/path/:sectionId",
        name: "path-lesson",
        component: { template: "<div/>" },
      },
      { path: "/news", name: "news", component: { template: "<div/>" } },
      {
        path: "/learn/translator/:sessionId",
        name: "learn-translator",
        component: { template: "<div/>" },
      },
      { path: "/vocab", name: "vocab", component: { template: "<div/>" } },
      { path: "/vocab/review", name: "vocab-review", component: { template: "<div/>" } },
      {
        path: "/learn/path/review/mistakes",
        name: "path-mistake-review",
        component: { template: "<div/>" },
      },
    ],
  });
}

describe("LearnHubPage", () => {
  let mockInvoke;

  beforeEach(() => {
    localStorage.clear();
    setActivePinia(createPinia());
    setLocale("zh", { persist: false });
    mockInvoke = vi.fn().mockImplementation(defaultInvoke);
    api.__setInvoke(mockInvoke);
  });

  it("uses a 2-column tile grid with two icons per row", () => {
    const source = readVue("src/modules/learn/LearnHubPage.vue");
    expect(source).toMatch(/grid-template-columns:\s*repeat\(2/);
    expect(source).toMatch(/aspect-ratio:\s*1/);
    expect(source).not.toMatch(/width:\s*130px/);
    expect(source).toMatch(/font-size:\s*12vw/);
    expect(source).toMatch(/gap:\s*6vw/);
    expect(source).toMatch(/padding:\s*10vw\s+8vw\s+14vw/);
    expect(source).toMatch(/font-size:\s*clamp\(14px,\s*5vw,\s*18px\)/);
  });

  it("renders four module tiles in a grid", async () => {
    const router = makeRouter();
    const wrapper = mount(LearnHubPage, {
      global: { plugins: [router] },
    });
    await flushPromises();

    const tiles = wrapper.findAll(".module-tile");
    expect(tiles.length).toBe(4);
    const labels = tiles.map((t) => t.find(".module-label").text());
    expect(labels).toContain("晋级之路");
    expect(labels).toContain("新闻");
    expect(labels).toContain("单词");
    expect(labels).toContain("AI 翻译");
  });

  it("navigates to vocab when the vocab tile is clicked", async () => {
    const router = makeRouter();
    const pushSpy = vi.spyOn(router, "push");
    const wrapper = mount(LearnHubPage, {
      global: { plugins: [router] },
    });
    await flushPromises();

    const vocabTile = wrapper.findAll(".module-tile")
      .find((t) => t.find(".module-label").text() === "单词");
    await vocabTile.trigger("click");

    expect(pushSpy).toHaveBeenCalledWith({ name: "vocab" });
  });

  it("navigates to news when the news tile is clicked", async () => {
    const router = makeRouter();
    const pushSpy = vi.spyOn(router, "push");
    const wrapper = mount(LearnHubPage, {
      global: { plugins: [router] },
    });
    await flushPromises();

    const newsTile = wrapper.findAll(".module-tile")
      .find((t) => t.find(".module-label").text() === "新闻");
    await newsTile.trigger("click");

    expect(pushSpy).toHaveBeenCalledWith({ name: "news" });
  });

  it("shows mistake review card when due mistakes exist for the language pair", async () => {
    recordLessonMistake(
      "zh-es",
      { id: "q1", type: "T09", hint: "Hola", answer: "hola" },
      "ola",
      Date.now(),
    );

    const router = makeRouter();
    const wrapper = mount(LearnHubPage, {
      global: { plugins: [router] },
    });
    await flushPromises();

    const card = wrapper.find(".mistake-review-card");
    expect(card.exists()).toBe(true);
    expect(card.text()).toContain("错题复习");
    expect(card.text()).toContain("1 道错题待巩固");
    expect(card.text()).toContain("Hola");
  });

  it("navigates to mistake review when the card is clicked", async () => {
    recordLessonMistake("zh-es", { id: "q1", type: "T09", answer: "hola" }, "ola", Date.now());

    const router = makeRouter();
    const pushSpy = vi.spyOn(router, "push");
    const wrapper = mount(LearnHubPage, {
      global: { plugins: [router] },
    });
    await flushPromises();

    await wrapper.find(".mistake-review-card").trigger("click");
    expect(pushSpy).toHaveBeenCalledWith({ name: "path-mistake-review" });
  });

  it("hides mistake review card when no mistakes are due", async () => {
    const router = makeRouter();
    const wrapper = mount(LearnHubPage, {
      global: { plugins: [router] },
    });
    await flushPromises();

    expect(wrapper.find(".mistake-review-card").exists()).toBe(false);
  });

  it("shows daily goal progress card with streak", async () => {
    const router = makeRouter();
    const wrapper = mount(LearnHubPage, {
      global: { plugins: [router] },
    });
    await flushPromises();

    const card = wrapper.find(".daily-goal-card");
    expect(card.exists()).toBe(true);
    expect(card.text()).toContain("今日目标");
    expect(card.text()).toContain("1/2");
    expect(card.text()).toContain("3 天连胜");
  });

  it("shows weekly goal strip inside daily goal card", async () => {
    const router = makeRouter();
    const wrapper = mount(LearnHubPage, {
      global: { plugins: [router] },
    });
    await flushPromises();

    const strip = wrapper.find(".week-strip");
    expect(strip.exists()).toBe(true);
    expect(strip.text()).toContain("本周目标");
    expect(strip.text()).toContain("3/5");
    expect(strip.text()).toContain("还差 2 天达成本周目标");
    expect(wrapper.find(".week-goal-bar-fill").attributes("style")).toContain("width: 60%");
    expect(wrapper.findAll(".week-dot.is-active")).toHaveLength(3);
  });

  it("hides weekly goal strip when activity data is unavailable", async () => {
    mockInvoke.mockImplementation((cmd) => {
      if (cmd === "get_weekly_activity_cmd") return Promise.resolve(null);
      return defaultInvoke(cmd);
    });

    const router = makeRouter();
    const wrapper = mount(LearnHubPage, {
      global: { plugins: [router] },
    });
    await flushPromises();

    expect(wrapper.find(".week-strip").exists()).toBe(false);
  });

  it("navigates to path when daily goal card body is clicked", async () => {
    const router = makeRouter();
    const pushSpy = vi.spyOn(router, "push");
    const wrapper = mount(LearnHubPage, {
      global: { plugins: [router] },
    });
    await flushPromises();

    await wrapper.find(".daily-goal-main").trigger("click");
    expect(pushSpy).toHaveBeenCalledWith({ name: "path" });
  });

  it("shows continue-learning button on daily goal card when path is active", async () => {
    const router = makeRouter();
    const wrapper = mount(LearnHubPage, {
      global: { plugins: [router] },
    });
    await flushPromises();

    const btn = wrapper.find(".goal-continue-btn");
    expect(btn.exists()).toBe(true);
    expect(btn.text()).toContain("继续学习");
  });

  it("navigates to current lesson when continue-learning button is clicked", async () => {
    const router = makeRouter();
    const pushSpy = vi.spyOn(router, "push");
    const wrapper = mount(LearnHubPage, {
      global: { plugins: [router] },
    });
    await flushPromises();

    await wrapper.find(".goal-continue-btn").trigger("click");
    expect(pushSpy).toHaveBeenCalledWith({
      name: "path-lesson",
      params: { sectionId: "zh-es/U01-PRACTICE" },
    });
  });

  it("hides continue-learning button when path curriculum is not active", async () => {
    mockInvoke.mockImplementation((cmd) => {
      if (cmd === "get_path_curriculum_cmd") {
        return Promise.resolve({ ...MOCK_CURRICULUM, status: "level_complete" });
      }
      return defaultInvoke(cmd);
    });

    const router = makeRouter();
    const wrapper = mount(LearnHubPage, {
      global: { plugins: [router] },
    });
    await flushPromises();

    expect(wrapper.find(".goal-continue-btn").exists()).toBe(false);
  });

  it("shows perfect lesson streak card when learner has an active streak", async () => {
    mockInvoke.mockImplementation((cmd) => {
      if (cmd === "get_perfect_lesson_streak_cmd") {
        return Promise.resolve({ current: 4, best: 6 });
      }
      return defaultInvoke(cmd);
    });

    const router = makeRouter();
    const wrapper = mount(LearnHubPage, {
      global: { plugins: [router] },
    });
    await flushPromises();

    const card = wrapper.find(".perfect-streak-card");
    expect(card.exists()).toBe(true);
    expect(card.text()).toContain("连续 4 课完美通关");
    expect(card.text()).toContain("历史最佳 6 课");
  });

  it("shows accuracy milestone progress card when enough practice data exists", async () => {
    localStorage.setItem(
      STATS_STORAGE_KEY,
      JSON.stringify({
        "zh-es": { T01: { correct: 6, wrong: 4 } },
      }),
    );
    localStorage.setItem(
      ACCURACY_PEAK_KEY,
      JSON.stringify({ "zh-es": { best: 75 } }),
    );

    const router = makeRouter();
    const wrapper = mount(LearnHubPage, {
      global: { plugins: [router] },
    });
    await flushPromises();

    const card = wrapper.find(".accuracy-milestone-card");
    expect(card.exists()).toBe(true);
    expect(card.text()).toContain("准确率里程碑");
    expect(card.text()).toContain("下一目标：80%");
    expect(card.text()).toContain("75/80");
    expect(card.text()).toContain("当前最高 75%");
  });

  it("hides accuracy milestone card when all milestones are complete", async () => {
    localStorage.setItem(
      STATS_STORAGE_KEY,
      JSON.stringify({
        "zh-es": { T01: { correct: 9, wrong: 1 } },
      }),
    );
    localStorage.setItem(
      ACCURACY_PEAK_KEY,
      JSON.stringify({ "zh-es": { best: 95 } }),
    );

    const router = makeRouter();
    const wrapper = mount(LearnHubPage, {
      global: { plugins: [router] },
    });
    await flushPromises();

    expect(wrapper.find(".accuracy-milestone-card").exists()).toBe(false);
  });

  it("shows combo milestone progress card when a personal-best combo exists", async () => {
    localStorage.setItem(
      COMBO_STATS_KEY,
      JSON.stringify({ "zh-es": { best: 4, updated_at: 1 } }),
    );

    const router = makeRouter();
    const wrapper = mount(LearnHubPage, {
      global: { plugins: [router] },
    });
    await flushPromises();

    const card = wrapper.find(".combo-milestone-card");
    expect(card.exists()).toBe(true);
    expect(card.text()).toContain("连击里程碑");
    expect(card.text()).toContain("下一目标：5 连击");
    expect(card.text()).toContain("4/5");
    expect(card.text()).toContain("最高 4 连击");
  });

  it("hides combo milestone card when all milestones are complete", async () => {
    localStorage.setItem(
      COMBO_STATS_KEY,
      JSON.stringify({ "zh-es": { best: 10, updated_at: 1 } }),
    );

    const router = makeRouter();
    const wrapper = mount(LearnHubPage, {
      global: { plugins: [router] },
    });
    await flushPromises();

    expect(wrapper.find(".combo-milestone-card").exists()).toBe(false);
  });

  it("hides combo milestone card when no combo record exists", async () => {
    const router = makeRouter();
    const wrapper = mount(LearnHubPage, {
      global: { plugins: [router] },
    });
    await flushPromises();

    expect(wrapper.find(".combo-milestone-card").exists()).toBe(false);
  });

  it("shows perfect milestone progress card when a personal-best perfect streak exists", async () => {
    mockInvoke.mockImplementation((cmd) => {
      if (cmd === "get_perfect_lesson_streak_cmd") {
        return Promise.resolve({ current: 2, best: 2 });
      }
      return defaultInvoke(cmd);
    });

    const router = makeRouter();
    const wrapper = mount(LearnHubPage, {
      global: { plugins: [router] },
    });
    await flushPromises();

    const card = wrapper.find(".perfect-milestone-card");
    expect(card.exists()).toBe(true);
    expect(card.text()).toContain("完美通关里程碑");
    expect(card.text()).toContain("下一目标：3 课");
    expect(card.text()).toContain("2/3");
    expect(card.text()).toContain("历史最佳 2 课");
  });

  it("hides perfect milestone card when all milestones are complete", async () => {
    mockInvoke.mockImplementation((cmd) => {
      if (cmd === "get_perfect_lesson_streak_cmd") {
        return Promise.resolve({ current: 10, best: 10 });
      }
      return defaultInvoke(cmd);
    });

    const router = makeRouter();
    const wrapper = mount(LearnHubPage, {
      global: { plugins: [router] },
    });
    await flushPromises();

    expect(wrapper.find(".perfect-milestone-card").exists()).toBe(false);
  });

  it("hides perfect milestone card when no perfect streak record exists", async () => {
    const router = makeRouter();
    const wrapper = mount(LearnHubPage, {
      global: { plugins: [router] },
    });
    await flushPromises();

    expect(wrapper.find(".perfect-milestone-card").exists()).toBe(false);
  });

  it("navigates to path when perfect milestone card is clicked", async () => {
    mockInvoke.mockImplementation((cmd) => {
      if (cmd === "get_perfect_lesson_streak_cmd") {
        return Promise.resolve({ current: 2, best: 2 });
      }
      return defaultInvoke(cmd);
    });

    const router = makeRouter();
    const pushSpy = vi.spyOn(router, "push");
    const wrapper = mount(LearnHubPage, {
      global: { plugins: [router] },
    });
    await flushPromises();

    await wrapper.find(".perfect-milestone-card").trigger("click");
    expect(pushSpy).toHaveBeenCalledWith({ name: "path" });
  });

  it("hides accuracy milestone card when practice attempts are insufficient", async () => {
    localStorage.setItem(
      STATS_STORAGE_KEY,
      JSON.stringify({
        "zh-es": { T01: { correct: 3, wrong: 2 } },
      }),
    );
    localStorage.setItem(
      ACCURACY_PEAK_KEY,
      JSON.stringify({ "zh-es": { best: 60 } }),
    );

    const router = makeRouter();
    const wrapper = mount(LearnHubPage, {
      global: { plugins: [router] },
    });
    await flushPromises();

    expect(wrapper.find(".accuracy-milestone-card").exists()).toBe(false);
  });

  it("shows focus area card when a question type is consistently weak", async () => {
    localStorage.setItem(
      STATS_STORAGE_KEY,
      JSON.stringify({
        "zh-es": {
          T09: { correct: 1, wrong: 5 },
          T01: { correct: 8, wrong: 2 },
        },
      }),
    );

    const router = makeRouter();
    const wrapper = mount(LearnHubPage, {
      global: { plugins: [router] },
    });
    await flushPromises();

    const card = wrapper.find(".focus-area-card");
    expect(card.exists()).toBe(true);
    expect(card.text()).toContain("薄弱环节");
    expect(card.text()).toContain("拼写输入");
    expect(card.text()).toContain("正确率 17%");
    expect(card.text()).toContain("听发音时注意重音和拼写规则");
    expect(card.text()).toContain("去练习");
  });

  it("navigates to focus practice when focus area card is clicked", async () => {
    localStorage.setItem(
      STATS_STORAGE_KEY,
      JSON.stringify({ "zh-es": { T06: { correct: 1, wrong: 5 } } }),
    );

    const router = makeRouter();
    const pushSpy = vi.spyOn(router, "push");
    const wrapper = mount(LearnHubPage, {
      global: { plugins: [router] },
    });
    await flushPromises();

    await wrapper.find(".focus-area-card").trigger("click");
    expect(pushSpy).toHaveBeenCalledWith({
      name: "path-focus-practice",
      params: { typeId: "T06" },
    });
  });

  it("hides focus area card when no question type is weak enough", async () => {
    localStorage.setItem(
      STATS_STORAGE_KEY,
      JSON.stringify({ "zh-es": { T01: { correct: 9, wrong: 1 } } }),
    );

    const router = makeRouter();
    const wrapper = mount(LearnHubPage, {
      global: { plugins: [router] },
    });
    await flushPromises();

    expect(wrapper.find(".focus-area-card").exists()).toBe(false);
  });

  it("opens translator session via learn-translator route", async () => {
    const router = makeRouter();
    const pushSpy = vi.spyOn(router, "push");
    const wrapper = mount(LearnHubPage, {
      global: { plugins: [router] },
    });
    await flushPromises();

    const translatorTile = wrapper.findAll(".module-tile")
      .find((t) => t.find(".module-label").text() === "AI 翻译");
    await translatorTile.trigger("click");
    await flushPromises();

    expect(mockInvoke).toHaveBeenCalledWith(
      "create_chat_session_cmd",
      expect.objectContaining({ contactType: "translator" }),
    );
    expect(pushSpy).toHaveBeenCalledWith({
      name: "learn-translator",
      params: { sessionId: "translator-sess" },
    });
  });
});