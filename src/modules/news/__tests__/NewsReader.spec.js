import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { createRouter, createMemoryHistory } from "vue-router";
import { setLocale } from "@/shared/i18n";

vi.mock("@tauri-apps/plugin-shell", () => ({ open: vi.fn() }));

const {
  lookupWordsMastery,
  ensureWordsSeen,
  getArticle,
  saveReadingLog,
} = vi.hoisted(() => ({
  lookupWordsMastery: vi.fn(),
  ensureWordsSeen: vi.fn().mockResolvedValue(undefined),
  getArticle: vi.fn(),
  saveReadingLog: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/shared/api.js", () => ({
  getArticle,
  rewriteArticle: vi.fn(),
  saveReadingLog,
  updateWordMastery: vi.fn().mockResolvedValue(undefined),
  getBilingual: vi.fn(),
  translateText: vi.fn(),
  lookupWordIds: vi.fn().mockResolvedValue([99]),
  lookupWordsMastery,
  ensureWordsSeen,
  addDiscoveredWord: vi.fn().mockResolvedValue(100),
  shareText: vi.fn(),
}));

vi.mock("@/shared/learningContext.js", () => ({
  loadLearningContext: vi.fn().mockResolvedValue({
    user: { id: "u1" },
    targetLang: "es",
    cefr: "A2",
  }),
}));

const NewsReader = (await import("@/modules/news/NewsReader.vue")).default;

function makeRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: "/news", name: "news", component: { template: "<div/>" } },
      {
        path: "/news/:id",
        name: "reader",
        component: NewsReader,
        props: true,
        meta: { parent: "news" },
      },
    ],
  });
}

describe("NewsReader mastery visualization", () => {
  beforeEach(() => {
    setLocale("zh", { persist: false });
    setActivePinia(createPinia());
    lookupWordsMastery.mockReset();
    ensureWordsSeen.mockClear();
    getArticle.mockReset();
    lookupWordsMastery.mockResolvedValue([
      { word: "hola", word_id: 1, mastery: 2 },
      { word: "mundo", word_id: 2, mastery: 0 },
      { word: "nuevo", word_id: 3, mastery: 1 },
    ]);
    getArticle.mockResolvedValue({
      id: 1,
      original_title: "Titulo",
      rewritten_body: "Hola mundo nuevo",
      source: "sample",
    });
  });

  it("renders mastery classes after article load", async () => {
    const router = makeRouter();
    await router.push("/news/1");
    await router.isReady();

    const wrapper = mount(NewsReader, {
      props: { id: "1" },
      global: { plugins: [router] },
    });
    await flushPromises();

    expect(ensureWordsSeen).toHaveBeenCalled();
    expect(lookupWordsMastery).toHaveBeenCalled();

    const words = wrapper.findAll(".word");
    expect(words.some((w) => w.classes().includes("word-mastered"))).toBe(true);
    expect(words.some((w) => w.classes().includes("word-new"))).toBe(true);
    expect(words.some((w) => w.classes().includes("word-seen"))).toBe(true);
  });
});