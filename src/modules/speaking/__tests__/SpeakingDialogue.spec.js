import { beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { createMemoryHistory, createRouter } from "vue-router";
import { createPinia, setActivePinia } from "pinia";
import * as api from "@/shared/api.js";
import { setLocale } from "@/shared/i18n";
import * as speechTts from "@/shared/speechTts.js";
import * as learningContext from "@/shared/learningContext.js";
import { getLiveSessionSnapshot, clearLiveSessionSnapshots } from "../liveSessionCache.js";

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
        component: { template: "<div class='summary-page'/>" },
      },
      { path: "/learn/speaking", name: "speaking", component: { template: "<div/>" } },
    ],
  });
}

describe("SpeakingDialogue", () => {
  let mockInvoke;
  let speakTextSpy;
  let stopSpeechSpy;

  beforeEach(() => {
    setActivePinia(createPinia());
    setLocale("en", { persist: false });
    clearLiveSessionSnapshots();

    speakTextSpy = vi.spyOn(speechTts, "speakText").mockImplementation((_text, _lang, { onEnd } = {}) => {
      onEnd?.();
      return true;
    });
    stopSpeechSpy = vi.spyOn(speechTts, "stopSpeech").mockImplementation(() => {});

    vi.spyOn(learningContext, "loadLearningContext").mockResolvedValue({
      user: { id: "u1", native_language: "zh" },
      targetLang: "es",
      nativeLang: "zh",
      cefr: "A1",
    });

    mockInvoke = vi.fn().mockImplementation((cmd) => {
      if (cmd === "get_target_language_cmd") return Promise.resolve("es");
      if (cmd === "speaking_start_session_cmd") {
        return Promise.resolve({
          session_id: "sess-1",
          topic_id: "greetings",
          turn: 1,
          total_turns: 8,
          ai_text: "Hola, ¿cómo estás?",
          voice_name: "Aoede",
          goals: ["g1", "g2", "g3"],
          system_instruction: "You are a friendly language tutor.",
          live_model: "gemini-3.8-live",
          live_base_url: "generativelanguage.googleapis.com",
          live_api_key: "key-123",
        });
      }
      if (cmd === "speaking_translate_cmd") {
        return Promise.resolve("Hello, how are you?");
      }
      if (cmd === "speaking_hint_cmd") {
        return Promise.resolve("Estoy bien, gracias.");
      }
      if (cmd === "speaking_record_live_turn_cmd") {
        return Promise.resolve(2);
      }
      return Promise.resolve(null);
    });
    api.__setInvoke(mockInvoke);
  });

  it("calls speaking_start_session_cmd with user context on mount", async () => {
    const router = makeRouter();
    await router.push({ name: "speaking-dialogue", params: { topicId: "greetings" } });
    mount(SpeakingDialogue, {
      global: { plugins: [router] },
      props: { topicId: "greetings" },
    });

    await flushPromises();

    const startCall = mockInvoke.mock.calls.find(([cmd]) => cmd === "speaking_start_session_cmd");
    expect(startCall).toBeDefined();
    expect(startCall[1]).toMatchObject({
      userId: "u1",
      topicId: "greetings",
      targetLang: "es",
      nativeLang: "zh",
      cefrLevel: "A1",
    });
  });

  it("renders opening AI text and scenario micro-goals", async () => {
    const router = makeRouter();
    await router.push({ name: "speaking-dialogue", params: { topicId: "greetings" } });
    const wrapper = mount(SpeakingDialogue, {
      global: { plugins: [router] },
      props: { topicId: "greetings" },
    });

    await flushPromises();

    expect(wrapper.text()).toContain("Hola, ¿cómo estás?");
    expect(wrapper.find(".goals-bar").exists()).toBe(true);
    expect(wrapper.findAll(".goal-chip").length).toBe(3);
    expect(wrapper.find(".goals-counter").text()).toContain("0/3");
    expect(wrapper.find(".voice-badge").text()).toContain("Aoede");
    expect(stopSpeechSpy).toHaveBeenCalled();
    expect(speakTextSpy).not.toHaveBeenCalled();
  });

  it("translates AI bubble when translate button is clicked", async () => {
    const router = makeRouter();
    await router.push({ name: "speaking-dialogue", params: { topicId: "greetings" } });
    const wrapper = mount(SpeakingDialogue, {
      global: { plugins: [router] },
      props: { topicId: "greetings" },
    });

    await flushPromises();

    const translateBtn = wrapper.findAll(".pill-action-btn").find((b) => b.text().includes("Translate"));
    expect(translateBtn).toBeDefined();

    await translateBtn.trigger("click");
    await flushPromises();

    expect(mockInvoke).toHaveBeenCalledWith(
      "speaking_translate_cmd",
      expect.objectContaining({ sessionId: "sess-1", aiText: "Hola, ¿cómo estás?" })
    );
    expect(wrapper.find(".bubble-translation").text()).toBe("Hello, how are you?");
  });

  it("loads and displays hint when hint button is clicked", async () => {
    const router = makeRouter();
    await router.push({ name: "speaking-dialogue", params: { topicId: "greetings" } });
    const wrapper = mount(SpeakingDialogue, {
      global: { plugins: [router] },
      props: { topicId: "greetings" },
    });

    await flushPromises();

    const hintBtn = wrapper.find(".rescue-chip.hint");
    expect(hintBtn.exists()).toBe(true);

    await hintBtn.trigger("click");
    await flushPromises();

    expect(mockInvoke).toHaveBeenCalledWith(
      "speaking_hint_cmd",
      expect.objectContaining({ sessionId: "sess-1", aiText: "Hola, ¿cómo estás?" })
    );
    expect(wrapper.find(".hint-box").exists()).toBe(true);
    expect(wrapper.find(".hint-text").text()).toBe("Estoy bien, gracias.");
    expect(speakTextSpy).toHaveBeenCalledWith("Estoy bien, gracias.", "es");
  });

  it("toggles mic mute state on mic button click", async () => {
    const router = makeRouter();
    await router.push({ name: "speaking-dialogue", params: { topicId: "greetings" } });
    const wrapper = mount(SpeakingDialogue, {
      global: { plugins: [router] },
      props: { topicId: "greetings" },
    });

    await flushPromises();

    const micBtn = wrapper.find(".mic-toggle-btn");
    expect(micBtn.classes()).toContain("active");
    expect(micBtn.text()).toContain("Pause to think");

    await micBtn.trigger("click");
    await flushPromises();

    expect(micBtn.classes()).toContain("muted");
    expect(micBtn.text()).toContain("Resume mic");
  });

  it("navigates to speaking-summary and saves snapshot on finishEarly", async () => {
    const router = makeRouter();
    await router.push({ name: "speaking-dialogue", params: { topicId: "greetings" } });
    const wrapper = mount(SpeakingDialogue, {
      global: { plugins: [router] },
      props: { topicId: "greetings" },
    });

    await flushPromises();

    const finishBtn = wrapper.find(".finish-btn");
    await finishBtn.trigger("click");
    await flushPromises();

    expect(router.currentRoute.value.name).toBe("speaking-summary");
    expect(router.currentRoute.value.query.sessionId).toBe("sess-1");

    const snapshot = getLiveSessionSnapshot("sess-1");
    expect(snapshot).not.toBeNull();
    expect(snapshot.totalGoalsCount).toBe(3);
  });

  it("scrolls chat stream to bottom when messages or streaming text update", async () => {
    const router = makeRouter();
    await router.push({ name: "speaking-dialogue", params: { topicId: "greetings" } });
    const wrapper = mount(SpeakingDialogue, {
      global: { plugins: [router] },
      props: { topicId: "greetings" },
    });

    await flushPromises();

    const streamEl = wrapper.find(".chat-stream").element;
    expect(streamEl).toBeDefined();

    // Mock scrollHeight
    Object.defineProperty(streamEl, "scrollHeight", {
      value: 500,
      configurable: true,
      writable: true,
    });

    // Push new AI message into live session messages
    wrapper.vm.live.messages.value = [
      {
        id: "msg-1",
        role: "ai",
        text: "Hola, ¿cómo estás?",
        streaming: true,
      },
    ];

    await flushPromises();

    expect(streamEl.scrollTop).toBe(500);

    // Stream text update on the same active message
    streamEl.scrollHeight = 850;
    wrapper.vm.live.messages.value[0].text = "Hola, ¿cómo estás hoy?";

    await flushPromises();

    expect(streamEl.scrollTop).toBe(850);

    // Verify coaching on a user message triggers scroll even when an AI message is already after it
    wrapper.vm.live.messages.value = [
      {
        id: "msg-user-1",
        role: "user",
        text: "Me gustaría un café.",
        coaching: null,
      },
      {
        id: "msg-ai-2",
        role: "ai",
        text: "¡Claro! ¿Con leche o solo?",
        streaming: false,
      },
    ];
    await flushPromises();

    streamEl.scrollHeight = 1200;
    wrapper.vm.live.messages.value[0].coaching = {
      betterExpression: "Quisiera un café, por favor.",
      tipNative: "Use quisiera for polite requests.",
      total: 92,
    };
    await flushPromises();

    expect(streamEl.scrollTop).toBe(1200);
  });
});
