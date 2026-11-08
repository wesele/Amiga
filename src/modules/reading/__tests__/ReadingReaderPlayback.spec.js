import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { createRouter, createMemoryHistory } from "vue-router";
import * as api from "@/shared/api.js";
import * as speechTtsModule from "@/shared/speechTts.js";

const ReadingReader = (await import("@/modules/reading/ReadingReader.vue")).default;

async function mountPage(id = 201, query = {}) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: "/learn/reading/:id", component: ReadingReader, props: true },
    ],
  });
  await router.push({ path: `/learn/reading/${id}`, query });
  await router.isReady();

  return mount(ReadingReader, {
    props: { id },
    global: {
      plugins: [router],
      stubs: { WordPopup: true },
    },
  });
}

describe("ReadingReader Sentence Highlighting & Playback", () => {
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
  });

  afterEach(() => {
    api.__resetInvoke();
    vi.restoreAllMocks();
  });

  it("plays non-imported article with title and sentence highlights sequentially", async () => {
    const readingArticle = {
      id: 201,
      user_id: "u1",
      title: "Cuento Corto",
      body: "Había una vez en un bosque lejano. Vivía un conejo veloz.\n\nEl zorro lo miraba.",
      cefr_level: "A2",
      created_at: "2026-08-01T10:00:00",
    };

    api.__setInvoke(vi.fn((command) => {
      if (command === "get_current_user") return Promise.resolve({ id: "u1", native_language: "zh" });
      if (command === "get_target_language_cmd") return Promise.resolve("es");
      if (command === "get_learning_goals_cmd") return Promise.resolve([{ target_language: "es", cefr_level: "A2" }]);
      if (command === "get_reading_article_cmd") return Promise.resolve(readingArticle);
      if (command === "mark_reading_article_read_cmd") return Promise.resolve();
      return Promise.resolve(null);
    }));

    const wrapper = await mountPage(201, {});
    await flushPromises();

    const titleEl = wrapper.find(".header-title");
    expect(titleEl.text()).toBe("Cuento Corto");
    expect(titleEl.classes()).not.toContain("is-playing");

    const sentences = wrapper.findAll(".article-sentence");
    expect(sentences.length).toBe(3); // 2 in para 1, 1 in para 2
    expect(sentences[0].classes()).not.toContain("is-playing");

    // Start read aloud
    const readBtn = wrapper.find(".btn-read");
    expect(readBtn.exists()).toBe(true);
    await readBtn.trigger("click");
    await flushPromises();

    // 1. Title is playing
    expect(speakCalls.length).toBe(1);
    expect(speakCalls[0].text).toBe("Cuento Corto");
    expect(titleEl.classes()).toContain("is-playing");
    expect(sentences[0].classes()).not.toContain("is-playing");

    // 2. Title ends -> Sentence 0-0 plays
    currentOptions.onEnd();
    await flushPromises();

    expect(speakCalls.length).toBe(2);
    expect(speakCalls[1].text).toBe("Había una vez en un bosque lejano.");
    expect(titleEl.classes()).not.toContain("is-playing");
    expect(sentences[0].classes()).toContain("is-playing");
    expect(sentences[1].classes()).not.toContain("is-playing");
    expect(window.HTMLElement.prototype.scrollIntoView).toHaveBeenCalled();

    // 3. Sentence 0-0 ends -> Sentence 0-1 plays
    currentOptions.onEnd();
    await flushPromises();

    expect(speakCalls.length).toBe(3);
    expect(speakCalls[2].text).toBe("Vivía un conejo veloz.");
    expect(sentences[0].classes()).not.toContain("is-playing");
    expect(sentences[1].classes()).toContain("is-playing");

    // 4. Sentence 0-1 ends -> Sentence 1-0 plays
    currentOptions.onEnd();
    await flushPromises();

    expect(speakCalls.length).toBe(4);
    expect(speakCalls[3].text).toBe("El zorro lo miraba.");
    expect(sentences[1].classes()).not.toContain("is-playing");
    expect(sentences[2].classes()).toContain("is-playing");

    // 5. Ends -> all reset
    currentOptions.onEnd();
    await flushPromises();

    expect(titleEl.classes()).not.toContain("is-playing");
    expect(sentences[2].classes()).not.toContain("is-playing");
  });

  it("does not apply sentence-level highlight for imported articles", async () => {
    const importedItem = {
      id: 101,
      user_id: "u1",
      target_language: "es",
      title: "YouTube Lesson",
      duration_sec: 60,
      audio_path: "C:/path/to/audio.m4a",
      subtitles_json: JSON.stringify([
        { start: 0, end: 5.5, text: "Hola bienvenidos al canal." },
        { start: 5.6, end: 12.0, text: "Hoy practicamos conversación." },
      ]),
      cefr_level: "B1",
      created_at: "2026-07-11T10:00:00",
    };

    api.__setInvoke(vi.fn((command) => {
      if (command === "get_current_user") return Promise.resolve({ id: "u1", native_language: "zh" });
      if (command === "get_target_language_cmd") return Promise.resolve("es");
      if (command === "get_learning_goals_cmd") return Promise.resolve([{ target_language: "es", cefr_level: "B1" }]);
      if (command === "get_imported_article_cmd") return Promise.resolve(importedItem);
      return Promise.resolve(null);
    }));

    const wrapper = await mountPage(101, { type: "imported" });
    await flushPromises();

    // No .article-sentence spans rendered in imported mode
    expect(wrapper.findAll(".article-sentence").length).toBe(0);

    // Header title does not have .is-playing
    expect(wrapper.find(".header-title").classes()).not.toContain("is-playing");

    // Paragraph-level highlight applies at t=0
    expect(wrapper.vm.isParagraphActive(0)).toBe(true);
    expect(wrapper.vm.isParagraphActive(1)).toBe(false);
  });
});
