/**
 * Visual snapshot for issue #76 comprehension retake flow.
 * Run: SCREENSHOT=1 npm test -- --run src/modules/news/__tests__/screenshotComprehensionRetake.spec.js
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

const QUIZ = {
  questions: [
    {
      id: "main-idea",
      kind: "main_idea",
      prompt_native: "这篇文章主要讲了什么？",
      options: [
        { id: "a", text_native: "央行加息抑制通胀" },
        { id: "b", text_native: "科技公司发布新手机" },
        { id: "c", text_native: "足球队赢得世界杯" },
      ],
      correct_option_id: "a",
      evidence_sentence: "El banco central subió las tasas para frenar la inflación.",
      explanation_native: "文章重点是央行通过加息应对通胀。",
    },
    {
      id: "detail",
      kind: "detail",
      prompt_native: "央行为什么采取行动？",
      options: [
        { id: "a", text_native: "为了控制物价上涨" },
        { id: "b", text_native: "为了促进旅游业" },
        { id: "c", text_native: "为了修建新球场" },
      ],
      correct_option_id: "a",
      evidence_sentence: "La inflación sigue siendo alta este año.",
      explanation_native: "文中明确提到通胀仍然偏高。",
    },
  ],
  from_cache: true,
};

const {
  lookupWordsMastery,
  ensureWordsSeen,
  getArticle,
  getComprehensionQuiz,
  getDailyGoalProgress,
  getArticles,
  getArticlesReadingStatus,
  getPathCurriculum,
} = vi.hoisted(() => ({
  lookupWordsMastery: vi.fn(),
  ensureWordsSeen: vi.fn().mockResolvedValue(undefined),
  getArticle: vi.fn(),
  getComprehensionQuiz: vi.fn(),
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
  lookupWordIds: vi.fn().mockResolvedValue([]),
  lookupWordsMastery,
  ensureWordsSeen,
  addDiscoveredWord: vi.fn().mockResolvedValue(100),
  shareText: vi.fn(),
  getComprehensionQuiz,
  getDailyGoalProgress,
  getArticles,
  getArticlesReadingStatus,
  getPathCurriculum,
  getCurrentUser: vi.fn().mockResolvedValue({ id: "u1", native_language: "zh" }),
  fetchNews: vi.fn().mockResolvedValue([]),
  saveSetting: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/shared/learningContext.js", () => ({
  loadLearningContext: vi.fn().mockResolvedValue({
    user: { id: "u1" },
    targetLang: "es",
    cefr: "A2",
  }),
}));

const NewsReader = (await import("@/modules/news/NewsReader.vue")).default;
const NewsList = (await import("@/modules/news/NewsList.vue")).default;

function makeRouter() {
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

function writeScreenshot(wrapper, filename, scope = ".news-reader") {
  const root = join(dirname(fileURLToPath(import.meta.url)), "../../../..");
  const outDir = join(root, "screenshots");
  mkdirSync(outDir, { recursive: true });
  const outHtml = join(outDir, `${filename}.html`);
  const outPng = join(outDir, `${filename}.png`);
  const vueFile = scope === ".news-list" ? "NewsList.vue" : "NewsReader.vue";
  const pageHeaderStyles =
    scope === ".news-list"
      ? (readFileSync(join(root, "src/shared/components/PageHeader.vue"), "utf8").match(
          /<style scoped>([\s\S]*?)<\/style>/,
        )?.[1] ?? "")
      : "";
  const styles =
    (readFileSync(join(root, `src/modules/news/${vueFile}`), "utf8").match(
      /<style scoped>([\s\S]*?)<\/style>/,
    )?.[1] ?? "") + pageHeaderStyles;
  const shellClass = scope === ".news-list" ? "news-list" : "news-reader";
  const html = `<!DOCTYPE html>
<html lang="zh"><head><meta charset="utf-8" />
<style>
:root {
  --bg:#f5f5f5;--white:#fff;--surface:#fff;--surface-variant:#f0f0f0;
  --text:#1a1a1a;--text-secondary:#666;--text-light:#666;--text-lighter:#999;--border:#e5e5e5;
  --primary:#1cb0f6;--green:#58cc02;--green-bg:#e8f8ef;--green-hover:#1f8a4c;
  --orange:#ff9800;--blue:#1cb0f6;--purple:#7c3aed;--purple-bg:#f3e8ff;
  --radius-md:12px;--radius-sm:8px;--radius-lg:16px;--shadow-lg:0 8px 24px rgba(0,0,0,.12);
  --transition:0.2s ease;--safe-bottom:0px;
}
*{box-sizing:border-box}body{margin:0;font-family:system-ui,sans-serif;background:var(--bg)}
.${shellClass}{width:480px;height:800px;margin:0 auto;position:relative;overflow:hidden}
${styles}
</style></head><body>${wrapper.find(scope).html()}</body></html>`;
  writeFileSync(outHtml, html);
  exec(
    `google-chrome --headless=new --disable-gpu --window-size=480,900 --screenshot=${outPng} file://${outHtml}`,
    { stdio: "inherit" },
  );
  return outPng;
}

describe.skipIf(!takeScreenshot)("screenshotComprehensionRetake", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    setLocale("zh", { persist: false });
    lookupWordsMastery.mockResolvedValue([]);
    getComprehensionQuiz.mockResolvedValue(QUIZ);
    getDailyGoalProgress.mockResolvedValue({
      goal_met: true,
      target_lessons: 2,
      lessons_today: 2,
      streak_current: 3,
      practiced_today: false,
    });
    getArticles.mockResolvedValue([
      {
        id: 7,
        hot_rank: 1,
        original_title: "El banco central sube las tasas",
        source: "sample",
        rewritten_body: "El banco central subió las tasas.",
      },
    ]);
    getArticlesReadingStatus.mockResolvedValue([
      {
        article_id: 7,
        read_at: "2026-07-02 10:00:00",
        completed: true,
        comprehension_skipped: true,
        unknown_count: 0,
      },
    ]);
    getPathCurriculum.mockResolvedValue({ status: "active", units: [] });
    getArticle.mockResolvedValue({
      id: 7,
      original_title: "El banco central sube las tasas",
      rewritten_body:
        "El banco central subió las tasas para frenar la inflación. La inflación sigue siendo alta este año.",
      source: "sample",
    });
  });

  it("captures list retake chip and reader retake sheet", async () => {
    const router = makeRouter();
    await router.push("/news");
    await router.isReady();

    const listWrapper = mount(NewsList, {
      global: { plugins: [router] },
    });
    await flushPromises();
    await flushPromises();
    writeScreenshot(listWrapper, "comprehension-retake-list", ".news-list");

    await router.push({ path: "/news/7", query: { comprehensionRetake: "1" } });
    await flushPromises();

    const readerWrapper = mount(NewsReader, {
      props: { id: "7" },
      global: { plugins: [router] },
    });
    await flushPromises();
    await flushPromises();

    expect(readerWrapper.find(".comprehension-quiz").exists()).toBe(true);
    writeScreenshot(readerWrapper, "comprehension-retake-sheet");
  }, 30_000);
});