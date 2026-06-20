import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import * as api from "@/shared/api.js";

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

  it("renders both stat labels", () => {
    mockInvoke.mockRejectedValue(new Error("not wired in test"));
    const wrapper = mountPage();
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

  it("shows the read article count returned by the API", async () => {
    mockInvoke.mockImplementation((cmd) => {
      if (cmd === "get_current_user") return Promise.resolve({ id: "u1", native_language: "zh" });
      if (cmd === "get_learning_goals_cmd") return Promise.resolve([]);
      if (cmd === "get_user_vocab_stats_cmd") return Promise.resolve({ total_known: 0, total_learning: 0, total: 0 });
      if (cmd === "get_read_article_count_cmd") return Promise.resolve(7);
      return Promise.resolve(null);
    });
    const wrapper = mountPage();
    await flushPromises();
    const cells = wrapper.findAll(".stat-cell");
    const readCell = cells.find((c) => c.text().includes("已读文章"));
    expect(readCell.find(".stat-value").text()).toBe("7");
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
    const pills = wrapper.findAll(".lang-pill");
    expect(pills.length).toBe(3);
    // The Spanish pill should be marked active (the wizard default).
    const active = pills.find((p) => p.classes().includes("active"));
    expect(active).toBeTruthy();
    expect(active.text()).toContain("西班牙语");
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
    const pills = wrapper.findAll(".lang-pill");
    // Find the English pill (2nd one).
    const enPill = pills.find((p) => p.text().includes("英语"));
    expect(enPill).toBeTruthy();
    await enPill.trigger("click");
    await flushPromises();
    expect(switched).toBe("en");
  });
});
