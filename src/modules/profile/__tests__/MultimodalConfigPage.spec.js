import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { createRouter, createMemoryHistory } from "vue-router";
import * as api from "@/shared/api.js";
import { setLocale } from "@/shared/i18n/index.js";
import * as speechTts from "@/shared/speechTts.js";

const MultimodalConfigPage = (await import("@/modules/profile/MultimodalConfigPage.vue")).default;

function makeRoutes() {
  return [
    { path: "/profile/multimodal-config", name: "multimodal-config", component: MultimodalConfigPage },
  ];
}

describe("MultimodalConfigPage", () => {
  let mockInvoke;

  beforeEach(() => {
    setActivePinia(createPinia());
    mockInvoke = vi.fn();
    api.__setInvoke(mockInvoke);
    setLocale("zh", { persist: false });
    speechTts.__resetSpeechTtsForTests();
  });

  afterEach(() => {
    speechTts.__resetSpeechTtsForTests();
    vi.restoreAllMocks();
  });

  function mountPage() {
    const router = createRouter({ history: createMemoryHistory(), routes: makeRoutes() });
    return mount(MultimodalConfigPage, {
      global: {
        plugins: [router],
        stubs: { Teleport: true },
      },
    });
  }

  it("renders global reading voice options including hidden Fola voice and defaults to Fola", async () => {
    mockInvoke.mockImplementation((cmd) => {
      if (cmd === "get_multimodal_config_cmd") {
        return Promise.resolve({
          mode: "builtin",
          builtin: {
            base_url: "https://generativelanguage.googleapis.com",
            api_key: "ai-test-key",
            model: "gemini-3.8-live",
          },
          custom: {
            base_url: "https://generativelanguage.googleapis.com",
            api_key: "",
            model: "gemini-3.8-live",
          },
        });
      }
      if (cmd === "get_setting_cmd") return Promise.resolve(null);
      if (cmd === "get_current_user") return Promise.resolve({ id: "u1", target_language: "es" });
      return Promise.resolve(null);
    });

    const wrapper = mountPage();
    await flushPromises();

    expect(wrapper.text()).toContain("全局阅读默认音色");
    const chips = wrapper.findAll(".voice-chip");
    expect(chips.length).toBe(7);

    const folaChip = chips.find((c) => c.text().includes("Fola"));
    expect(folaChip).toBeTruthy();
    expect(folaChip.text()).toContain("隐藏");
    expect(folaChip.classes()).toContain("selected");
  });

  it("selects and persists a new default reading voice when clicked", async () => {
    const persisted = {};
    mockInvoke.mockImplementation((cmd, args) => {
      if (cmd === "get_multimodal_config_cmd") {
        return Promise.resolve({
          mode: "builtin",
          builtin: {
            base_url: "https://generativelanguage.googleapis.com",
            api_key: "ai-test-key",
            model: "gemini-3.8-live",
          },
          custom: {},
        });
      }
      if (cmd === "get_setting_cmd") {
        return Promise.resolve(persisted[args?.key] || null);
      }
      if (cmd === "save_setting_cmd") {
        persisted[args?.key] = args?.value;
        return Promise.resolve(null);
      }
      if (cmd === "get_current_user") return Promise.resolve({ id: "u1", target_language: "es" });
      return Promise.resolve(null);
    });

    const wrapper = mountPage();
    await flushPromises();

    const aoedeChip = wrapper.findAll(".voice-chip").find((c) => c.text().includes("Aoede"));
    expect(aoedeChip).toBeTruthy();
    await aoedeChip.trigger("click");
    await flushPromises();

    expect(persisted.gemini_live_voice).toBe("Aoede");
    expect(aoedeChip.classes()).toContain("selected");
    expect(wrapper.find(".save-toast").text()).toContain("Aoede");
  });

  it("tests the selected voice and allows stopping playback", async () => {
    mockInvoke.mockImplementation((cmd, args) => {
      if (cmd === "get_multimodal_config_cmd") {
        return Promise.resolve({
          mode: "builtin",
          builtin: {
            base_url: "https://generativelanguage.googleapis.com",
            api_key: "ai-test-key",
            model: "gemini-3.8-live",
          },
          custom: {},
        });
      }
      if (cmd === "get_setting_cmd") {
        if (args?.key === "gemini_live_voice") return Promise.resolve("Fola");
        return Promise.resolve(null);
      }
      if (cmd === "get_current_user") return Promise.resolve({ id: "u1", target_language: "es" });
      return Promise.resolve(null);
    });

    let capturedCallbacks = null;
    const previewSpy = vi.spyOn(speechTts, "previewGeminiLiveVoice").mockImplementation((opts) => {
      capturedCallbacks = opts;
      return true;
    });
    const stopSpy = vi.spyOn(speechTts, "stopSpeech").mockImplementation(() => {});

    const wrapper = mountPage();
    await flushPromises();

    const testVoiceBtn = wrapper.find(".btn-voice-test");
    expect(testVoiceBtn.exists()).toBe(true);
    expect(testVoiceBtn.text()).toContain("试听音色");

    await testVoiceBtn.trigger("click");
    expect(previewSpy).toHaveBeenCalledTimes(1);
    expect(capturedCallbacks.voiceName).toBe("Fola");
    expect(capturedCallbacks.lang).toBe("es");
    expect(testVoiceBtn.text()).toContain("正在合成");

    capturedCallbacks.onStart();
    await flushPromises();
    expect(testVoiceBtn.text()).toContain("停止试听");

    await testVoiceBtn.trigger("click");
    expect(stopSpy).toHaveBeenCalled();
    expect(testVoiceBtn.text()).toContain("试听音色");
  });
});
