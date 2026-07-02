import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import * as api from "@/shared/api.js";
import { STATS_STORAGE_KEY } from "@/modules/learn/questionTypeStats.js";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

vi.mock("@tauri-apps/plugin-shell", () => ({
  open: vi.fn(),
}));

const ProfilePage = (await import("@/modules/profile/ProfilePage.vue")).default;

function makeStubRouter() {
  return {
    push: vi.fn(),
    replace: vi.fn(),
    currentRoute: { value: { fullPath: "/profile" } },
  };
}

function makeStubRoute() {
  return { params: {}, query: {}, path: "/profile", name: "profile" };
}

describe("ProfilePage", () => {
  let mockInvoke;

  beforeEach(() => {
    setActivePinia(createPinia());
    localStorage.clear();
    mockInvoke = vi.fn();
    api.__setInvoke(mockInvoke);
  });

  function mountPage() {
    return mount(ProfilePage, {
      global: {
        mocks: { $router: makeStubRouter(), $route: makeStubRoute() },
        stubs: { SettingsItem: true, Teleport: true },
      },
    });
  }

  it("renders all stat labels", () => {
    mockInvoke.mockRejectedValue(new Error("not wired in test"));
    const wrapper = mountPage();
    expect(wrapper.text()).toContain("连续学习");
    expect(wrapper.text()).toContain("已掌握词汇");
    expect(wrapper.text()).toContain("已读文章");
  });

  it("shows 0 for read articles when API fails", async () => {
    mockInvoke.mockRejectedValue(new Error("boom"));
    const wrapper = mountPage();
    await flushPromises();
    const cells = wrapper.findAll(".stat-cell");
    const readCell = cells.find((c) => c.text().includes("已读文章"));
    expect(readCell.find(".stat-value").text()).toBe("0");
  });

  it("shows the learning streak returned by the API", async () => {
    mockInvoke.mockImplementation((cmd) => {
      if (cmd === "get_current_user") return Promise.resolve({ id: "u1", native_language: "zh" });
      if (cmd === "get_learning_goals_cmd") return Promise.resolve([]);
      if (cmd === "get_user_vocab_stats_cmd") return Promise.resolve({ total_known: 0, total_learning: 0, total: 0 });
      if (cmd === "get_read_article_count_cmd") return Promise.resolve(0);
      if (cmd === "get_learning_streak_cmd") return Promise.resolve({ current: 5, longest: 7, practiced_today: true });
      return Promise.resolve(null);
    });
    const wrapper = mountPage();
    await flushPromises();
    const cells = wrapper.findAll(".stat-cell");
    const streakCell = cells.find((c) => c.text().includes("连续学习"));
    expect(streakCell.find(".stat-value").text()).toBe("5");
  });

  it("shows the read article count returned by the API", async () => {
    mockInvoke.mockImplementation((cmd) => {
      if (cmd === "get_current_user") return Promise.resolve({ id: "u1", native_language: "zh" });
      if (cmd === "get_learning_goals_cmd") return Promise.resolve([]);
      if (cmd === "get_user_vocab_stats_cmd") return Promise.resolve({ total_known: 0, total_learning: 0, total: 0 });
      if (cmd === "get_read_article_count_cmd") return Promise.resolve(7);
      if (cmd === "get_learning_streak_cmd") return Promise.resolve({ current: 0, longest: 0, practiced_today: false });
      return Promise.resolve(null);
    });
    const wrapper = mountPage();
    await flushPromises();
    const cells = wrapper.findAll(".stat-cell");
    const readCell = cells.find((c) => c.text().includes("已读文章"));
    expect(readCell.find(".stat-value").text()).toBe("7");
  });

  it("shows practice accuracy when enough lesson answers are tracked", async () => {
    localStorage.setItem(
      STATS_STORAGE_KEY,
      JSON.stringify({
        "zh-es": {
          T01: { correct: 8, wrong: 2 },
          T09: { correct: 4, wrong: 1 },
        },
      }),
    );
    mockInvoke.mockImplementation((cmd) => {
      if (cmd === "get_current_user") return Promise.resolve({ id: "u1", native_language: "zh" });
      if (cmd === "get_learning_goals_cmd") return Promise.resolve([
        { id: 1, target_language: "es", cefr_level: "A1" },
      ]);
      if (cmd === "get_target_language_cmd") return Promise.resolve("es");
      if (cmd === "get_user_vocab_stats_cmd") return Promise.resolve({ total_known: 0, total_learning: 0, total: 0 });
      if (cmd === "get_read_article_count_cmd") return Promise.resolve(0);
      if (cmd === "get_learning_streak_cmd") return Promise.resolve({ current: 0, longest: 0, practiced_today: false });
      return Promise.resolve(null);
    });
    const wrapper = mountPage();
    await flushPromises();
    expect(wrapper.find(".stats-row.has-accuracy").exists()).toBe(true);
    const accuracyCell = wrapper.findAll(".stat-cell").find((c) => c.text().includes("答题正确率"));
    expect(accuracyCell.find(".stat-value").text()).toBe("80%");
  });

  it("shows weak areas when multiple question types are below the accuracy threshold", async () => {
    localStorage.setItem(
      STATS_STORAGE_KEY,
      JSON.stringify({
        "zh-es": {
          T01: { correct: 8, wrong: 2 },
          T05: { correct: 3, wrong: 7 },
          T09: { correct: 2, wrong: 8 },
        },
      }),
    );
    mockInvoke.mockImplementation((cmd) => {
      if (cmd === "get_current_user") return Promise.resolve({ id: "u1", native_language: "zh" });
      if (cmd === "get_learning_goals_cmd") return Promise.resolve([
        { id: 1, target_language: "es", cefr_level: "A1" },
      ]);
      if (cmd === "get_target_language_cmd") return Promise.resolve("es");
      if (cmd === "get_user_vocab_stats_cmd") return Promise.resolve({ total_known: 0, total_learning: 0, total: 0 });
      if (cmd === "get_read_article_count_cmd") return Promise.resolve(0);
      if (cmd === "get_learning_streak_cmd") return Promise.resolve({ current: 0, longest: 0, practiced_today: false });
      return Promise.resolve(null);
    });
    const wrapper = mountPage();
    await flushPromises();
    expect(wrapper.text()).toContain("待加强题型");
    const items = wrapper.findAll(".weak-area-item");
    expect(items).toHaveLength(2);
    expect(items[0].text()).toContain("拼写输入");
    expect(items[0].text()).toContain("20%");
    expect(items[1].text()).toContain("补全句子");
    expect(items[1].text()).toContain("30%");
  });

  it("hides weak areas when no question type qualifies", async () => {
    localStorage.setItem(
      STATS_STORAGE_KEY,
      JSON.stringify({
        "zh-es": {
          T01: { correct: 9, wrong: 1 },
        },
      }),
    );
    mockInvoke.mockImplementation((cmd) => {
      if (cmd === "get_current_user") return Promise.resolve({ id: "u1", native_language: "zh" });
      if (cmd === "get_learning_goals_cmd") return Promise.resolve([
        { id: 1, target_language: "es", cefr_level: "A1" },
      ]);
      if (cmd === "get_target_language_cmd") return Promise.resolve("es");
      if (cmd === "get_user_vocab_stats_cmd") return Promise.resolve({ total_known: 0, total_learning: 0, total: 0 });
      if (cmd === "get_read_article_count_cmd") return Promise.resolve(0);
      if (cmd === "get_learning_streak_cmd") return Promise.resolve({ current: 0, longest: 0, practiced_today: false });
      return Promise.resolve(null);
    });
    const wrapper = mountPage();
    await flushPromises();
    expect(wrapper.text()).not.toContain("待加强题型");
  });

  it("hides practice accuracy until enough lesson answers are tracked", async () => {
    localStorage.setItem(
      STATS_STORAGE_KEY,
      JSON.stringify({
        "zh-es": {
          T01: { correct: 2, wrong: 1 },
        },
      }),
    );
    mockInvoke.mockImplementation((cmd) => {
      if (cmd === "get_current_user") return Promise.resolve({ id: "u1", native_language: "zh" });
      if (cmd === "get_learning_goals_cmd") return Promise.resolve([
        { id: 1, target_language: "es", cefr_level: "A1" },
      ]);
      if (cmd === "get_target_language_cmd") return Promise.resolve("es");
      if (cmd === "get_user_vocab_stats_cmd") return Promise.resolve({ total_known: 0, total_learning: 0, total: 0 });
      if (cmd === "get_read_article_count_cmd") return Promise.resolve(0);
      if (cmd === "get_learning_streak_cmd") return Promise.resolve({ current: 0, longest: 0, practiced_today: false });
      return Promise.resolve(null);
    });
    const wrapper = mountPage();
    await flushPromises();
    expect(wrapper.find(".stats-row.has-accuracy").exists()).toBe(false);
    expect(wrapper.text()).not.toContain("答题正确率");
  });

  it("shows the mastered vocab count returned by the API", async () => {
    mockInvoke.mockImplementation((cmd) => {
      if (cmd === "get_current_user") return Promise.resolve({ id: "u1", native_language: "zh" });
      if (cmd === "get_learning_goals_cmd") return Promise.resolve([]);
      if (cmd === "get_user_vocab_stats_cmd") return Promise.resolve({ total_known: 42, total_learning: 5, total: 1000 });
      if (cmd === "get_read_article_count_cmd") return Promise.resolve(3);
      return Promise.resolve(null);
    });
    const wrapper = mountPage();
    await flushPromises();
    const cells = wrapper.findAll(".stat-cell");
    const vocabCell = cells.find((c) => c.text().includes("已掌握词汇"));
    expect(vocabCell.find(".stat-value").text()).toBe("42");
  });

  it("renders the learning language switcher with three pills", async () => {
    mockInvoke.mockImplementation((cmd) => {
      if (cmd === "get_current_user") return Promise.resolve({ id: "u1", native_language: "zh" });
      if (cmd === "get_learning_goals_cmd") return Promise.resolve([
        { id: 1, target_language: "es", cefr_level: "A1" },
      ]);
      if (cmd === "get_target_language_cmd") return Promise.resolve("es");
      if (cmd === "get_user_vocab_stats_cmd") return Promise.resolve({ total_known: 0, total_learning: 0, total: 0 });
      if (cmd === "get_read_article_count_cmd") return Promise.resolve(0);
      return Promise.resolve(null);
    });
    const wrapper = mountPage();
    await flushPromises();
    const pills = wrapper.findAll(".lang-pill").filter((p) => !p.classes().includes("level-pill"));
    expect(pills.length).toBe(3);
    // The Spanish pill should be marked active (the wizard default).
    const active = pills.find((p) => p.classes().includes("active"));
    expect(active).toBeTruthy();
    expect(active.text()).toContain("西班牙语");
  });

  it("renders level pills and updates cefr via update_learning_goal_cefr_cmd", async () => {
    let updatedLevel = "";
    mockInvoke.mockImplementation((cmd, args) => {
      if (cmd === "get_current_user") return Promise.resolve({ id: "u1", native_language: "zh" });
      if (cmd === "get_learning_goals_cmd") return Promise.resolve([
        { id: 1, target_language: "es", cefr_level: "A1" },
      ]);
      if (cmd === "get_target_language_cmd") return Promise.resolve("es");
      if (cmd === "get_user_vocab_stats_cmd") return Promise.resolve({ total_known: 0, total_learning: 0, total: 0 });
      if (cmd === "get_read_article_count_cmd") return Promise.resolve(0);
      if (cmd === "update_learning_goal_cefr_cmd") {
        updatedLevel = args?.cefrLevel;
        return Promise.resolve(null);
      }
      return Promise.resolve(null);
    });
    const wrapper = mountPage();
    await flushPromises();
    const levelPills = wrapper.findAll(".level-pill");
    expect(levelPills.length).toBe(2);
    const a2 = levelPills.find((p) => p.text().includes("A2"));
    await a2.trigger("click");
    await flushPromises();
    expect(updatedLevel).toBe("A2");
  });

  it("clicking another language calls set_target_language_cmd and updates the active pill", async () => {
    let switched = "";
    mockInvoke.mockImplementation((cmd, args) => {
      if (cmd === "get_current_user") return Promise.resolve({ id: "u1", native_language: "zh" });
      if (cmd === "get_learning_goals_cmd") return Promise.resolve([
        { id: 1, target_language: "es", cefr_level: "A1" },
        { id: 2, target_language: "en", cefr_level: "A1" },
      ]);
      if (cmd === "get_target_language_cmd") return Promise.resolve("es");
      if (cmd === "get_user_vocab_stats_cmd") return Promise.resolve({ total_known: 0, total_learning: 0, total: 0 });
      if (cmd === "get_read_article_count_cmd") return Promise.resolve(0);
      if (cmd === "set_target_language_cmd") { switched = args?.language; return Promise.resolve("en"); }
      return Promise.resolve(null);
    });
    const wrapper = mountPage();
    await flushPromises();
    const pills = wrapper.findAll(".lang-pill").filter((p) => !p.classes().includes("level-pill"));
    // Find the English pill (2nd one).
    const enPill = pills.find((p) => p.text().includes("英语"));
    expect(enPill).toBeTruthy();
    await enPill.trigger("click");
    await flushPromises();
    expect(switched).toBe("en");
  });

  it("renders share progress button", async () => {
    mockInvoke.mockImplementation((cmd) => {
      if (cmd === "get_current_user") return Promise.resolve({ id: "u1", native_language: "zh" });
      if (cmd === "get_learning_goals_cmd") return Promise.resolve([]);
      if (cmd === "get_user_vocab_stats_cmd") return Promise.resolve({ total_known: 0, total_learning: 0, total: 0 });
      if (cmd === "get_read_article_count_cmd") return Promise.resolve(0);
      if (cmd === "get_learning_streak_cmd") return Promise.resolve({ current: 0, longest: 0, practiced_today: false });
      return Promise.resolve(null);
    });
    const wrapper = mountPage();
    await flushPromises();
    expect(wrapper.find(".share-progress-btn").exists()).toBe(true);
    expect(wrapper.text()).toContain("分享学习进度");
  });

  it("active language pill stays readable (white text) on hover", () => {
    // Regression for the green-on-green bug: the generic `.lang-pill:hover`
    // rule was more specific than `.lang-pill.active` and clobbered `color`,
    // making the text invisible against the green background.
    // We assert the SFC source contains an `.active:hover` override that
    // pins the text to white — guardrail against accidental CSS changes.
    const sfcPath = resolve(dirname(fileURLToPath(import.meta.url)), "..", "ProfilePage.vue");
    const css = readFileSync(sfcPath, "utf8");
    expect(css).toMatch(/\.lang-pill\.active:hover[^{]*\{[\s\S]*?color:\s*#fff/);
  });
});
