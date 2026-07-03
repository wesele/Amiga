/**
 * Visual snapshot for issue #80 rewrite level matching.
 * Run: SCREENSHOT=1 npm test -- --run src/modules/news/__tests__/screenshotRewriteLevel.spec.js
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
  rewriteArticle,
  getDailyGoalProgress,
  getArticles,
  getArticlesReadingStatus,
  getPathCurriculum,
} = vi.hoisted(() => ({
  lookupWordsMastery: vi.fn(),
  ensureWordsSeen: vi.fn().mockResolvedValue(undefined),
  getArticle: vi.fn(),
  rewriteArticle: vi.fn(),
  getDailyGoalProgress: vi.fn(),
  getArticles: vi.fn(),
  getArticlesReadingStatus: vi.fn(),
  getPathCurriculum: vi.fn(),
}));

vi.mock("@/shared/api.js", () => ({
  getArticle,
  rewriteArticle,
  saveReadingLog: vi.fn().mockResolvedValue(undefined),
  updateWordMastery: vi.fn().mockResolvedValue(undefined),
  getBilingual: vi.fn(),
  translateText: vi.fn(),
  lookupWordIds: vi.fn().mockResolvedValue([]),
  lookupWordsMastery,
  ensureWordsSeen,
  addDiscoveredWord: vi.fn().mockResolvedValue(100),
  shareText: vi.fn(),
  getDailyGoalProgress,
  getArticles,
  getArticlesReadingStatus,
  getPathCurriculum,
  getComprehensionQuiz: vi.fn().mockResolvedValue(null),
  getUnknownWords: vi.fn().mockResolvedValue([]),
}));

vi.mock("@/shared/learningContext.js", () => ({
  loadLearningContext: vi.fn().mockResolvedValue({
    user: { id: "u1" },
    targetLang: "es",
    cefr: "B1",
  }),
}));

const NewsReader = (await import("@/modules/news/NewsReader.vue")).default;
const NewsList = (await import("@/modules/news/NewsList.vue")).default;

function makeReaderRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: "/news", name: "news", component: NewsList },
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

function writeScreenshot(wrapper, selector, filename, stylesFile) {
  const root = join(dirname(fileURLToPath(import.meta.url)), "../../../..");
  const outDir = join(root, "screenshots");
  mkdirSync(outDir, { recursive: true });
  const outHtml = join(outDir, `${filename}.html`);
  const outPng = join(outDir, `${filename}.png`);
  const scopedStyles =
    readFileSync(join(root, stylesFile), "utf8").match(
      /<style scoped>([\s\S]*?)<\/style>/,
    )?.[1] ?? "";
  const html = `<!DOCTYPE html>
<html lang="zh"><head><meta charset="utf-8" />
<style>
:root {
  --bg:#f5f5f5;--white:#fff;--surface:#fff;--surface-variant:#f0f0f0;
  --text:#1a1a1a;--text-secondary:#666;--text-light:#666;--text-lighter:#999;--border:#e5e5e5;
  --primary:#1cb0f6;--green:#58cc02;--green-bg:#e8f8ef;--green-hover:#1f8a4c;
  --orange:#ff9800;--blue:#1cb0f6;--purple:#7c3aed;
  --radius-md:12px;--radius-sm:8px;--radius-lg:16px;--shadow-lg:0 8px 24px rgba(0,0,0,.12);
  --transition:0.2s ease;--safe-bottom:0px;
}
*{box-sizing:border-box}body{margin:0;font-family:system-ui,sans-serif;background:var(--bg)}
${scopedStyles}
</style></head><body>${wrapper.find(selector).html()}</body></html>`;
  writeFileSync(outHtml, html);
  exec(
    `google-chrome --headless=new --disable-gpu --window-size=480,900 --screenshot=${outPng} file://${outHtml}`,
    { stdio: "inherit" },
  );
  return outPng;
}

describe.skipIf(!takeScreenshot)("screenshotRewriteLevel", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    setLocale("zh", { persist: false });
    lookupWordsMastery.mockResolvedValue([]);
    getDailyGoalProgress.mockResolvedValue({
      goal_met: true,
      target_lessons: 2,
      lessons_today: 2,
      streak_current: 3,
      practiced_today: false,
    });
    getArticles.mockResolvedValue([
      {
        id: 9,
        hot_rank: 1,
        original_title: "El banco central sube las tasas",
        rewritten_body: "Texto adaptado A2",
        rewrite_level: "A2",
        source: "sample",
      },
    ]);
    getArticlesReadingStatus.mockResolvedValue([]);
    getPathCurriculum.mockResolvedValue({ status: "active", units: [] });
    getArticle.mockResolvedValue({
      id: 9,
      original_title: "El banco central sube las tasas",
      rewritten_body: "El banco central subió las tasas para frenar la inflación.",
      rewrite_level: "A2",
      source: "sample",
    });
    rewriteArticle.mockImplementation(
      () =>
        new Promise((resolve) => {
          setTimeout(
            () =>
              resolve({
                id: 9,
                original_title: "El banco central sube las tasas",
                rewritten_body: "El banco central elevó las tasas de interés para controlar la inflación.",
                rewrite_level: "B1",
                source: "sample",
              }),
            50,
          );
        }),
    );
  });

  it("captures list badge and reader stale banner + refreshing state", async () => {
    const listRouter = makeReaderRouter();
    await listRouter.push("/news");
    await listRouter.isReady();
    const listWrapper = mount(NewsList, {
      global: { plugins: [listRouter] },
    });
    await flushPromises();
    expect(listWrapper.find(".badge-level.is-stale").exists()).toBe(true);
    writeScreenshot(
      listWrapper,
      ".news-list",
      "rewrite-level-list",
      "src/modules/news/NewsList.vue",
    );

    const readerRouter = makeReaderRouter();
    await readerRouter.push("/news/9");
    await readerRouter.isReady();
    const readerWrapper = mount(NewsReader, {
      props: { id: "9" },
      global: { plugins: [readerRouter] },
    });
    await flushPromises();
    expect(readerWrapper.find(".rewrite-stale-banner").exists()).toBe(true);
    writeScreenshot(
      readerWrapper,
      ".news-reader",
      "rewrite-level-reader-banner",
      "src/modules/news/NewsReader.vue",
    );

    await readerWrapper.find(".btn-stale-refresh").trigger("click");
    await flushPromises();
    expect(readerWrapper.find(".loading-center").exists()).toBe(true);
    writeScreenshot(
      readerWrapper,
      ".news-reader",
      "rewrite-level-reader-refreshing",
      "src/modules/news/NewsReader.vue",
    );

    await new Promise((r) => setTimeout(r, 80));
    await flushPromises();
    expect(readerWrapper.find(".rewrite-stale-banner").exists()).toBe(false);
    writeScreenshot(
      readerWrapper,
      ".news-reader",
      "rewrite-level-reader-done",
      "src/modules/news/NewsReader.vue",
    );
  }, 30_000);
});