/**
 * Visual snapshot for issue #85 listen-along bar in news reader.
 * Run: SCREENSHOT=1 npm test -- --run src/modules/news/__tests__/screenshotListenAlong.spec.js
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { createMemoryHistory, createRouter } from "vue-router";
import { execSync as exec } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { setLocale } from "@/shared/i18n";

const takeScreenshot = process.env.SCREENSHOT === "1";

vi.mock("@tauri-apps/plugin-shell", () => ({ open: vi.fn() }));

const {
  lookupWordsMastery,
  ensureWordsSeen,
  getArticle,
  getDailyGoalProgress,
  getArticles,
  getArticlesReadingStatus,
  getPathCurriculum,
} = vi.hoisted(() => ({
  lookupWordsMastery: vi.fn(),
  ensureWordsSeen: vi.fn().mockResolvedValue(undefined),
  getArticle: vi.fn(),
  getDailyGoalProgress: vi.fn(),
  getArticles: vi.fn(),
  getArticlesReadingStatus: vi.fn(),
  getPathCurriculum: vi.fn(),
}));

vi.mock("@/shared/api.js", () => ({
  getArticle,
  rewriteArticle: vi.fn(),
  saveReadingLog: vi.fn().mockResolvedValue(undefined),
  updateWordMastery: vi.fn().mockResolvedValue(undefined),
  getBilingual: vi.fn(),
  translateText: vi.fn(),
  lookupWordIds: vi.fn().mockResolvedValue([99]),
  lookupWordsMastery,
  ensureWordsSeen,
  addDiscoveredWord: vi.fn().mockResolvedValue(100),
  shareText: vi.fn(),
  getDailyGoalProgress,
  getArticles,
  getArticlesReadingStatus,
  getPathCurriculum,
  getComprehensionQuiz: vi.fn().mockResolvedValue(null),
  getArticleTitleTranslations: vi.fn().mockResolvedValue([]),
}));

vi.mock("@/modules/ai-chat/openAiContact.js", () => ({
  openAiContact: vi.fn().mockResolvedValue(true),
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

function installSpeechMock({ autoEnd = false } = {}) {
  class MockUtterance {
    constructor(text) {
      this.text = text;
      this.lang = "";
      this.rate = 1;
      this.onend = null;
      this.onerror = null;
    }
  }
  globalThis.SpeechSynthesisUtterance = MockUtterance;
  globalThis.speechSynthesis = {
    cancel: vi.fn(),
    speak: vi.fn((utter) => {
      if (autoEnd) queueMicrotask(() => utter.onend?.());
    }),
  };
}

function writeScreenshot(wrapper, filename) {
  const root = join(dirname(fileURLToPath(import.meta.url)), "../../../..");
  const outDir = join(root, "screenshots");
  mkdirSync(outDir, { recursive: true });
  const outHtml = join(outDir, `${filename}.html`);
  const outPng = join(outDir, `${filename}.png`);
  const readerStyles =
    readFileSync(join(root, "src/modules/news/NewsReader.vue"), "utf8").match(
      /<style scoped>([\s\S]*?)<\/style>/,
    )?.[1] ?? "";
  const barStyles =
    readFileSync(join(root, "src/modules/news/components/ArticleListenAlongBar.vue"), "utf8").match(
      /<style scoped>([\s\S]*?)<\/style>/,
    )?.[1] ?? "";
  const styles = `${readerStyles}\n${barStyles}`;

  const html = `<!DOCTYPE html>
<html lang="zh"><head><meta charset="utf-8" />
<style>
:root {
  --bg:#f5f5f5;--white:#fff;--surface:#fff;--surface-variant:#f0f0f0;
  --text:#1a1a1a;--text-light:#666;--text-lighter:#999;--border:#e5e5e5;
  --primary:#1cb0f6;--green:#58cc02;--blue:#1cb0f6;--blue-bg:rgba(28,176,246,0.1);
  --blue-hover:#1899d6;--radius-md:12px;--radius-sm:8px;--transition:0.2s ease;--safe-bottom:0px;
}
*{box-sizing:border-box}body{margin:0;font-family:system-ui,sans-serif;background:var(--bg)}
.news-reader{width:480px;height:800px;margin:0 auto;display:flex;flex-direction:column;background:var(--surface)}
${styles}
</style></head><body>${wrapper.find(".news-reader").html()}</body></html>`;

  writeFileSync(outHtml, html);
  exec(
    `google-chrome --headless=new --disable-gpu --window-size=480,900 --screenshot=${outPng} file://${outHtml}`,
    { stdio: "inherit" },
  );
  return outPng;
}

const sampleBody =
  "El banco central subió los tipos de interés.\n\nLa inflación persistente preocupa a los mercados.\n\nLos analistas esperan medidas adicionales.";

describe.skipIf(!takeScreenshot)("screenshotListenAlong", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    setLocale("zh", { persist: false });
    installSpeechMock({ autoEnd: false });
    lookupWordsMastery.mockResolvedValue([]);
    getDailyGoalProgress.mockResolvedValue({ streak_current: 3, practiced_today: false });
    getPathCurriculum.mockResolvedValue({ status: "active", units: [] });
    getArticles.mockResolvedValue([{ id: 1, original_title: "Tipos de interés" }]);
    getArticlesReadingStatus.mockResolvedValue([]);
    getArticle.mockResolvedValue({
      id: 1,
      original_title: "Tipos de interés",
      rewritten_body: sampleBody,
      source: "sample",
    });
  });

  afterEach(() => {
    delete globalThis.SpeechSynthesisUtterance;
    delete globalThis.speechSynthesis;
  });

  it("captures listen-along bar idle and playing states", async () => {
    const router = makeRouter();
    await router.push("/news/1");
    await router.isReady();

    const wrapper = mount(NewsReader, {
      props: { id: "1" },
      global: { plugins: [router] },
    });
    await flushPromises();

    expect(wrapper.text()).toContain("跟读");
    writeScreenshot(wrapper, "news-listen-along-idle");

    await wrapper.find(".listen-along-main").trigger("click");
    await flushPromises();
    await new Promise((resolve) => setTimeout(resolve, 30));

    expect(wrapper.find(".para-original.is-reading").exists()).toBe(true);
    expect(wrapper.text()).toContain("朗读中");
    writeScreenshot(wrapper, "news-listen-along-playing");
  }, 30_000);
});