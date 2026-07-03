/**
 * Visual snapshot for issue #90 lesson-word article match.
 * Run: SCREENSHOT=1 npm test -- --run src/modules/news/__tests__/screenshotLessonArticleMatch.spec.js
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { createMemoryHistory, createRouter } from "vue-router";
import { execSync as exec } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { setLocale } from "@/shared/i18n";
import * as api from "@/shared/api.js";

const takeScreenshot = process.env.SCREENSHOT === "1";

vi.mock("@tauri-apps/plugin-shell", () => ({ open: vi.fn() }));

const {
  lookupWordsMastery,
  getArticle,
  getDailyGoalProgress,
} = vi.hoisted(() => ({
  lookupWordsMastery: vi.fn(),
  getArticle: vi.fn(),
  getDailyGoalProgress: vi.fn(),
}));

vi.mock("@/shared/api.js", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    lookupWordsMastery,
    getArticle,
    getDailyGoalProgress,
  };
});

const NewsReader = (await import("@/modules/news/NewsReader.vue")).default;
const TeachingPage = (await import("@/modules/path/TeachingPage.vue")).default;

const VOCAB_NODE_ID = "zh-es/U01-VOCAB";

function makeReaderRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: "/news", name: "news", component: { template: "<div/>" } },
      { path: "/news/:id", name: "reader", component: NewsReader, props: true },
    ],
  });
}

function makeTeachingRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: "/", name: "path", component: { template: "<div/>" } },
      { path: "/learn/path/teach/:nodeId", name: "path-teaching", component: TeachingPage },
    ],
  });
}

function teachingInvoke(cmd, args) {
  if (cmd === "get_current_user") {
    return Promise.resolve({ id: "u1", native_language: "zh" });
  }
  if (cmd === "get_target_language_cmd") return Promise.resolve("es");
  if (cmd === "get_learning_goals_cmd") {
    return Promise.resolve([{ target_language: "es", cefr_level: "A1" }]);
  }
  if (cmd === "get_teaching_content_cmd") {
    return Promise.resolve({
      node_id: VOCAB_NODE_ID,
      kind: "vocab",
      unit_title_native: "基础问候",
      words: [{ word: "hola" }, { word: "gracias" }, { word: "banco" }],
    });
  }
  if (cmd === "complete_teaching_node_cmd") {
    return Promise.resolve({
      passed: true,
      next_section_id: "zh-es/U01-PRACTICE",
      streak_current: 3,
      daily_goal_lessons_today: 1,
      daily_goal_target: 3,
    });
  }
  if (cmd === "get_user_vocab_by_level_cmd") return Promise.resolve([]);
  if (cmd === "get_unknown_words_cmd") return Promise.resolve([]);
  if (cmd === "get_articles_cmd") {
    return Promise.resolve([
      {
        id: 11,
        original_title: "Banco Central sube tasas",
        original_body:
          "El banco central subió las tasas. Hola a todos, gracias por leer sobre la cuenta.",
      },
    ]);
  }
  if (cmd === "get_articles_reading_status_cmd") return Promise.resolve([]);
  return Promise.reject(new Error(`unexpected invoke: ${cmd}`));
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const screenshotsDir = join(__dirname, "../../../../screenshots");

function writeScreenshot(wrapper, name) {
  mkdirSync(screenshotsDir, { recursive: true });
  const outHtml = join(screenshotsDir, `${name}.html`);
  const outPng = join(screenshotsDir, `${name}.png`);
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
:root {
  --bg:#f5f5f5;--white:#fff;--surface:#fff;--text:#1a1a1a;--text-secondary:#666;
  --text-light:#666;--green:#58cc02;--blue:#1cb0f6;--blue-bg:#e8f4ff;--purple:#7c3aed;
  --purple-bg:#f3e8ff;--red:#ff4b4b;--radius-sm:8px;--radius-md:12px;--safe-bottom:0px;
}
*{box-sizing:border-box}html,body{margin:0;height:100%;font-family:system-ui,sans-serif;background:#f0f0f0}
#app{width:480px;height:800px;margin:0 auto;overflow:hidden;background:var(--bg)}
</style></head><body><div id="app">${wrapper.html()}</div></body></html>`;
  writeFileSync(outHtml, html);
  exec(
    `google-chrome --headless=new --disable-gpu --window-size=480,800 --screenshot=${outPng} file://${outHtml}`,
    { stdio: "inherit" },
  );
  return outPng;
}

describe.skipIf(!takeScreenshot)("screenshotLessonArticleMatch", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    setLocale("zh", { persist: false });
    api.__setInvoke(vi.fn().mockImplementation(teachingInvoke));
    lookupWordsMastery.mockResolvedValue([]);
    getDailyGoalProgress.mockResolvedValue({
      lessons_today: 1,
      target_lessons: 3,
      goal_met: false,
      streak_current: 3,
    });
    getArticle.mockResolvedValue({
      id: 11,
      original_title: "Banco Central sube tasas",
      rewritten_body:
        "El banco central subió las tasas. Hola a todos, gracias por leer sobre la cuenta bancaria.",
      rewrite_level: "A1",
      source: "sample",
    });
  });

  it("captures teaching summary recommendation and reader highlight", async () => {
    const teachingRouter = makeTeachingRouter();
    await teachingRouter.push({ name: "path-teaching", params: { nodeId: VOCAB_NODE_ID } });
    await teachingRouter.isReady();

    const teachingWrapper = mount(TeachingPage, {
      global: { plugins: [teachingRouter] },
    });
    await flushPromises();
    await teachingWrapper.find(".action-btn.primary").trigger("click");
    await flushPromises();

    expect(teachingWrapper.text()).toContain("在真实新闻里见见刚学的词");
    writeScreenshot(teachingWrapper, "lesson-article-match-teaching");

    const readerRouter = makeReaderRouter();
    await readerRouter.push({
      path: "/news/11",
      query: { lessonWords: "hola,gracias,banco" },
    });
    await readerRouter.isReady();

    const readerWrapper = mount(NewsReader, {
      props: { id: "11" },
      global: { plugins: [readerRouter] },
    });
    await flushPromises();
    writeScreenshot(readerWrapper, "lesson-article-match-reader");
  }, 30_000);
});