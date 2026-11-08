import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { createRouter, createMemoryHistory } from "vue-router";
import * as api from "@/shared/api.js";
import * as speechTtsModule from "@/shared/speechTts.js";

const NewsReader = (await import("@/modules/news/NewsReader.vue")).default;

function makeRouter(id = 1) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: "/news/:id", name: "reader", component: NewsReader, props: true },
    ],
  });
  router.push(`/news/${id}`);
  return router;
}

describe("NewsReader Sentence Highlighting & Playback", () => {
  let speakCalls = [];
  let currentOptions = null;

  beforeEach(() => {
    setActivePinia(createPinia());
    speakCalls = [];
    currentOptions = null;

    window.HTMLElement.prototype.scrollIntoView = vi.fn();

    vi.spyOn(speechTtsModule, "canUseSpeechTts").mockReturnValue(true);
    vi.spyOn(speechTtsModule, "speakText").mockImplementation((text, lang, opts) => {
      speakCalls.push({ text, lang });
      currentOptions = opts;
      opts?.onStart?.();
      return true;
    });
    vi.spyOn(speechTtsModule, "stopSpeech").mockImplementation(() => {});

    api.__setInvoke(vi.fn((command) => {
      if (command === "get_current_user") return Promise.resolve({ id: "u1", native_language: "zh" });
      if (command === "get_target_language_cmd") return Promise.resolve("es");
      if (command === "get_learning_goals_cmd") return Promise.resolve([{ target_language: "es", cefr_level: "B1" }]);
      if (command === "get_article_cmd") {
        return Promise.resolve({
          id: 1,
          original_title: "Titular de Noticias",
          rewritten_body: "Primera frase del parrafo. Segunda frase del parrafo.\n\nSegundo parrafo de la noticia.",
          source: "https://example.com/noticias",
        });
      }
      if (command === "ensure_words_seen_cmd") return Promise.resolve();
      return Promise.resolve(null);
    }));
  });

  afterEach(() => {
    api.__resetInvoke();
    vi.restoreAllMocks();
  });

  it("highlights title then sentences sequentially and triggers auto-scroll", async () => {
    const router = makeRouter(1);
    await router.isReady();

    const wrapper = mount(NewsReader, {
      props: { id: 1 },
      global: {
        plugins: [router],
        stubs: { WordPopup: true },
      },
    });

    await flushPromises();

    // Verify initial state
    const titleEl = wrapper.find(".header-title");
    expect(titleEl.exists()).toBe(true);
    expect(titleEl.classes()).not.toContain("is-playing");

    const sentences = wrapper.findAll(".article-sentence");
    expect(sentences.length).toBe(3); // 2 in first paragraph, 1 in second
    expect(sentences[0].classes()).not.toContain("is-playing");
    expect(sentences[1].classes()).not.toContain("is-playing");
    expect(sentences[2].classes()).not.toContain("is-playing");

    // Click read button
    const readBtn = wrapper.find(".read-btn");
    expect(readBtn.exists()).toBe(true);
    await readBtn.trigger("click");
    await flushPromises();

    // 1. Title is playing
    expect(speakCalls.length).toBe(1);
    expect(speakCalls[0].text).toBe("Titular de Noticias");
    expect(titleEl.classes()).toContain("is-playing");
    expect(sentences[0].classes()).not.toContain("is-playing");

    // 2. Title ends -> Sentence 0-0 plays
    currentOptions.onEnd();
    await flushPromises();

    expect(speakCalls.length).toBe(2);
    expect(speakCalls[1].text).toBe("Primera frase del parrafo.");
    expect(titleEl.classes()).not.toContain("is-playing");
    expect(sentences[0].classes()).toContain("is-playing");
    expect(sentences[1].classes()).not.toContain("is-playing");
    expect(window.HTMLElement.prototype.scrollIntoView).toHaveBeenCalled();

    // 3. Sentence 0-0 ends -> Sentence 0-1 plays
    currentOptions.onEnd();
    await flushPromises();

    expect(speakCalls.length).toBe(3);
    expect(speakCalls[2].text).toBe("Segunda frase del parrafo.");
    expect(sentences[0].classes()).not.toContain("is-playing");
    expect(sentences[1].classes()).toContain("is-playing");
    expect(sentences[2].classes()).not.toContain("is-playing");

    // 4. Sentence 0-1 ends -> Sentence 1-0 plays
    currentOptions.onEnd();
    await flushPromises();

    expect(speakCalls.length).toBe(4);
    expect(speakCalls[3].text).toBe("Segundo parrafo de la noticia.");
    expect(sentences[1].classes()).not.toContain("is-playing");
    expect(sentences[2].classes()).toContain("is-playing");

    // 5. Final sentence ends -> Playback resets
    currentOptions.onEnd();
    await flushPromises();

    expect(titleEl.classes()).not.toContain("is-playing");
    expect(sentences[2].classes()).not.toContain("is-playing");
  });

  it("stops reading when read-btn is toggled off", async () => {
    const router = makeRouter(1);
    await router.isReady();

    const wrapper = mount(NewsReader, {
      props: { id: 1 },
      global: {
        plugins: [router],
        stubs: { WordPopup: true },
      },
    });

    await flushPromises();

    const readBtn = wrapper.find(".read-btn");
    await readBtn.trigger("click");
    await flushPromises();

    const titleEl = wrapper.find(".header-title");
    expect(titleEl.classes()).toContain("is-playing");

    // Toggle off
    await readBtn.trigger("click");
    await flushPromises();

    expect(titleEl.classes()).not.toContain("is-playing");
  });
});
