import { beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { createMemoryHistory, createRouter } from "vue-router";
import { createPinia, setActivePinia } from "pinia";
import * as api from "@/shared/api.js";
import { setLocale } from "@/shared/i18n";
import * as speechTts from "@/shared/speechTts.js";
import * as learningContext from "@/shared/learningContext.js";

vi.mock("@tauri-apps/plugin-shell", () => ({}));

const SpeakingDialogue = (await import("@/modules/speaking/SpeakingDialogue.vue")).default;

function makeRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      {
        path: "/learn/speaking/:topicId",
        name: "speaking-dialogue",
        component: SpeakingDialogue,
        props: true,
      },
      {
        path: "/learn/speaking/:topicId/summary",
        name: "speaking-summary",
        component: { template: "<div/>" },
      },
      { path: "/learn/speaking", name: "speaking", component: { template: "<div/>" } },
    ],
  });
}

describe("SpeakingDialogue", () => {
  let mockInvoke;
  let speakTextSpy;

  beforeEach(() => {
    setActivePinia(createPinia());
    setLocale("en", { persist: false });
    speakTextSpy = vi.spyOn(speechTts, "speakText").mockImplementation((_text, _lang, { onEnd } = {}) => {
      onEnd?.();
      return true;
    });
    vi.spyOn(learningContext, "loadLearningContext").mockResolvedValue({
      user: { id: "u1", native_language: "zh" },
      targetLang: "es",
      nativeLang: "zh",
      cefr: "A1",
    });
    mockInvoke = vi.fn().mockImplementation((cmd, args) => {
      if (cmd === "get_target_language_cmd") return Promise.resolve("es");
      if (cmd === "speaking_start_session_cmd") {
        return Promise.resolve({
          session_id: "sess-1",
          turn: 1,
          total_turns: 8,
          ai_text: "Hola, ¿cómo estás?",
        });
      }
      return Promise.resolve(null);
    });
    api.__setInvoke(mockInvoke);
  });

  it("leaves preparing state when native TTS never signals completion", async () => {
    speakTextSpy.mockImplementation((_text, _lang, { onStart } = {}) => {
      onStart?.();
      return true;
    });

    const router = makeRouter();
    await router.push({ name: "speaking-dialogue", params: { topicId: "greetings" } });
    const wrapper = mount(SpeakingDialogue, {
      global: { plugins: [router] },
      props: { topicId: "greetings" },
    });

    await flushPromises();

    expect(wrapper.text()).not.toMatch(/Preparing session/i);
    expect(wrapper.find(".record-btn").exists()).toBe(true);
  });

  it("shows Amiga icon as AI avatar", async () => {
    const router = makeRouter();
    await router.push({ name: "speaking-dialogue", params: { topicId: "greetings" } });
    const wrapper = mount(SpeakingDialogue, {
      global: { plugins: [router] },
      props: { topicId: "greetings" },
    });

    await flushPromises();

    const img = wrapper.find(".ai-avatar img");
    expect(img.exists()).toBe(true);
    expect(img.attributes("src")).toBe("/amiga-icon.png");
  });

  it("starts session with the current target language", async () => {
    const router = makeRouter();
    await router.push({ name: "speaking-dialogue", params: { topicId: "self-intro" } });
    mount(SpeakingDialogue, {
      global: { plugins: [router] },
      props: { topicId: "self-intro" },
    });

    await flushPromises();

    const startCall = mockInvoke.mock.calls.find(([cmd]) => cmd === "speaking_start_session_cmd");
    expect(startCall?.[1]).toMatchObject({
      targetLang: "es",
      nativeLang: "zh",
    });
  });

  it("shows dialogue UI when session boot succeeds", async () => {
    const router = makeRouter();
    await router.push({ name: "speaking-dialogue", params: { topicId: "greetings" } });
    const wrapper = mount(SpeakingDialogue, {
      global: { plugins: [router] },
      props: { topicId: "greetings" },
    });

    await flushPromises();

    expect(wrapper.text()).toContain("Start speaking");
    expect(wrapper.text()).toContain("1/8");
    expect(speakTextSpy).toHaveBeenCalled();
  });
});
