/**
 * Visual snapshot for issue #65 in-reader micro-review bottom sheet.
 * Run: SCREENSHOT=1 npm test -- --run src/modules/news/__tests__/screenshotMicroReview.spec.js
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
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
  getUnknownWords,
  getDailyGoalProgress,
  getArticles,
  getArticlesReadingStatus,
  getPathCurriculum,
} = vi.hoisted(() => ({
  lookupWordsMastery: vi.fn(),
  ensureWordsSeen: vi.fn().mockResolvedValue(undefined),
  getArticle: vi.fn(),
  getUnknownWords: vi.fn(),
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
  getUnknownWords,
  ensureWordsSeen,
  addDiscoveredWord: vi.fn().mockResolvedValue(100),
  shareText: vi.fn(),
  getDailyGoalProgress,
  getArticles,
  getArticlesReadingStatus,
  getPathCurriculum,
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
const WordPopup = (await import("@/shared/components/WordPopup.vue")).default;

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
  const sheetStyles =
    readFileSync(join(root, "src/modules/vocab/MicroReviewSheet.vue"), "utf8").match(
      /<style scoped>([\s\S]*?)<\/style>/,
    )?.[1] ?? "";
  const styles = `${readerStyles}\n${sheetStyles}`;

  const html = `<!DOCTYPE html>
<html lang="zh"><head><meta charset="utf-8" />
<style>
:root {
  --bg:#f5f5f5;--white:#fff;--surface:#fff;--surface-variant:#f0f0f0;
  --text:#1a1a1a;--text-light:#666;--text-lighter:#999;--border:#e5e5e5;
  --primary:#1cb0f6;--green:#58cc02;--blue:#1cb0f6;--purple:#7c3aed;
  --radius-md:12px;--transition:0.2s ease;--safe-bottom:0px;
}
*{box-sizing:border-box}body{margin:0;font-family:system-ui,sans-serif;background:var(--bg)}
.news-reader{width:480px;height:800px;margin:0 auto;position:relative;overflow:hidden}
${styles}
</style></head><body>${wrapper.find(".news-reader").html()}</body></html>`;

  writeFileSync(outHtml, html);
  exec(
    `google-chrome --headless=new --disable-gpu --window-size=480,900 --screenshot=${outPng} file://${outHtml}`,
    { stdio: "inherit" },
  );
  return outPng;
}

describe.skipIf(!takeScreenshot)("screenshotMicroReview", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    setLocale("zh", { persist: false });
    lookupWordsMastery.mockResolvedValue([
      { word: "hola", word_id: 1, mastery: 2, definition_zh: "你好" },
      { word: "mundo", word_id: 2, mastery: 0, definition_zh: "世界" },
      { word: "nuevo", word_id: 3, mastery: 1, definition_zh: "新的" },
      { word: "viaje", word_id: 4, mastery: 1, definition_zh: "旅行" },
    ]);
    getUnknownWords.mockResolvedValue([
      { id: 4, word: "viaje", mastery: 1, definition_zh: "旅行" },
    ]);
    getDailyGoalProgress.mockResolvedValue({ streak_current: 5, practiced_today: false });
    getPathCurriculum.mockResolvedValue({ status: "active", units: [] });
    getArticles.mockResolvedValue([{ id: 1, original_title: "Titulo" }]);
    getArticlesReadingStatus.mockResolvedValue([]);
    getArticle.mockResolvedValue({
      id: 1,
      original_title: "Titulo",
      rewritten_body: "Hola mundo nuevo viaje",
      source: "sample",
    });
  });

  it("captures micro-review sheet after marking three unknown words", async () => {
    const router = makeRouter();
    await router.push("/news/1");
    await router.isReady();

    const wrapper = mount(NewsReader, {
      props: { id: "1" },
      global: { plugins: [router] },
    });
    await flushPromises();

    const words = wrapper.findAll(".word");
    expect(words.length).toBeGreaterThanOrEqual(3);
    for (let i = 0; i < 3; i += 1) {
      await words[i].trigger("click");
      await flushPromises();
      await wrapper.findComponent(WordPopup).vm.$emit("unknown");
      await flushPromises();
    }

    expect(wrapper.find(".micro-review-sheet").exists()).toBe(true);
    expect(wrapper.text()).toContain("刚标记了 3 个生词");
    const pngPath = writeScreenshot(wrapper, "news-micro-review");
    expect(pngPath).toContain("news-micro-review.png");
  }, 30_000);
});