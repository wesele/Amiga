import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { createRouter, createMemoryHistory } from "vue-router";
import * as api from "@/shared/api.js";
import { i18n as i18nInstance, setLocale } from "@/shared/i18n/index.js";
import ConfirmDialog from "@/shared/components/ConfirmDialog.vue";

const SettingsPage = (await import("@/modules/profile/SettingsPage.vue")).default;

function makeRoutes() {
  return [
    { path: "/profile/settings", name: "settings", component: { template: "<div/>" } },
    { path: "/profile/llm-config", name: "llm-config", component: { template: "<div/>" } },
  ];
}

function findToggleByRowLabel(wrapper, label) {
  return wrapper.findAll(".sync-switch-input").find((el) => {
    const row = el.element.closest(".settings-item");
    return row?.textContent?.includes(label);
  });
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

  it("clicking OK in the language dialog actually calls setLocale (regression for missing parens)", async () => {
    let persistedLang = null;
    mockInvoke.mockImplementation((cmd, args) => {
      if (cmd === "save_setting_cmd") {
        persistedLang = args?.value;
        return Promise.resolve(null);
      }
      if (cmd === "get_setting_cmd") return Promise.resolve(null);
      if (cmd === "get_current_user") return Promise.resolve({ id: "u1", native_language: "zh" });
      if (cmd === "update_user_cmd") return Promise.resolve({ id: "u1", native_language: "en" });
      return Promise.resolve(null);
    });

    const wrapper = mountPage();
    await flushPromises();

    const langItem = wrapper
      .findAll(".settings-item")
      .find((el) => el.text().includes("界面语言"));
    expect(langItem).toBeTruthy();
    await langItem.trigger("click");
    await flushPromises();

    const radios = wrapper.findAll('input[type="radio"][value="en"]');
    expect(radios.length).toBe(1);
    await radios[0].setValue(true);
    await flushPromises();

    const okBtn = wrapper
      .findAll(".dialog-btn.primary")
      .find((b) => b.text() === "确定");
    expect(okBtn).toBeTruthy();
    await okBtn.trigger("click");
    await flushPromises();

    expect(i18nInstance.locale.value).toBe("en");
    expect(persistedLang).toBe("en");
  });

  it("switching language also syncs native_language to the user row", async () => {
    let updateUserArgs = null;
    mockInvoke.mockImplementation((cmd, args) => {
      if (cmd === "save_setting_cmd") return Promise.resolve(null);
      if (cmd === "get_setting_cmd") return Promise.resolve(null);
      if (cmd === "get_current_user") return Promise.resolve({ id: "u1", native_language: "zh" });
      if (cmd === "update_user_cmd") {
        updateUserArgs = args;
        return Promise.resolve({ id: "u1", native_language: "en" });
      }
      return Promise.resolve(null);
    });

    const wrapper = mountPage();
    await flushPromises();

    const langItem = wrapper
      .findAll(".settings-item")
      .find((el) => el.text().includes("界面语言"));
    await langItem.trigger("click");
    await flushPromises();

    const radios = wrapper.findAll('input[type="radio"][value="en"]');
    await radios[0].setValue(true);
    await flushPromises();

    const okBtn = wrapper
      .findAll(".dialog-btn.primary")
      .find((b) => b.text() === "确定");
    await okBtn.trigger("click");
    await flushPromises();
    await flushPromises();

    expect(updateUserArgs).toMatchObject({ request: { id: "u1", native_language: "en" } });
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
      return Promise.resolve(null);
    });

    const wrapper = mountPage();
    await flushPromises();

    const toggle = findToggleByRowLabel(wrapper, "云同步");
    expect(toggle).toBeTruthy();
    expect(toggle.element.checked).toBe(false);

    await toggle.setValue(true);
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
      return Promise.resolve(null);
    });

    const wrapper = mountPage();
    await flushPromises();

    const toggle = findToggleByRowLabel(wrapper, "云同步");
    await toggle.setValue(true);
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
      return Promise.resolve(null);
    });

    const wrapper = mountPage();
    await flushPromises();

    const toggle = findToggleByRowLabel(wrapper, "云同步");
    await toggle.setValue(true);
    await flushPromises();

    expect(findToggleByRowLabel(wrapper, "云同步").element.checked).toBe(false);
    expect(wrapper.text()).toContain("同步失败");
  });

  it("toggles lesson feedback preference from the interface section", async () => {
    localStorage.clear();
    mockInvoke.mockImplementation((cmd) => {
      if (cmd === "get_setting_cmd") return Promise.resolve(null);
      return Promise.resolve(null);
    });

    const wrapper = mountPage();
    await flushPromises();

    expect(wrapper.text()).toContain("练习音效与振动");
    const feedbackToggle = findToggleByRowLabel(wrapper, "练习音效与振动");
    expect(feedbackToggle).toBeTruthy();
    expect(feedbackToggle.element.checked).toBe(true);

    await feedbackToggle.setValue(false);
    await flushPromises();

    expect(JSON.parse(localStorage.getItem("lesson_feedback_prefs"))).toEqual({
      enabled: false,
    });
  });
});
