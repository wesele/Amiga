/**
 * Visual snapshot for issue #83 native title preview.
 * Run: SCREENSHOT=1 npm test -- --run src/modules/news/__tests__/screenshotTitlePreview.spec.js
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

const { getArticles, getArticlesReadingStatus, getArticleTitleTranslations } = vi.hoisted(() => ({
  getArticles: vi.fn(),
  getArticlesReadingStatus: vi.fn(),
  getArticleTitleTranslations: vi.fn(),
}));

vi.mock("@/shared/api.js", () => ({
  getArticles,
  getArticlesReadingStatus,
  getArticleTitleTranslations,
  getCurrentUser: vi.fn().mockResolvedValue({ id: "u1", native_language: "zh" }),
  fetchNews: vi.fn().mockResolvedValue([]),
  lookupWordsMastery: vi.fn().mockResolvedValue([]),
}));

vi.mock("@/shared/learningContext.js", () => ({
  loadLearningContext: vi.fn().mockResolvedValue({
    user: { id: "u1" },
    targetLang: "es",
    cefr: "B1",
  }),
}));

const NewsList = (await import("@/modules/news/NewsList.vue")).default;

function makeRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: "/learn", name: "learn", component: { template: "<div>learn</div>" } },
      { path: "/news", name: "news", component: NewsList, meta: { parent: "learn" } },
      { path: "/news/:id", name: "reader", component: { template: "<div>reader</div>" } },
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

describe.skipIf(!takeScreenshot)("screenshotTitlePreview", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    setLocale("zh", { persist: false });
    getArticles.mockResolvedValue([
      {
        id: 1,
        hot_rank: 1,
        original_title: "Gobierno anuncia nuevas medidas para inmigrantes",
        rewritten_body: "Texto A2",
        rewrite_level: "A2",
        source: "https://example.com/1",
      },
      {
        id: 2,
        hot_rank: 2,
        original_title: "El banco central sube las tasas de interés",
        rewritten_body: null,
        source: "https://example.com/2",
      },
      {
        id: 3,
        hot_rank: 3,
        original_title: "La selección nacional gana el partido decisivo",
        rewritten_body: "Texto B1",
        rewrite_level: "B1",
        source: "https://example.com/3",
      },
    ]);
    getArticlesReadingStatus.mockResolvedValue([
      {
        article_id: 1,
        read_at: "2026-07-03T08:00:00Z",
        completed: true,
        unknown_count: 2,
        known_count: 5,
        read_today: true,
        scroll_pct: 100,
      },
      {
        article_id: 2,
        read_at: "2026-07-03T09:30:00Z",
        completed: false,
        unknown_count: 0,
        known_count: 0,
        read_today: false,
        scroll_pct: 35,
      },
    ]);
    getArticleTitleTranslations.mockResolvedValue([
      { article_id: 1, title_translation: "政府宣布针对移民的新措施" },
      { article_id: 2, title_translation: "央行上调利率" },
      { article_id: 3, title_translation: "国家队赢得关键比赛" },
    ]);
  });

  it("captures list with native title previews and meta badges", async () => {
    const router = makeRouter();
    await router.push("/news");
    await router.isReady();
    const wrapper = mount(NewsList, {
      global: { plugins: [router] },
    });
    await flushPromises();
    await flushPromises();

    const natives = wrapper.findAll(".card-title-native");
    expect(natives.length).toBeGreaterThanOrEqual(3);
    expect(wrapper.find(".article-card.is-read .card-title-native").exists()).toBe(true);
    expect(wrapper.find(".badge-in-progress").exists()).toBe(true);

    writeScreenshot(
      wrapper,
      ".news-list",
      "title-preview-list",
      "src/modules/news/NewsList.vue",
    );
  }, 30_000);
});