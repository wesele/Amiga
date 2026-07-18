import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import * as api from "@/shared/api.js";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { i18n as i18nInstance, setLocale } from "@/shared/i18n/index.js";

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
    setLocale("zh", { persist: false });
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

  it("does not render learning language / level switchers (moved to Settings)", async () => {
    mockInvoke.mockImplementation((cmd) => {
      if (cmd === "get_current_user") return Promise.resolve({ id: "u1", native_language: "zh" });
      if (cmd === "get_learning_goals_cmd") return Promise.resolve([
        { id: 1, target_language: "es", cefr_level: "A1" },
      ]);
      if (cmd === "get_target_language_cmd") return Promise.resolve("es");
      return Promise.resolve(null);
    });
    const wrapper = mountPage();
    await flushPromises();
    expect(wrapper.text()).not.toContain("学习语言");
    expect(wrapper.text()).not.toContain("当前级别");
    expect(wrapper.findAll(".level-pill").length).toBe(0);
  });

  it("renders the UI language switcher with three pills", async () => {
    mockInvoke.mockImplementation((cmd) => {
      if (cmd === "get_current_user") return Promise.resolve({ id: "u1", native_language: "zh" });
      if (cmd === "get_learning_goals_cmd") return Promise.resolve([
        { id: 1, target_language: "es", cefr_level: "A1" },
      ]);
      if (cmd === "get_target_language_cmd") return Promise.resolve("es");
      return Promise.resolve(null);
    });
    const wrapper = mountPage();
    await flushPromises();
    expect(wrapper.text()).toContain("界面语言");
    const pills = wrapper.findAll(".lang-pill");
    expect(pills.length).toBe(3);
    const active = pills.find((p) => p.classes().includes("active"));
    expect(active).toBeTruthy();
    expect(active.text()).toContain("中文");
  });

  it("clicking another UI language calls setLocale and persists ui_language", async () => {
    let persistedLang = null;
    mockInvoke.mockImplementation((cmd, args) => {
      if (cmd === "save_setting_cmd") {
        persistedLang = args?.value;
        return Promise.resolve(null);
      }
      if (cmd === "get_current_user") return Promise.resolve({ id: "u1", native_language: "zh" });
      if (cmd === "update_user_cmd") return Promise.resolve({ id: "u1", native_language: "en" });
      if (cmd === "get_learning_goals_cmd") return Promise.resolve([]);
      if (cmd === "get_target_language_cmd") return Promise.resolve("es");
      return Promise.resolve(null);
    });
    const wrapper = mountPage();
    await flushPromises();
    const enPill = wrapper.findAll(".lang-pill").find((p) => p.text().includes("English"));
    expect(enPill).toBeTruthy();
    await enPill.trigger("click");
    await flushPromises();
    expect(i18nInstance.locale.value).toBe("en");
    expect(persistedLang).toBe("en");
  });

  it("active language pill stays readable (white text) on hover", () => {
    // Regression for the green-on-green bug: the generic `.lang-pill:hover`
    // rule was more specific than `.lang-pill.active` and clobbered `color`,
    // making the text invisible against the green background.
    const sfcPath = resolve(dirname(fileURLToPath(import.meta.url)), "..", "ProfilePage.vue");
    const css = readFileSync(sfcPath, "utf8");
    expect(css).toMatch(/\.lang-pill\.active:hover[^{]*\{[\s\S]*?color:\s*#fff/);
  });

  it("links to Soul Mate settings from the Me page", async () => {
    mockInvoke.mockImplementation((cmd) => {
      if (cmd === "get_current_user") return Promise.resolve({ id: "u1", native_language: "zh" });
      if (cmd === "get_learning_goals_cmd") return Promise.resolve([]);
      if (cmd === "get_target_language_cmd") return Promise.resolve("es");
      return Promise.resolve(null);
    });
    const wrapper = mountPage({ realSettings: true });
    await flushPromises();

    const settingsItem = wrapper.findAll(".settings-item")
      .find((item) => item.text().includes("灵伴设置"));
    expect(settingsItem).toBeTruthy();
    const sfcPath = resolve(dirname(fileURLToPath(import.meta.url)), "..", "ProfilePage.vue");
    expect(readFileSync(sfcPath, "utf8")).toContain('to="/profile/soulmate"');
  });
});
