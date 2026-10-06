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

    // Custom scroll rail should exist
    expect(wrapper.find(".article-scroll-rail").exists()).toBe(true);

    // Paragraph highlight test
    expect(wrapper.vm.isParagraphActive(0)).toBe(true); // at t = 0
    expect(wrapper.vm.isParagraphActive(1)).toBe(false);
  });

  it("translates paragraphs lazily as they approach the viewport, with bounded concurrency", async () => {
    const paras = Array.from({ length: 30 }, (_, i) => ({ start: i * 2, end: i * 2 + 1.9, text: `Frase numero ${i}.` }));
    const importedItem = {
      id: 102,
      title: "Long transcript",
      duration_sec: 60,
      audio_path: null,
      subtitles_json: JSON.stringify(paras),
      created_at: "2026-07-11T10:00:00",
    };
    const translateCalls = [];
    api.__setInvoke(vi.fn((command, args) => {
      if (command === "get_current_user") return Promise.resolve({ id: "u1", native_language: "zh" });
      if (command === "get_target_language_cmd") return Promise.resolve("es");
      if (command === "get_learning_goals_cmd") return Promise.resolve([{ target_language: "es", cefr_level: "B1" }]);
      if (command === "get_imported_article_cmd") return Promise.resolve(importedItem);
      if (command === "translate_text_cmd") {
        translateCalls.push(args.text);
        return Promise.resolve(`ZH:${args.text}`);
      }
      return Promise.resolve(null);
    }));

    const observed = [];
    let ioCallback = null;
    const OrigIO = globalThis.IntersectionObserver;
    globalThis.IntersectionObserver = class {
      constructor(cb) { ioCallback = cb; }
      observe(el) { observed.push(el); }
      disconnect() {}
    };

    try {
      const wrapper = await mountPage(102, { type: "imported" });
      await flushPromises();
      await wrapper.find(".btn-mode").trigger("click");
      await flushPromises();

      expect(wrapper.findAll(".para-translation")).toHaveLength(30);
      expect(observed).toHaveLength(30);
      // Only the title is translated before anything intersects.
      expect(translateCalls).toEqual(["Long transcript"]);

      ioCallback(observed.slice(0, 3).map((target) => ({ target, isIntersecting: true })));
      await flushPromises();

      expect(translateCalls).toHaveLength(4);
      expect(wrapper.findAll(".para-translation")[0].text()).toBe("ZH:Frase numero 0.");
      expect(wrapper.findAll(".para-translation")[5].text()).toBe("…");
    } finally {
      globalThis.IntersectionObserver = OrigIO;
    }
  });

  it("scrollbar rail accepts pointer input and hides native scrollbar", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const src = fs.readFileSync(path.resolve(__dirname, "../ReadingReader.vue"), "utf8");
    const railCss = src.match(/\.article-scroll-rail\s*\{[^}]*\}/)[0];
    expect(railCss).not.toMatch(/pointer-events:\s*none/);
    expect(src).toMatch(/@pointerdown="onScrollRailPointerDown"/);
    const bodyCss = src.match(/\.article-body\s*\{[^}]*\}/)[0];
    expect(bodyCss).toMatch(/scrollbar-width:\s*none/);
  });

  it("renders paragraph audio timestamps and seeks audio when clicking paragraph blank space", async () => {
    const importedItem = {
      id: 103,
      user_id: "u1",
      target_language: "es",
      source_type: "youtube",
      title: "Audio Timestamp Lesson",
      duration_sec: 180,
      audio_path: "C:/path/to/audio.m4a",
      subtitles_json: JSON.stringify([
        { start: 0, end: 15.2, text: "Primer párrafo del video." },
        { start: 65.5, end: 80.0, text: "Segundo párrafo un minuto después." },
      ]),
      created_at: "2026-07-11T10:00:00",
    };

    api.__setInvoke(vi.fn((command) => {
      if (command === "get_current_user") return Promise.resolve({ id: "u1", native_language: "zh" });
      if (command === "get_target_language_cmd") return Promise.resolve("es");
      if (command === "get_learning_goals_cmd") return Promise.resolve([{ target_language: "es", cefr_level: "B1" }]);
      if (command === "get_imported_article_cmd") return Promise.resolve(importedItem);
      return Promise.resolve(null);
    }));

    const wrapper = await mountPage(103, { type: "imported" });
    await flushPromises();

    const times = wrapper.findAll(".para-time");
    expect(times).toHaveLength(2);
    expect(times[0].text()).toBe("00:00");
    expect(times[1].text()).toBe("01:05");

    // Click on paragraph 1
    const paras = wrapper.findAll(".para");
    await paras[1].trigger("click");
    expect(wrapper.vm.currentTime).toBe(65.5);
  });
});
