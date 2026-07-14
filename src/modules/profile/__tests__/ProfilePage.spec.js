import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import * as api from "@/shared/api.js";
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
    mockInvoke = vi.fn();
    api.__setInvoke(mockInvoke);
  });

  function mountPage({ realSettings = false } = {}) {
    return mount(ProfilePage, {
      global: {
        mocks: { $router: makeStubRouter(), $route: makeStubRoute() },
        stubs: {
          SettingsItem: realSettings ? false : true,
          ConfirmDialog: realSettings ? false : true,
          RouterLink: { template: "<a><slot /></a>" },
          Teleport: true,
        },
      },
    });
  }

  it("renders the account card header (avatar + nickname)", () => {
    mockInvoke.mockRejectedValue(new Error("not wired in test"));
    const wrapper = mountPage();
    expect(wrapper.find(".account-card").exists()).toBe(true);
    expect(wrapper.find(".account-avatar").exists()).toBe(true);
  });

  it("does not render the moved-out stats row anymore", () => {
    mockInvoke.mockRejectedValue(new Error("not wired in test"));
    const wrapper = mountPage();
    // The stats row was moved to LearnHubPage; ProfilePage should no longer show it.
    expect(wrapper.find(".stats-row").exists()).toBe(false);
    expect(wrapper.findAll(".stat-cell").length).toBe(0);
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

  it("renders B1 and B2 level pills for Spanish and updates the selected level", async () => {
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
    expect(levelPills.length).toBe(4);
    const b2 = levelPills.find((p) => p.text().includes("B2"));
    await b2.trigger("click");
    await flushPromises();
    expect(updatedLevel).toBe("B2");
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

  it("resets only Soul Mate from the Me page", async () => {
    mockInvoke.mockImplementation((cmd) => {
      if (cmd === "get_current_user") return Promise.resolve({ id: "u1", native_language: "zh" });
      if (cmd === "get_learning_goals_cmd") return Promise.resolve([]);
      if (cmd === "get_target_language_cmd") return Promise.resolve("es");
      if (cmd === "reset_soulmate_cmd") return Promise.resolve(true);
      return Promise.resolve(null);
    });
    const wrapper = mountPage({ realSettings: true });
    await flushPromises();

    const resetItem = wrapper.findAll(".settings-item").find((item) => item.text().includes("重设灵伴"));
    expect(resetItem).toBeTruthy();
    await resetItem.trigger("click");
    await wrapper.find(".confirm-btn.confirm").trigger("click");
    await flushPromises();

    expect(mockInvoke).toHaveBeenCalledWith("reset_soulmate_cmd", { userId: "u1" });
    expect(wrapper.text()).toContain("灵伴已重设");
  });
});
