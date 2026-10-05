import { describe, it, expect, vi, beforeEach } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { createMemoryHistory, createRouter } from "vue-router";
import * as api from "@/shared/api.js";

const ReadingReader = (await import("@/modules/reading/ReadingReader.vue")).default;

async function mountPage(id = 101, query = { type: "imported" }) {
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

describe("ReadingReader Imported Article & Audio", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it("loads imported article subtitles as body paragraphs and hides regen/test buttons", async () => {
    const importedItem = {
      id: 101,
      user_id: "u1",
      target_language: "es",
      source_type: "youtube",
      source_url: "https://youtube.com/watch?v=demo",
      source_id: "demo",
      title: "YouTube Spanish Lesson",
      channel: "Spanish Today",
      duration_sec: 120,
      audio_path: "C:/path/to/audio.m4a",
      subtitles_json: JSON.stringify([
        { start: 0, end: 5.5, text: "Hola bienvenidos al canal." },
        { start: 5.6, end: 12.0, text: "Hoy practicamos conversación." },
      ]),
      cefr_level: "B1",
      created_at: "2026-07-11T10:00:00",
    };

    api.__setInvoke(vi.fn((command, args) => {
      if (command === "get_current_user") return Promise.resolve({ id: "u1", native_language: "zh" });
      if (command === "get_target_language_cmd") return Promise.resolve("es");
      if (command === "get_learning_goals_cmd") return Promise.resolve([{ target_language: "es", cefr_level: "B1" }]);
      if (command === "get_imported_article_cmd") return Promise.resolve(importedItem);
      return Promise.resolve(null);
    }));

    const wrapper = await mountPage(101, { type: "imported" });
    await flushPromises();

    // Title and body
    expect(wrapper.text()).toContain("YouTube Spanish Lesson");
    expect(wrapper.text()).toContain("Hola bienvenidos al canal.");
    expect(wrapper.text()).toContain("Hoy practicamos conversación.");

    // Regen button and Test button should NOT exist for imported articles
    expect(wrapper.find(".regen-btn").exists()).toBe(false);
    expect(wrapper.find(".btn-test").exists()).toBe(false);

    // Audio timeline track should exist
    expect(wrapper.find(".audio-timeline-rail").exists()).toBe(true);

    // Paragraph highlight test
    expect(wrapper.vm.isParagraphActive(0)).toBe(true); // at t = 0
    expect(wrapper.vm.isParagraphActive(1)).toBe(false);
  });
});
