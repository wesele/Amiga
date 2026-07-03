/**
 * Visual snapshot for reading completion overlay with next-steps panel (#48 / #52).
 * Run: SCREENSHOT=1 npm test -- --run src/modules/news/__tests__/screenshotCompletion.spec.js
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { createRouter, createMemoryHistory } from "vue-router";
import { writeFileSync, mkdirSync } from "node:fs";
import { execSync as exec } from "node:child_process";
import { join, dirname } from "node:path";
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

describe.skipIf(!takeScreenshot)("screenshotCompletion", () => {
  beforeEach(() => {
    setLocale("zh", { persist: false });
    setActivePinia(createPinia());
    getArticle.mockResolvedValue({
      id: 1,
      original_title: "La economía global en 2026",
      rewritten_body: "Hola mundo nuevo",
      source: "sample",
    });
    getDailyGoalProgress.mockResolvedValue({
      streak_current: 12,
      practiced_today: false,
      goal_met: false,
      target_lessons: 2,
      lessons_today: 0,
    });
    getPathCurriculum.mockResolvedValue({
      status: "active",
      units: [
        {
          sections: [
            {
              id: "zh-es/U01-GRAMMAR",
              kind: "grammar",
              current: true,
              locked: false,
            },
          ],
        },
      ],
    });
    getArticles.mockResolvedValue([
      { id: 1, original_title: "La economía global en 2026" },
      { id: 2, original_title: "Siguiente artículo" },
    ]);
    getArticlesReadingStatus.mockResolvedValue([
      { article_id: 1, read_at: null },
      { article_id: 2, read_at: null },
    ]);
    lookupWordsMastery.mockResolvedValue([
      { word: "hola", word_id: 1, mastery: 2 },
      { word: "mundo", word_id: 2, mastery: 0 },
      { word: "nuevo", word_id: 3, mastery: 1 },
    ]);
  });

  async function mountReaderWithUnknownWord(router) {
    const wrapper = mount(NewsReader, {
      props: { id: "1" },
      global: { plugins: [router] },
    });
    await flushPromises();
    await wrapper.find(".word.word-new").trigger("click");
    await flushPromises();
    await wrapper.findComponent(WordPopup).vm.$emit("unknown");
    await flushPromises();
    return wrapper;
  }

  async function writeOverlayScreenshot(wrapper, baseName) {
    const root = join(dirname(fileURLToPath(import.meta.url)), "../../../..");
    const outDir = join(root, "screenshots");
    mkdirSync(outDir, { recursive: true });
    const outHtml = join(outDir, `${baseName}.html`);
    const outPng = join(outDir, `${baseName}.png`);

    const html = `<!DOCTYPE html>
<html lang="zh"><head><meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<style>
:root {
  --surface:#fff;--surface-variant:#f5f5f5;--text:#1a1a1a;--text-light:#666;--text-lighter:#999;
  --border:#e5e5e5;--green:#58cc02;--green-hover:#4cb302;--orange-bg:#fff4e5;--orange-hover:#c45c00;
  --blue:#1cb0f6;--blue-bg:rgba(28,176,246,.1);--purple:#7c3aed;--purple-bg:rgba(124,58,237,.1);
  --red:#ff4b4b;--primary:#1cb0f6;--radius-sm:8px;--radius-md:12px;--radius-lg:16px;
  --shadow-lg:0 8px 24px rgba(0,0,0,.15);--transition:.15s ease;
}
*{box-sizing:border-box}html,body{margin:0;height:100%;font-family:system-ui,sans-serif;background:#f0f0f0}
#app{width:480px;height:800px;margin:0 auto;overflow:hidden;background:var(--surface)}
</style></head><body><div id="app">${wrapper.html()}</div></body></html>`;

    writeFileSync(outHtml, html);
    exec(
      `google-chrome --headless=new --disable-gpu --window-size=480,800 --screenshot=${outPng} file://${outHtml}`,
      { stdio: "inherit" },
    );
  }

  it("writes reading completion overlay screenshot", async () => {
    const router = makeRouter();
    await router.push("/news/1");
    await router.isReady();

    const wrapper = await mountReaderWithUnknownWord(router);
    await wrapper.find(".mark-complete-btn").trigger("click");
    await flushPromises();

    expect(wrapper.find(".completion-overlay").exists()).toBe(true);
    expect(wrapper.find(".next-steps-panel").exists()).toBe(true);
    expect(wrapper.find(".completion-overlay").text()).toContain("阅读完成");

    await writeOverlayScreenshot(wrapper, "issue69-reading-completion");
  });

  it("writes reading checkpoint overlay screenshot", async () => {
    const router = makeRouter();
    await router.push("/news/1");
    await router.isReady();

    const wrapper = await mountReaderWithUnknownWord(router);
    await wrapper.find(".back-btn").trigger("click");
    await flushPromises();

    expect(wrapper.find(".completion-overlay").exists()).toBe(true);
    expect(wrapper.find(".completion-overlay").text()).toContain("本次阅读小结");

    await writeOverlayScreenshot(wrapper, "issue69-reading-checkpoint");
  });
});