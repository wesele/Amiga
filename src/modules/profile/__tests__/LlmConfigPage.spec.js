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
  model: "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning",
  provider: "nvidia_nim",
  thinking_enabled: true,
};

function makeRoutes() {
  return [
    { path: "/profile/settings", name: "settings", component: { template: "<div/>" } },
    { path: "/profile/llm-config", name: "llm-config", component: { template: "<div/>" } },
  ];
}

function mountPage(stubs = undefined) {
  const router = createRouter({ history: createMemoryHistory(), routes: makeRoutes() });
  return mount(LlmConfigPage, {
    global: { plugins: [router], ...(stubs ? { stubs } : {}) },
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
    expect(configSave.config.base_url).toBe("https://api.deepseek.com/v1");
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
    expect(config?.provider).toBe("nvidia_nim");
    expect(config?.thinking_enabled).toBe(true);
  });

  it("saves custom config even if some fields are empty (no early return)", async () => {
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

    await wrapper.find('input[placeholder="sk-..."]').setValue("sk-partial");
    await wrapper.find('input[placeholder="https://api.openai.com/v1"]').setValue("");
    await wrapper.find('input[placeholder="gpt-4o-mini"]').setValue("");
    
    // Trigger saveConfig by changing model name or api key
    const modelInput = wrapper.find('input[placeholder="gpt-4o-mini"]');
    await modelInput.setValue("");
    await modelInput.trigger("change");
    await flushPromises();

    const configSaves = savedCalls.filter((c) => c.cmd === "save_llm_config_cmd");
    expect(configSaves.length).toBeGreaterThan(0);
    const lastSave = configSaves[configSaves.length - 1];
    expect(lastSave.config.api_key).toBe("sk-partial");
    expect(lastSave.config.base_url).toBe("");
    expect(lastSave.config.model).toBe("");
  });

  it("updates base URL automatically when provider changes", async () => {
    mockInvoke.mockImplementationOnce((cmd) => {
      if (cmd === "get_llm_config_cmd") {
        return Promise.resolve({
          mode: "custom",
          primary: { api_key: "key", base_url: "https://api.openai.com/v1", model: "gpt-3.5", provider: "openai" },
          builtin: BUILTIN
        });
      }
      return Promise.resolve(null);
    });
    const wrapper = mountPage();
    await flushPromises();

    const providerSelect = wrapper.find("select.provider-select");
    await providerSelect.setValue("gemini");
    await flushPromises();

    const configSaves = savedCalls.filter((c) => c.cmd === "save_llm_config_cmd");
    expect(configSaves.length).toBeGreaterThan(0);
    const lastSave = configSaves[configSaves.length - 1];
    expect(lastSave.config.provider).toBe("gemini");
    expect(lastSave.config.base_url).toBe("https://generativelanguage.googleapis.com/v1beta/openai/v1");
  });

  describe("remembered presets", () => {
    const DEEPSEEK_URL = "https://api.deepseek.com/v1";

    function lastSavedPresets() {
      const call = [...savedCalls].reverse().find((c) => c.key === "llm_presets");
      return call ? JSON.parse(call.value) : null;
    }

    function mockCustomWith(primary, presets = null) {
      mockInvoke.mockImplementation((cmd, args) => {
        if (cmd === "get_llm_config_cmd") {
          return Promise.resolve({ mode: "custom", primary, builtin: BUILTIN });
        }
        if (cmd === "get_setting_cmd") {
          if (args?.key === "llm_presets") {
            return Promise.resolve(presets ? JSON.stringify(presets) : null);
          }
          return Promise.resolve(null);
        }
        if (cmd === "save_setting_cmd") {
          savedCalls.push({ key: args?.key, value: args?.value });
          return Promise.resolve(null);
        }
        if (cmd === "save_llm_config_cmd") {
          savedCalls.push({ cmd, key: args?.key, config: args?.config });
          return Promise.resolve(null);
        }
        if (cmd === "test_llm_connection_cmd") return Promise.resolve({ success: true });
        return Promise.resolve(null);
      });
    }

    const PRIMARY = {
      api_key: "sk-first",
      base_url: DEEPSEEK_URL,
      model: "deepseek-chat",
      provider: "deepseek",
    };

    it("puts the Base URL field above the API key field", async () => {
      const wrapper = mountPage();
      await flushPromises();
      await wrapper.find('input[type="radio"][value="custom"]').setValue(true);
      await flushPromises();

      const labels = wrapper.findAll(".field-label").map((l) => l.text());
      expect(labels.indexOf("Base URL")).toBeGreaterThan(-1);
      expect(labels.indexOf("Base URL")).toBeLessThan(labels.indexOf("API Key"));
    });

    it("remembers the config once the connection test succeeds", async () => {
      mockCustomWith(PRIMARY);
      const wrapper = mountPage({ Teleport: true });
      await flushPromises();

      const testBtn = wrapper.findAll("button").find((b) => b.text().includes("测试连接"));
      await testBtn.trigger("click");
      await flushPromises();

      expect(lastSavedPresets()).toEqual([
        {
          base_url: DEEPSEEK_URL,
          api_key: "sk-first",
          model: "deepseek-chat",
          provider: "deepseek",
          thinking_enabled: false,
        },
      ]);

      // The dropdown shows up and is preselected with the tested URL.
      const select = wrapper.find("select.preset-select");
      expect(select.exists()).toBe(true);
      expect(select.element.value).toBe(DEEPSEEK_URL);
      expect(wrapper.find(".test-result").text()).toContain("已记住这套配置");
    });

    it("overwrites the entry when the same Base URL is tested again", async () => {
      mockCustomWith(PRIMARY);
      const wrapper = mountPage({ Teleport: true });
      await flushPromises();

      const testBtn = () => wrapper.findAll("button").find((b) => b.text().includes("测试连接"));
      await testBtn().trigger("click");
      await flushPromises();

      await wrapper.find('input[placeholder="sk-..."]').setValue("sk-second");
      await wrapper.find('input[placeholder="gpt-4o-mini"]').setValue("deepseek-reasoner");
      await flushPromises();
      await testBtn().trigger("click");
      await flushPromises();

      const presets = lastSavedPresets();
      expect(presets).toHaveLength(1);
      expect(presets[0]).toMatchObject({
        base_url: DEEPSEEK_URL,
        api_key: "sk-second",
        model: "deepseek-reasoner",
      });
    });

    it("switches Base URL, API key and model from the dropdown", async () => {
      const OPENAI_PRESET = {
        base_url: "https://api.openai.com/v1",
        api_key: "sk-openai",
        model: "gpt-4o",
        provider: "openai",
        thinking_enabled: true,
      };
      const DEEPSEEK_PRESET = {
        base_url: DEEPSEEK_URL,
        api_key: "sk-deepseek",
        model: "deepseek-reasoner",
        provider: "deepseek",
        thinking_enabled: false,
      };
      mockCustomWith(OPENAI_PRESET, [OPENAI_PRESET, DEEPSEEK_PRESET]);
      const wrapper = mountPage({ Teleport: true });
      await flushPromises();

      const select = wrapper.find("select.preset-select");
      expect(select.element.value).toBe("https://api.openai.com/v1");

      await select.setValue(DEEPSEEK_URL);
      await flushPromises();

      expect(wrapper.find('input[placeholder="https://api.openai.com/v1"]').element.value).toBe(DEEPSEEK_URL);
      expect(wrapper.find('input[placeholder="sk-..."]').element.value).toBe("sk-deepseek");
      expect(wrapper.find('input[placeholder="gpt-4o-mini"]').element.value).toBe("deepseek-reasoner");

      const configSaves = savedCalls.filter((c) => c.cmd === "save_llm_config_cmd");
      expect(configSaves[configSaves.length - 1].config).toMatchObject({
        base_url: DEEPSEEK_URL,
        api_key: "sk-deepseek",
        model: "deepseek-reasoner",
        provider: "deepseek",
      });
    });

    it("deletes the remembered preset sitting at the current Base URL", async () => {
      mockCustomWith(PRIMARY, [
        PRIMARY,
        { base_url: "https://api.openai.com/v1", api_key: "sk-openai", model: "gpt-4o", provider: "openai" },
      ].map((p) => ({ thinking_enabled: false, ...p })));
      const wrapper = mountPage({ Teleport: true });
      await flushPromises();

      const deleteBtn = wrapper.find(".btn-delete-preset");
      expect(deleteBtn.exists()).toBe(true);
      expect(deleteBtn.attributes("disabled")).toBeUndefined();

      await deleteBtn.trigger("click");
      expect(wrapper.text()).toContain("删除已记住的配置");

      await wrapper.find(".confirm-btn.confirm").trigger("click");
      await flushPromises();

      const presets = lastSavedPresets();
      expect(presets).toHaveLength(1);
      expect(presets[0].base_url).toBe("https://api.openai.com/v1");
      // Nothing left to delete for the current URL.
      expect(wrapper.find(".btn-delete-preset").attributes("disabled")).toBeDefined();
    });

    it("disables the delete button when the current URL is not remembered", async () => {
      mockCustomWith({
        api_key: "sk-other",
        base_url: "https://example.test/v1",
        model: "custom-model",
        provider: "openai",
      }, [{ base_url: DEEPSEEK_URL, api_key: "sk-d", model: "deepseek-chat", provider: "deepseek" }]);
      const wrapper = mountPage({ Teleport: true });
      await flushPromises();

      expect(wrapper.find(".btn-delete-preset").attributes("disabled")).toBeDefined();
    });
  });
});
