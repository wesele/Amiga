import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createMemoryHistory, createRouter } from "vue-router";
import { flushPromises, mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import * as api from "@/shared/api.js";
import { setLocale } from "@/shared/i18n";

const ROOT = resolve(__dirname, "../../../..");
function readVue(rel) {
  return readFileSync(resolve(ROOT, rel), "utf8");
}

vi.mock("@tauri-apps/plugin-shell", () => ({}));

const LearnHubPage = (await import("@/modules/learn/LearnHubPage.vue")).default;

function makeRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: "/learn", name: "learn", component: LearnHubPage },
      { path: "/learn/path", name: "path", component: { template: "<div/>" } },
      { path: "/news", name: "news", component: { template: "<div/>" } },
      {
        path: "/learn/translator/:sessionId",
        name: "learn-translator",
        component: { template: "<div/>" },
      },
    ],
  });
}

describe("LearnHubPage", () => {
  let mockInvoke;

  beforeEach(() => {
    setActivePinia(createPinia());
    setLocale("zh", { persist: false });
    mockInvoke = vi.fn().mockImplementation((cmd) => {
      if (cmd === "get_target_language_cmd") return Promise.resolve("es");
      if (cmd === "get_chat_sessions_cmd") return Promise.resolve([]);
      if (cmd === "get_current_user") return Promise.resolve({ id: "u1" });
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
      if (cmd === "create_chat_session_cmd") return Promise.resolve("translator-sess");
      return Promise.resolve(null);
    });
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

  it("renders three module tiles in a grid", async () => {
    const router = makeRouter();
    const wrapper = mount(LearnHubPage, {
      global: { plugins: [router] },
    });
    await flushPromises();

    const tiles = wrapper.findAll(".module-tile");
    expect(tiles.length).toBe(3);
    const labels = tiles.map((t) => t.find(".module-label").text());
    expect(labels).toContain("晋级之路");
    expect(labels).toContain("新闻");
    expect(labels).toContain("AI 翻译");
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

  it("shows streak-at-risk banner when user has streak but has not practiced today", async () => {
    mockInvoke.mockImplementation((cmd) => {
      if (cmd === "get_target_language_cmd") return Promise.resolve("es");
      if (cmd === "get_current_user") return Promise.resolve({ id: "u1" });
      if (cmd === "get_daily_goal_progress_cmd") {
        return Promise.resolve({
          lessons_today: 0,
          target_lessons: 2,
          progress_pct: 0,
          goal_met: false,
          streak_current: 5,
          practiced_today: false,
        });
      }
      return Promise.resolve(null);
    });

    const router = makeRouter();
    const wrapper = mount(LearnHubPage, {
      global: { plugins: [router] },
    });
    await flushPromises();

    const banner = wrapper.find(".streak-risk-banner");
    expect(banner.exists()).toBe(true);
    expect(banner.text()).toContain("5 天连胜今晚就要断了");
    expect(banner.text()).toContain("马上学习");
    expect(wrapper.find(".daily-goal-card").exists()).toBe(true);
  });

  it("hides streak-at-risk banner after user has practiced today", async () => {
    const router = makeRouter();
    const wrapper = mount(LearnHubPage, {
      global: { plugins: [router] },
    });
    await flushPromises();

    expect(wrapper.find(".streak-risk-banner").exists()).toBe(false);
  });

  it("navigates to path when streak-at-risk banner is clicked", async () => {
    mockInvoke.mockImplementation((cmd) => {
      if (cmd === "get_target_language_cmd") return Promise.resolve("es");
      if (cmd === "get_current_user") return Promise.resolve({ id: "u1" });
      if (cmd === "get_daily_goal_progress_cmd") {
        return Promise.resolve({
          lessons_today: 0,
          target_lessons: 2,
          progress_pct: 0,
          goal_met: false,
          streak_current: 4,
          practiced_today: false,
        });
      }
      return Promise.resolve(null);
    });

    const router = makeRouter();
    const pushSpy = vi.spyOn(router, "push");
    const wrapper = mount(LearnHubPage, {
      global: { plugins: [router] },
    });
    await flushPromises();

    await wrapper.find(".streak-risk-banner").trigger("click");
    expect(pushSpy).toHaveBeenCalledWith({ name: "path" });
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

  it("navigates to path when daily goal card is clicked", async () => {
    const router = makeRouter();
    const pushSpy = vi.spyOn(router, "push");
    const wrapper = mount(LearnHubPage, {
      global: { plugins: [router] },
    });
    await flushPromises();

    await wrapper.find(".daily-goal-card").trigger("click");
    expect(pushSpy).toHaveBeenCalledWith({ name: "path" });
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