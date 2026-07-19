import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { createRouter, createMemoryHistory } from "vue-router";
import * as api from "@/shared/api.js";
import { setLocale } from "@/shared/i18n/index.js";

const LlmConfigPage = (await import("@/modules/profile/LlmConfigPage.vue")).default;

const BUILTIN = {
  base_url: "https://integrate.api.nvidia.com/v1",
  api_key: "nvapi-secret-key-1234567890ABCDEF",
  model: "google/diffusiongemma-26b-a4b-it",
};

function makeRoutes() {
  return [
    { path: "/profile/settings", name: "settings", component: { template: "<div/>" } },
    { path: "/profile/llm-config", name: "llm-config", component: { template: "<div/>" } },
  ];
}

function mountPage() {
  const router = createRouter({ history: createMemoryHistory(), routes: makeRoutes() });
  return mount(LlmConfigPage, {
    global: { plugins: [router] },
  });
}

describe("LlmConfigPage", () => {
  let mockInvoke;
  let savedCalls;

  beforeEach(() => {
    setActivePinia(createPinia());
    mockInvoke = vi.fn();
    savedCalls = [];
    api.__setInvoke(mockInvoke);
    setLocale("zh", { persist: false });
    mockInvoke.mockImplementation((cmd, args) => {
      if (cmd === "get_llm_config_cmd") {
        return Promise.resolve({ mode: "builtin", primary: null, builtin: BUILTIN });
      }
      if (cmd === "save_setting_cmd") {
        savedCalls.push({ key: args?.key, value: args?.value });
        return Promise.resolve(null);
      }
      if (cmd === "save_llm_config_cmd") {
        savedCalls.push({ cmd, key: args?.key, config: args?.config });
        return Promise.resolve(null);
      }
      if (cmd === "test_llm_connection_cmd") return Promise.resolve({ success: true, message: "ok" });
      return Promise.resolve(null);
    });
  });

  it("defaults to built-in mode and shows the warning notice (hides connection parameters)", async () => {
    const wrapper = mountPage();
    await flushPromises();

    const builtinRadio = wrapper.find('input[type="radio"][value="builtin"]');
    expect(builtinRadio.element.checked).toBe(true);

    // The warning notice is rendered.
    const notice = wrapper.find(".notice-card");
    expect(notice.exists()).toBe(true);
    const text = wrapper.text();
    expect(text).toContain("免费模型");
    expect(text).toContain("请切换为自定义 API");

    // Connection parameters are NOT shown in built-in mode.
    expect(text).not.toContain(BUILTIN.base_url);
    expect(text).not.toContain(BUILTIN.model);
    expect(wrapper.html()).not.toContain(BUILTIN.api_key);
  });

  it("switching to custom reveals the editable form and hides the info card", async () => {
    const wrapper = mountPage();
    await flushPromises();

    const customRadio = wrapper.find('input[type="radio"][value="custom"]');
    await customRadio.setValue(true);
    await flushPromises();

    // The API key input now exists.
    const apiKeyInput = wrapper.find('input[type="password"]');
    expect(apiKeyInput.exists()).toBe(true);
    // The base URL field exists.
    const inputs = wrapper.findAll("input.field-input");
    expect(inputs.length).toBeGreaterThanOrEqual(3);
    // The free-notice banner is gone.
    expect(wrapper.find(".notice-card").exists()).toBe(false);
  });

  it("save in built-in mode persists the mode but does not touch the custom config keys", async () => {
    const wrapper = mountPage();
    await flushPromises();

    const builtinRadio = wrapper.find('input[type="radio"][value="builtin"]');
    await builtinRadio.trigger("change");
    await flushPromises();

    const modeSave = savedCalls.find((c) => c.key === "llm_mode");
    expect(modeSave).toBeTruthy();
    expect(modeSave.value).toBe("builtin");
    const configSave = savedCalls.find((c) => c.cmd === "save_llm_config_cmd");
    expect(configSave).toBeUndefined();
  });

  it("save in custom mode persists the mode AND the custom config", async () => {
    mockInvoke.mockImplementationOnce((cmd) => {
      if (cmd === "get_llm_config_cmd") {
        return Promise.resolve({ mode: "custom", primary: null, builtin: BUILTIN });
      }
      return Promise.resolve(null);
    });
    const wrapper = mountPage();
    await flushPromises();

    const customRadio = wrapper.find('input[type="radio"][value="custom"]');
    await customRadio.setValue(true);
    await flushPromises();

    await wrapper.find('input[placeholder="sk-..."]').setValue("sk-mykey");
    await wrapper.find('input[placeholder="https://api.openai.com/v1"]').setValue("https://api.openai.com/v1");
    await wrapper.find('input[placeholder="gpt-4o-mini"]').setValue("gpt-4o-mini");
    await wrapper.find("select.provider-select").setValue("deepseek");
    // Whole-row thinking toggle (TV remote friendly).
    await wrapper.find("button.thinking-card").trigger("click");
    await flushPromises();

    const modeSave = savedCalls.find((c) => c.key === "llm_mode");
    expect(modeSave?.value).toBe("custom");
    const configSaves = savedCalls.filter((c) => c.cmd === "save_llm_config_cmd");
    expect(configSaves.length).toBeGreaterThan(0);
    const configSave = configSaves[configSaves.length - 1];
    expect(configSave).toBeTruthy();
    expect(configSave.key).toBe("primary");
    expect(configSave.config.api_key).toBe("sk-mykey");
    expect(configSave.config.base_url).toBe("https://api.openai.com/v1");
    expect(configSave.config.model).toBe("gpt-4o-mini");
    expect(configSave.config.provider).toBe("deepseek");
    expect(configSave.config.thinking_enabled).toBe(true);
  });

  it("test-connection in built-in mode hits the built-in config (never the user's saved one)", async () => {
    const wrapper = mountPage();
    await flushPromises();

    const testBtn = wrapper.findAll("button").find((b) => b.text().includes("测试连接"));
    await testBtn.trigger("click");
    await flushPromises();

    const testCall = mockInvoke.mock.calls.find((c) => c[0] === "test_llm_connection_cmd");
    expect(testCall).toBeTruthy();
    const config = testCall[1]?.config;
    expect(config?.base_url).toBe(BUILTIN.base_url);
    expect(config?.api_key).toBe(BUILTIN.api_key);
    expect(config?.model).toBe(BUILTIN.model);
  });
});
