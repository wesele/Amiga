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
      if (cmd === "get_learning_goals_cmd") return Promise.resolve([]);
      if (cmd === "get_path_curriculum_cmd") {
        return Promise.resolve({
          status: "active",
          completed_sections: 3,
          total_sections: 10,
          total_stars: 7,
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
    expect(source).toMatch(/grid-column:\s*1\s*\/\s*-1/);
    expect(source).toMatch(/aspect-ratio:\s*1/);
    expect(source).not.toMatch(/width:\s*130px/);
    expect(source).toMatch(/font-size:\s*12vw/);
    expect(source).toMatch(/--module-grid-row-gap:\s*8vw/);
    expect(source).toMatch(/--module-grid-col-gap:\s*6vw/);
    expect(source).toMatch(/gap:\s*var\(--module-grid-row-gap\)\s+var\(--module-grid-col-gap\)/);
    expect(source).toMatch(/height:\s*calc\(\(100vw - \(var\(--module-grid-x\) \* 2\) - var\(--module-grid-col-gap\)\) \/ 2\)/);
    expect(source).toMatch(/font-size:\s*clamp\(14px,\s*5vw,\s*18px\)/);
  });

  it("renders a path progress bar above two module tiles", async () => {
    const router = makeRouter();
    const wrapper = mount(LearnHubPage, {
      global: { plugins: [router] },
    });
    await flushPromises();
    await flushPromises();

    const pathCard = wrapper.find(".path-progress-card");
    expect(pathCard.exists()).toBe(true);
    expect(pathCard.find(".path-progress-title").text()).toBe("晋级之路");
    expect(pathCard.text()).toContain("已完成 3/10 关");
    expect(pathCard.text()).toContain("★ 7");
    expect(pathCard.find(".path-progress-fill").attributes("style")).toContain("width: 30%");
    const tiles = wrapper.findAll(".module-tile");
    expect(tiles.length).toBe(3);
    const labels = tiles.map((t) => t.find(".module-label").text());
    expect(labels).toContain("新闻");
    expect(labels).toContain("阅读");
    expect(labels).toContain("AI 翻译");
  });

  it("navigates to path when the path progress bar is clicked", async () => {
    const router = makeRouter();
    const pushSpy = vi.spyOn(router, "push");
    const wrapper = mount(LearnHubPage, {
      global: { plugins: [router] },
    });
    await flushPromises();

    await wrapper.find(".path-progress-card").trigger("click");

    expect(pushSpy).toHaveBeenCalledWith({ name: "path" });
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
      query: {},
    });
  });

  it("renders the learning status panel with three stat cells", async () => {
    const router = makeRouter();
    const wrapper = mount(LearnHubPage, {
      global: { plugins: [router] },
    });
    await flushPromises();

    const card = wrapper.find(".status-card");
    expect(card.exists()).toBe(true);
    const cells = wrapper.findAll(".stat-cell");
    expect(cells.length).toBe(4);
    const labels = cells.map((c) => c.find(".stat-label").text());
    expect(labels).toContain("词汇");
    expect(labels).toContain("新闻");
    expect(labels).toContain("学习天数");
    expect(labels).toContain("阅读");
  });

  it("shows values returned by the stats APIs in the status panel", async () => {
    mockInvoke.mockImplementation((cmd) => {
      if (cmd === "get_target_language_cmd") return Promise.resolve("es");
      if (cmd === "get_current_user") return Promise.resolve({ id: "u1" });
      if (cmd === "get_learning_goals_cmd") return Promise.resolve([]);
      if (cmd === "get_user_vocab_stats_cmd") return Promise.resolve({ total_known: 42, total_learning: 5, total: 1000 });
      if (cmd === "get_read_article_count_cmd") return Promise.resolve(7);
      if (cmd === "get_learning_days_cmd") return Promise.resolve(9);
      if (cmd === "get_completed_reading_count_cmd") return Promise.resolve(5);
      return Promise.resolve(null);
    });
    const router = makeRouter();
    const wrapper = mount(LearnHubPage, {
      global: { plugins: [router] },
    });
    await flushPromises();
    await flushPromises();

    const cells = wrapper.findAll(".stat-cell");
    const vocabCell = cells.find((c) => c.text().includes("词汇"));
    const readCell = cells.find((c) => c.text().includes("新闻"));
    const daysCell = cells.find((c) => c.text().includes("学习天数"));
    const readingCell = cells.find((c) => c.text().includes("阅读"));
    expect(vocabCell.find(".stat-value").text()).toBe("42");
    expect(readCell.find(".stat-value").text()).toBe("7");
    expect(daysCell.find(".stat-value").text()).toBe("9");
    expect(readingCell.find(".stat-value").text()).toBe("5");
  });

  it("falls back to 0 when the stats APIs fail", async () => {
    mockInvoke.mockImplementation((cmd) => {
      if (cmd === "get_target_language_cmd") return Promise.resolve("es");
      if (cmd === "get_current_user") return Promise.resolve({ id: "u1" });
      return Promise.reject(new Error("boom"));
    });
    const router = makeRouter();
    const wrapper = mount(LearnHubPage, {
      global: { plugins: [router] },
    });
    await flushPromises();

    const cells = wrapper.findAll(".stat-cell");
    for (const cell of cells) {
      expect(cell.find(".stat-value").text()).toBe("0");
    }
  });
});
