import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { createMemoryHistory, createRouter } from "vue-router";
import * as api from "@/shared/api.js";
import * as speechTts from "@/shared/speechTts.js";
import { setLocale } from "@/shared/i18n";
import { clearTranslationCache } from "@/shared/translationCache.js";
import VocabPage from "@/modules/vocab/VocabPage.vue";

describe("VocabPage navigation", () => {
  let settingsStore;
  let speakSpy;
  let stopSpy;

  beforeEach(() => {
    setActivePinia(createPinia());
    setLocale("zh", { persist: false });
    clearTranslationCache();
    settingsStore = {};
    speakSpy = vi.spyOn(speechTts, "speakText").mockImplementation((_text, _lang, opts = {}) => {
      opts.onStart?.();
      opts.onEnd?.();
      return true;
    });
    stopSpy = vi.spyOn(speechTts, "stopSpeech").mockImplementation(() => {});
    api.__setInvoke(vi.fn((command, args) => {
      if (command === "get_current_user") return Promise.resolve({ id: "u1" });
      if (command === "get_target_language_cmd") return Promise.resolve("es");
      if (command === "get_setting_cmd") return Promise.resolve(settingsStore[args?.key] ?? null);
      if (command === "save_setting_cmd") {
        settingsStore[args?.key] = args?.value;
        return Promise.resolve(null);
      }
      if (command === "get_user_vocab_stats_by_level_cmd") {
        return Promise.resolve([
          { level: "A1", total: 3, mastered: 0, seen: 1, unseen: 2 },
        ]);
      }
      if (command === "get_user_vocab_by_level_cmd") {
        return Promise.resolve([
          { id: "w1", word: "hola", mastery: null },
          { id: "w2", word: "mundo", mastery: 1 },
          { id: "w3", word: "gracias", mastery: null },
        ]);
      }
      if (command === "translate_word_cmd") {
        return Promise.resolve({
          translation: "你好",
          pos: "interj",
          example: `Ejemplo con ${args?.word || "hola"}.`,
        });
      }
      if (command === "update_word_mastery_cmd") return Promise.resolve(null);
      return Promise.resolve(null);
    }));
  });

  afterEach(() => {
    speakSpy?.mockRestore();
    stopSpy?.mockRestore();
    api.__resetInvoke();
    clearTranslationCache();
  });

  it("returns from the word overview to the learning parent", async () => {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: "/learn", name: "learn", component: { template: "<div />" } },
        { path: "/learn/vocab", name: "vocab", component: VocabPage, meta: { parent: "learn" } },
      ],
    });
    await router.push("/learn/vocab");
    await router.isReady();
    const replaceSpy = vi.spyOn(router, "replace");
    const wrapper = mount(VocabPage, { global: { plugins: [router] } });
    await flushPromises();

    const backButton = wrapper.find(".overview-header .back-btn");
    expect(backButton.exists()).toBe(true);
    await backButton.trigger("click");

    expect(replaceSpy).toHaveBeenCalledWith({ name: "learn" });
  });

  it("opens a dedicated study view with prev/next and advances after known/unknown", async () => {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: "/learn/vocab", name: "vocab", component: VocabPage, meta: { parent: "learn" } },
      ],
    });
    await router.push("/learn/vocab");
    await router.isReady();
    const wrapper = mount(VocabPage, { global: { plugins: [router] } });
    await flushPromises();

    await wrapper.find(".level-card").trigger("click");
    await flushPromises();

    const chips = wrapper.findAll(".word-chip");
    expect(chips.length).toBe(3);
    await chips[0].trigger("click");
    await flushPromises();

    const popup = wrapper.findComponent({ name: "WordPopup" });
    expect(popup.exists()).toBe(true);
    expect(popup.props("layout")).toBe("page");
    expect(popup.props("showNav")).toBe(true);
    expect(popup.props("word")).toBe("hola");
    expect(popup.props("canPrev")).toBe(false);
    expect(popup.props("canNext")).toBe(true);
    expect(wrapper.find(".study-progress").text()).toContain("1/3");

    await popup.vm.$emit("next");
    await flushPromises();
    expect(wrapper.findComponent({ name: "WordPopup" }).props("word")).toBe("mundo");
    expect(wrapper.find(".study-progress").text()).toContain("2/3");

    await wrapper.findComponent({ name: "WordPopup" }).vm.$emit("known");
    await flushPromises();
    expect(wrapper.findComponent({ name: "WordPopup" }).props("word")).toBe("gracias");
    expect(wrapper.find(".study-progress").text()).toContain("3/3");

    await wrapper.findComponent({ name: "WordPopup" }).vm.$emit("unknown");
    await flushPromises();
    // Last word: return to list
    expect(wrapper.findComponent({ name: "WordPopup" }).exists()).toBe(false);
    expect(wrapper.findAll(".word-chip").length).toBe(3);
  });

  it("auto-plays word and example only when known/unknown advances to next word and persists toggle", async () => {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: "/learn/vocab", name: "vocab", component: VocabPage, meta: { parent: "learn" } },
      ],
    });
    await router.push("/learn/vocab");
    await router.isReady();
    const wrapper = mount(VocabPage, { global: { plugins: [router] } });
    await flushPromises();

    await wrapper.find(".level-card").trigger("click");
    await flushPromises();

    // Initial tap to open study view should NOT auto-play
    await wrapper.findAll(".word-chip")[0].trigger("click");
    await flushPromises();
    expect(speakSpy).not.toHaveBeenCalled();

    const toggle = wrapper.find(".auto-play-toggle");
    expect(toggle.exists()).toBe(true);
    expect(toggle.attributes("role")).toBe("switch");
    expect(toggle.attributes("aria-checked")).toBe("true");

    // Clicking prev/next should NOT auto-play
    await wrapper.findComponent({ name: "WordPopup" }).vm.$emit("next");
    await flushPromises();
    expect(wrapper.findComponent({ name: "WordPopup" }).props("word")).toBe("mundo");
    expect(speakSpy).not.toHaveBeenCalled();

    await wrapper.findComponent({ name: "WordPopup" }).vm.$emit("prev");
    await flushPromises();
    expect(wrapper.findComponent({ name: "WordPopup" }).props("word")).toBe("hola");
    expect(speakSpy).not.toHaveBeenCalled();

    // Clicking known advances to "mundo" and auto-plays word + example
    await wrapper.findComponent({ name: "WordPopup" }).vm.$emit("known");
    await flushPromises();
    expect(wrapper.findComponent({ name: "WordPopup" }).props("word")).toBe("mundo");
    expect(speakSpy.mock.calls.map((c) => c[0])).toEqual(["mundo", "Ejemplo con mundo."]);

    // Turn switch off and persist
    speakSpy.mockClear();
    await toggle.trigger("click");
    await flushPromises();
    expect(toggle.attributes("aria-checked")).toBe("false");
    expect(settingsStore.vocab_auto_play).toBe("false");

    // Clicking unknown with switch off advances without auto-play
    await wrapper.findComponent({ name: "WordPopup" }).vm.$emit("unknown");
    await flushPromises();
    expect(wrapper.findComponent({ name: "WordPopup" }).props("word")).toBe("gracias");
    expect(speakSpy).not.toHaveBeenCalled();

    // Turn switch back on and click known on the last word -> exits study without speaking
    await toggle.trigger("click");
    await flushPromises();
    expect(settingsStore.vocab_auto_play).toBe("true");
    await wrapper.findComponent({ name: "WordPopup" }).vm.$emit("known");
    await flushPromises();
    expect(wrapper.findComponent({ name: "WordPopup" }).exists()).toBe(false);
    expect(speakSpy).not.toHaveBeenCalled();
    wrapper.unmount();

    // Re-mounting restores saved false state
    settingsStore.vocab_auto_play = "false";
    const wrapper2 = mount(VocabPage, { global: { plugins: [router] } });
    await flushPromises();
    await wrapper2.find(".level-card").trigger("click");
    await flushPromises();
    await wrapper2.findAll(".word-chip")[0].trigger("click");
    await flushPromises();
    expect(wrapper2.find(".auto-play-toggle").attributes("aria-checked")).toBe("false");
    wrapper2.unmount();
  });
});
