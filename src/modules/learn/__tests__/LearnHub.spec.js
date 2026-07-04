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