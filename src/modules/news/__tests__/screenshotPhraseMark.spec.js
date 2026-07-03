/**
 * Visual snapshot for issue #71 phrase selection mark actions.
 * Run: SCREENSHOT=1 npm test -- --run src/modules/news/__tests__/screenshotPhraseMark.spec.js
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
  translateText: vi.fn().mockResolvedValue("利率"),
  lookupWordIds: vi.fn().mockResolvedValue([]),
  lookupWordsMastery,
  ensureWordsSeen,
  addDiscoveredWord: vi.fn().mockResolvedValue(100),
  shareText: vi.fn(),
  getDailyGoalProgress,
  getArticles,
  getArticlesReadingStatus,
  getPathCurriculum,
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
  const overlayStyles =
    readFileSync(join(root, "src/shared/components/SelectionTranslateOverlay.vue"), "utf8").match(
      /<style scoped>([\s\S]*?)<\/style>/,
    )?.[1] ?? "";
  const styles = `${readerStyles}\n${overlayStyles}`;

  const html = `<!DOCTYPE html>
<html lang="zh"><head><meta charset="utf-8" />
<style>
:root {
  --bg:#f5f5f5;--white:#fff;--surface:#fff;--surface-variant:#f0f0f0;
  --text:#1a1a1a;--text-secondary:#666;--text-light:#666;--text-lighter:#999;--border:#e5e5e5;
  --primary:#1cb0f6;--green:#58cc02;--orange:#ff9800;--blue:#1cb0f6;--purple:#7c3aed;
  --radius-md:12px;--radius-sm:8px;--radius-lg:16px;--shadow-lg:0 8px 24px rgba(0,0,0,.12);
  --transition:0.2s ease;--safe-bottom:0px;
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

describe.skipIf(!takeScreenshot)("screenshotPhraseMark", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    setLocale("zh", { persist: false });
    lookupWordsMastery.mockResolvedValue([]);
    getDailyGoalProgress.mockResolvedValue({ streak_current: 5, practiced_today: false });
    getPathCurriculum.mockResolvedValue({ status: "active", units: [] });
    getArticles.mockResolvedValue([{ id: 1, original_title: "Titulo" }]);
    getArticlesReadingStatus.mockResolvedValue([]);
    getArticle.mockResolvedValue({
      id: 1,
      original_title: "Titulo",
      rewritten_body: "La tasa de interés subió ayer en España.",
      source: "sample",
    });
  });

  it("captures phrase translate overlay with mark actions", async () => {
    const router = makeRouter();
    await router.push("/news/1");
    await router.isReady();

    const wrapper = mount(NewsReader, {
      props: { id: "1" },
      global: { plugins: [router] },
    });
    await flushPromises();

    window.__amigaTranslateSelection("tasa de interés");
    await flushPromises();
    await flushPromises();

    expect(wrapper.find(".sel-actions").exists()).toBe(true);
    expect(wrapper.text()).toContain("tasa de interés");
    expect(wrapper.text()).toContain("利率");
    const pngPath = writeScreenshot(wrapper, "news-phrase-mark");
    expect(pngPath).toContain("news-phrase-mark.png");
  }, 30_000);
});