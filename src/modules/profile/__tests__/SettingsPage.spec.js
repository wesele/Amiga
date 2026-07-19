import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { createRouter, createMemoryHistory } from "vue-router";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import * as api from "@/shared/api.js";
import { setLocale } from "@/shared/i18n/index.js";
import ConfirmDialog from "@/shared/components/ConfirmDialog.vue";

const SettingsPage = (await import("@/modules/profile/SettingsPage.vue")).default;

function makeRoutes() {
  return [
    { path: "/profile/settings", name: "settings", component: { template: "<div/>" } },
    { path: "/profile/llm-config", name: "llm-config", component: { template: "<div/>" } },
    { path: "/profile/multimodal-config", name: "multimodal-config", component: { template: "<div/>" } },
    { path: "/prompts", name: "prompts", component: { template: "<div/>" } },
  ];
}

describe("SettingsPage", () => {
  let mockInvoke;

  beforeEach(() => {
    setActivePinia(createPinia());
    mockInvoke = vi.fn();
    api.__setInvoke(mockInvoke);
    setLocale("zh", { persist: false });
  });

  function mountPage() {
    const router = createRouter({ history: createMemoryHistory(), routes: makeRoutes() });
    return mount(SettingsPage, {
      global: {
        plugins: [router],
        stubs: { Teleport: true },
      },
    });
  }

  it("renders the full AI configuration section (primary, multimodal, prompts)", async () => {
    mockInvoke.mockImplementation((cmd) => {
      if (cmd === "get_setting_cmd") return Promise.resolve(null);
      if (cmd === "get_current_user") return Promise.resolve({ id: "u1", native_language: "zh" });
      if (cmd === "get_learning_goals_cmd") return Promise.resolve([]);
      if (cmd === "get_target_language_cmd") return Promise.resolve("es");
      return Promise.resolve(null);
    });
    const wrapper = mountPage();
    await flushPromises();
    expect(wrapper.text()).toContain("AI 配置");
    expect(wrapper.html()).toContain("/profile/llm-config");
    expect(wrapper.html()).toContain("/profile/multimodal-config");
    expect(wrapper.html()).toContain("/prompts");
  });

  it("does not render the old UI language settings row (moved to Profile)", async () => {
    mockInvoke.mockImplementation((cmd) => {
      if (cmd === "get_setting_cmd") return Promise.resolve(null);
      if (cmd === "get_current_user") return Promise.resolve({ id: "u1", native_language: "zh" });
      if (cmd === "get_learning_goals_cmd") return Promise.resolve([]);
      if (cmd === "get_target_language_cmd") return Promise.resolve("es");
      return Promise.resolve(null);
    });
    const wrapper = mountPage();
    await flushPromises();
    const langItem = wrapper
      .findAll(".settings-item")
      .find((el) => el.text().includes("界面语言"));
    expect(langItem).toBeFalsy();
  });

  it("renders the learning language switcher with three pills", async () => {
    mockInvoke.mockImplementation((cmd) => {
      if (cmd === "get_setting_cmd") return Promise.resolve(null);
      if (cmd === "get_current_user") return Promise.resolve({ id: "u1", native_language: "zh" });
      if (cmd === "get_learning_goals_cmd") return Promise.resolve([
        { id: 1, target_language: "es", cefr_level: "A1" },
      ]);
      if (cmd === "get_target_language_cmd") return Promise.resolve("es");
      return Promise.resolve(null);
    });
    const wrapper = mountPage();
    await flushPromises();
    expect(wrapper.text()).toContain("学习语言");
    const pills = wrapper.findAll(".lang-pill").filter((p) => !p.classes().includes("level-pill"));
    expect(pills.length).toBe(3);
    const active = pills.find((p) => p.classes().includes("active"));
    expect(active).toBeTruthy();
    expect(active.text()).toContain("西班牙语");
  });

  it("renders B1 and B2 level pills for Spanish and updates the selected level", async () => {
    let updatedLevel = "";
    mockInvoke.mockImplementation((cmd, args) => {
      if (cmd === "get_setting_cmd") return Promise.resolve(null);
      if (cmd === "get_current_user") return Promise.resolve({ id: "u1", native_language: "zh" });
      if (cmd === "get_learning_goals_cmd") return Promise.resolve([
        { id: 1, target_language: "es", cefr_level: "A1" },
      ]);
      if (cmd === "get_target_language_cmd") return Promise.resolve("es");
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

  it("clicking another learning language calls set_target_language_cmd", async () => {
    let switched = "";
    mockInvoke.mockImplementation((cmd, args) => {
      if (cmd === "get_setting_cmd") return Promise.resolve(null);
      if (cmd === "get_current_user") return Promise.resolve({ id: "u1", native_language: "zh" });
      if (cmd === "get_learning_goals_cmd") return Promise.resolve([
        { id: 1, target_language: "es", cefr_level: "A1" },
        { id: 2, target_language: "en", cefr_level: "A1" },
      ]);
      if (cmd === "get_target_language_cmd") return Promise.resolve("es");
      if (cmd === "set_target_language_cmd") {
        switched = args?.language;
        return Promise.resolve("en");
      }
      return Promise.resolve(null);
    });
    const wrapper = mountPage();
    await flushPromises();
    const pills = wrapper.findAll(".lang-pill").filter((p) => !p.classes().includes("level-pill"));
    const enPill = pills.find((p) => p.text().includes("英语"));
    expect(enPill).toBeTruthy();
    await enPill.trigger("click");
    await flushPromises();
    expect(switched).toBe("en");
  });

  it("active learning language pill stays readable (white text) on hover", () => {
    const sfcPath = resolve(dirname(fileURLToPath(import.meta.url)), "..", "SettingsPage.vue");
    const css = readFileSync(sfcPath, "utf8");
    expect(css).toMatch(/\.lang-pill\.active:hover[^{]*\{[\s\S]*?color:\s*#fff/);
  });

  it("clicking OK in the news-limit dialog actually persists the value", async () => {
    let persistedKey = null;
    let persistedVal = null;
    mockInvoke.mockImplementation((cmd, args) => {
      if (cmd === "save_setting_cmd") {
        persistedKey = args?.key;
        persistedVal = args?.value;
        return Promise.resolve(null);
      }
      if (cmd === "get_setting_cmd") return Promise.resolve(null);
      if (cmd === "get_current_user") return Promise.resolve({ id: "u1", native_language: "zh" });
      if (cmd === "get_learning_goals_cmd") return Promise.resolve([]);
      if (cmd === "get_target_language_cmd") return Promise.resolve("es");
      return Promise.resolve(null);
    });

    const wrapper = mountPage();
    await flushPromises();

    const newsItem = wrapper
      .findAll(".settings-item")
      .find((el) => el.text().includes("新闻获取数量"));
    expect(newsItem).toBeTruthy();
    await newsItem.trigger("click");
    await flushPromises();

    const plus = wrapper.findAll(".stepper-btn").find((b) => b.text() === "+");
    expect(plus).toBeTruthy();
    await plus.trigger("click");
    await flushPromises();

    const okBtn = wrapper
      .findAll(".dialog-btn.primary")
      .find((b) => b.text() === "确定");
    expect(okBtn).toBeTruthy();
    await okBtn.trigger("click");
    await flushPromises();

    expect(persistedKey).toBe("news_fetch_limit");
    expect(persistedVal).toBe("6");
  });

  it("cloud sync defaults to off and enabling calls setCloudSyncEnabled", async () => {
    let setEnabledArgs = null;
    mockInvoke.mockImplementation((cmd, args) => {
      if (cmd === "get_cloud_sync_status_cmd") {
        return Promise.resolve({
          enabled: false,
          nickname: "Alice",
          device_id: "dev-1",
          last_synced_at: null,
          last_error: null,
          restore_available: false,
        });
      }
      if (cmd === "set_cloud_sync_enabled_cmd") {
        setEnabledArgs = args;
        return Promise.resolve({ enabled: true, remote_conflict: false });
      }
      if (cmd === "get_setting_cmd") return Promise.resolve(null);
      if (cmd === "get_current_user") return Promise.resolve({ id: "u1", native_language: "zh" });
      if (cmd === "get_learning_goals_cmd") return Promise.resolve([]);
      if (cmd === "get_target_language_cmd") return Promise.resolve("es");
      return Promise.resolve(null);
    });

    const wrapper = mountPage();
    await flushPromises();

    const syncRow = wrapper
      .findAll(".settings-item")
      .find((el) => el.text().includes("云同步") || el.text().includes("Cloud"));
    expect(syncRow).toBeTruthy();
    expect(syncRow.find(".sync-switch").classes()).not.toContain("on");

    // Whole row is the focusable control (TV remote); decorative switch has no input.
    await syncRow.trigger("click");
    await flushPromises();

    expect(setEnabledArgs).toMatchObject({ enabled: true, forceEnable: false });
  });

  it("remote cloud sync conflict shows ConfirmDialog and confirm calls force enable", async () => {
    let forceEnable = null;
    mockInvoke.mockImplementation((cmd, args) => {
      if (cmd === "get_cloud_sync_status_cmd") {
        return Promise.resolve({
          enabled: false,
          nickname: "Alice",
          device_id: "dev-1",
          last_synced_at: null,
          last_error: null,
          restore_available: false,
        });
      }
      if (cmd === "set_cloud_sync_enabled_cmd") {
        if (!args?.forceEnable) {
          return Promise.resolve({ enabled: false, remote_conflict: true });
        }
        forceEnable = args?.forceEnable;
        return Promise.resolve({ enabled: true, remote_conflict: false });
      }
      if (cmd === "get_setting_cmd") return Promise.resolve(null);
      if (cmd === "get_current_user") return Promise.resolve({ id: "u1", native_language: "zh" });
      if (cmd === "get_learning_goals_cmd") return Promise.resolve([]);
      if (cmd === "get_target_language_cmd") return Promise.resolve("es");
      return Promise.resolve(null);
    });

    const wrapper = mountPage();
    await flushPromises();

    const syncRow = wrapper
      .findAll(".settings-item")
      .find((el) => el.text().includes("云同步") || el.text().includes("Cloud"));
    await syncRow.trigger("click");
    await flushPromises();

    const conflictDlg = wrapper.findAllComponents(ConfirmDialog).find((d) => d.props("show") === true);
    expect(conflictDlg).toBeTruthy();
    expect(conflictDlg.props("title")).toBe("从云端恢复？");
    expect(conflictDlg.text()).toContain("Alice");

    await conflictDlg.vm.$emit("confirm");
    await flushPromises();

    expect(forceEnable).toBe(true);
  });

  it("cloud sync enable failure keeps the switch off", async () => {
    mockInvoke.mockImplementation((cmd) => {
      if (cmd === "get_cloud_sync_status_cmd") {
        return Promise.resolve({
          enabled: false,
          nickname: "Alice",
          device_id: "dev-1",
          last_synced_at: null,
          last_error: null,
          restore_available: false,
        });
      }
      if (cmd === "set_cloud_sync_enabled_cmd") {
        return Promise.reject(new Error("network down"));
      }
      if (cmd === "get_setting_cmd") return Promise.resolve(null);
      if (cmd === "get_current_user") return Promise.resolve({ id: "u1", native_language: "zh" });
      if (cmd === "get_learning_goals_cmd") return Promise.resolve([]);
      if (cmd === "get_target_language_cmd") return Promise.resolve("es");
      return Promise.resolve(null);
    });

    const wrapper = mountPage();
    await flushPromises();

    const syncRow = wrapper
      .findAll(".settings-item")
      .find((el) => el.text().includes("云同步") || el.text().includes("Cloud"));
    await syncRow.trigger("click");
    await flushPromises();

    expect(syncRow.find(".sync-switch").classes()).not.toContain("on");
    expect(wrapper.text()).toContain("同步失败");
  });

  it("uses inset focus styles for settings rows and language pills", () => {
    const settingsItem = readFileSync(
      resolve(dirname(fileURLToPath(import.meta.url)), "..", "components", "SettingsItem.vue"),
      "utf8",
    );
    expect(settingsItem).toMatch(/\.settings-item:focus-visible/);
    expect(settingsItem).toMatch(/outline-offset:\s*-3px/);
    expect(settingsItem).toMatch(/transform:\s*none\s*!important/);

    const settingsPage = readFileSync(
      resolve(dirname(fileURLToPath(import.meta.url)), "..", "SettingsPage.vue"),
      "utf8",
    );
    expect(settingsPage).toMatch(/\.lang-pill:focus-visible/);
    expect(settingsPage).toMatch(/onCloudSyncRowActivate/);
  });
});
