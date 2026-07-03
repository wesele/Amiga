/**
 * Visual snapshot for issue #82 vocab context revisit.
 * Run: SCREENSHOT=1 npm test -- --run src/modules/vocab/__tests__/screenshotVocabContextRevisit.spec.js
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
import * as api from "@/shared/api.js";

const takeScreenshot = process.env.SCREENSHOT === "1";

vi.mock("@tauri-apps/plugin-shell", () => ({}));

vi.mock("../vocabRatingFeedback.js", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    waitVocabRatingAck: vi.fn(() => Promise.resolve()),
    playVocabRatingFeedback: vi.fn(),
  };
});

const {
  lookupWordsMastery,
  ensureWordsSeen,
  getArticle,
  getDailyGoalProgress,
  getArticles,
  getArticlesReadingStatus,
  getPathCurriculum,
  getComprehensionQuiz,
} = vi.hoisted(() => ({
  lookupWordsMastery: vi.fn().mockResolvedValue([]),
  ensureWordsSeen: vi.fn().mockResolvedValue(undefined),
  getArticle: vi.fn(),
  getDailyGoalProgress: vi.fn().mockResolvedValue({
    streak_current: 0,
    practiced_today: false,
    goal_met: false,
    target_lessons: 2,
    lessons_today: 0,
  }),
  getArticles: vi.fn().mockResolvedValue([]),
  getArticlesReadingStatus: vi.fn().mockResolvedValue([]),
  getPathCurriculum: vi.fn().mockResolvedValue({ status: "active", units: [] }),
  getComprehensionQuiz: vi.fn().mockResolvedValue(null),
}));

vi.mock("@/shared/api.js", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    getArticle,
    lookupWordsMastery,
    ensureWordsSeen,
    getDailyGoalProgress,
    getArticles,
    getArticlesReadingStatus,
    getPathCurriculum,
    getComprehensionQuiz,
  };
});

const VocabReviewPage = (await import("@/modules/vocab/VocabReviewPage.vue")).default;
const NewsReader = (await import("@/modules/news/NewsReader.vue")).default;

function makeRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: "/learn", name: "learn", component: { template: "<div />" } },
      { path: "/vocab/review", name: "vocab-review", component: VocabReviewPage },
      {
        path: "/news/:id",
        name: "reader",
        component: NewsReader,
        props: true,
      },
    ],
  });
}

function defaultInvoke(cmd) {
  if (cmd === "get_target_language_cmd") return Promise.resolve("es");
  if (cmd === "get_current_user") {
    return Promise.resolve({ id: "u1", native_language: "zh" });
  }
  if (cmd === "get_learning_goals_cmd") {
    return Promise.resolve([{ target_language: "es", cefr_level: "A1" }]);
  }
  if (cmd === "get_unknown_words_cmd") {
    return Promise.resolve([
      {
        id: 1,
        word: "frontera",
        mastery: 1,
        definition_zh: "边境",
        example: "Cruzaron la frontera al amanecer.",
        source: "news_reading",
        has_user_context: true,
        context_article_id: 42,
      },
      {
        id: 2,
        word: "mercado",
        mastery: null,
        definition_zh: "市场",
      },
    ]);
  }
  if (cmd === "update_word_mastery_cmd") return Promise.resolve();
  if (cmd === "get_user_vocab_stats_cmd") {
    return Promise.resolve({ total_known: 12, total_learning: 4, total: 1000 });
  }
  return Promise.resolve(null);
}

function writeScreenshot(wrapper, filename) {
  const root = join(dirname(fileURLToPath(import.meta.url)), "../../../..");
  const outDir = join(root, "screenshots");
  mkdirSync(outDir, { recursive: true });
  const outHtml = join(outDir, `${filename}.html`);
  const outPng = join(outDir, `${filename}.png`);

  const html = `<!DOCTYPE html>
<html lang="zh"><head><meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<style>
:root {
  --bg:#f5f5f5;--white:#fff;--surface:#fff;--surface-variant:#f5f5f5;--text:#1a1a1a;
  --text-secondary:#666;--text-light:#666;--text-lighter:#999;--border:#e5e5e5;
  --gray-light:#f0f0f0;--green:#58cc02;--green-hover:#46a302;--green-bg:#e8f8ef;
  --orange:#ff9600;--orange-bg:#fff4e5;--orange-hover:#c45c00;--blue:#1cb0f6;
  --primary:#58cc02;--radius-sm:8px;--radius-md:12px;--radius-lg:16px;
}
*{box-sizing:border-box}html,body{margin:0;height:100%;font-family:system-ui,sans-serif;background:#f0f0f0}
#app{width:480px;height:800px;margin:0 auto;overflow:hidden;background:var(--bg)}
mark{background:rgba(88,204,2,.25);color:inherit;border-radius:2px;padding:0 1px}
</style></head><body><div id="app">${wrapper.html()}</div></body></html>`;

  writeFileSync(outHtml, html);
  exec(
    `google-chrome --headless=new --disable-gpu --window-size=480,800 --screenshot=${outPng} file://${outHtml}`,
    { stdio: "inherit" },
  );
  return outPng;
}

describe.skipIf(!takeScreenshot)("screenshotVocabContextRevisit", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    setLocale("zh", { persist: false });
    sessionStorage.clear();
    api.__setInvoke(vi.fn().mockImplementation(defaultInvoke));
    getArticle.mockResolvedValue({
      id: 42,
      original_title: "Migración",
      rewritten_body: "Cruzaron la frontera al amanecer. Muchas familias buscan asilo.",
      rewrite_level: "A1",
      source: "sample",
    });
  });

  it("writes flashcard back with revisit link", async () => {
    const router = makeRouter();
    await router.push("/vocab/review");
    const wrapper = mount(VocabReviewPage, {
      global: { plugins: [router] },
    });
    await flushPromises();

    await wrapper.find(".flashcard").trigger("click");
    await flushPromises();

    expect(wrapper.find(".flashcard-revisit-link").exists()).toBe(true);
    writeScreenshot(wrapper, "issue82-vocab-context-revisit-back");
  });

  it("writes reader with vocab context highlight strip", async () => {
    sessionStorage.setItem(
      "amiga:vocabContextRevisitPayload",
      JSON.stringify({
        articleId: 42,
        sentence: "Cruzaron la frontera al amanecer.",
        word: "frontera",
      }),
    );

    const router = makeRouter();
    await router.push({
      path: "/news/42",
      query: { vocabContextRevisit: "1", returnTo: "vocab-review" },
    });
    const wrapper = mount(NewsReader, {
      props: { id: "42" },
      global: { plugins: [router] },
    });
    await flushPromises();
    await flushPromises();

    expect(wrapper.text()).toContain("高亮为复习语境句");
    writeScreenshot(wrapper, "issue82-vocab-context-revisit-reader");
  });

  it("writes context reinforcement nudge after still learning", async () => {
    const router = makeRouter();
    await router.push("/vocab/review");
    const wrapper = mount(VocabReviewPage, {
      global: { plugins: [router] },
    });
    await flushPromises();

    await wrapper.find(".flashcard").trigger("click");
    await flushPromises();
    await wrapper.find(".review-footer .action-btn.secondary").trigger("click");
    await flushPromises();

    expect(wrapper.find(".context-reinforce-nudge").exists()).toBe(true);
    writeScreenshot(wrapper, "issue84-vocab-context-reinforce-nudge");
  });
});