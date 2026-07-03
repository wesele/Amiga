/**
 * Visual snapshot for issue #51 vocab review next-steps panel.
 * Run: SCREENSHOT=1 npm test -- --run src/modules/vocab/__tests__/screenshotVocabReviewPlan.spec.js
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
import { saveReadingSessionSummary } from "@/modules/news/readingSession.js";
import * as vocabRatingFeedback from "../vocabRatingFeedback.js";

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

const VocabReviewPage = (await import("@/modules/vocab/VocabReviewPage.vue")).default;

const MOCK_WORDS = [
  {
    id: 1,
    word: "algorithm",
    mastery: 1,
    definition_zh: "算法",
    source: "news_reading",
  },
  {
    id: 2,
    word: "deploy",
    mastery: null,
    definition_zh: "部署",
    source: "news_reading",
  },
  {
    id: 3,
    word: "latency",
    mastery: null,
    definition_zh: "延迟",
    source: "news_reading",
  },
  {
    id: 4,
    word: "cluster",
    mastery: null,
    definition_zh: "集群",
    source: "news_reading",
  },
];

function makeRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: "/learn", name: "learn", component: { template: "<div />" } },
      { path: "/news", name: "news", component: { template: "<div />" } },
      { path: "/vocab/review", name: "vocab-review", component: VocabReviewPage },
    ],
  });
}

function defaultInvoke(cmd, args) {
  if (cmd === "get_target_language_cmd") return Promise.resolve("es");
  if (cmd === "get_current_user") {
    return Promise.resolve({ id: "u1", native_language: "zh" });
  }
  if (cmd === "get_learning_goals_cmd") {
    return Promise.resolve([{ target_language: "es", cefr_level: "A1" }]);
  }
  if (cmd === "get_unknown_words_cmd") return Promise.resolve(MOCK_WORDS);
  if (cmd === "update_word_mastery_cmd") return Promise.resolve();
  if (cmd === "record_review_practice_cmd") {
    return Promise.resolve({
      streak: { extended: true, current: 5 },
      daily_goal_just_met: false,
      daily_goal: {
        lessons_today: 1,
        review_sessions_today: 1,
        effective_lessons_today: 1,
        target_lessons: 2,
        goal_met: false,
      },
    });
  }
  if (cmd === "get_user_vocab_stats_cmd") {
    return Promise.resolve({ total_known: 10, total_learning: 4, total: 1000 });
  }
  if (cmd === "get_path_curriculum_cmd") {
    return Promise.resolve({
      status: "active",
      units: [
        {
          sections: [
            {
              id: "zh-es/U01-GRAMMAR",
              kind: "grammar",
              title_native: "基础语法",
              current: true,
              locked: false,
            },
          ],
        },
      ],
    });
  }
  if (cmd === "get_articles_cmd") {
    return Promise.resolve([
      { id: 1, title: "Tech news" },
      { id: 2, title: "Science news" },
    ]);
  }
  if (cmd === "get_articles_reading_status_cmd") {
    return Promise.resolve([{ article_id: 1, read_at: null }, { article_id: 2, read_at: null }]);
  }
  return Promise.resolve(null);
}

async function completeReview(wrapper) {
  for (let i = 0; i < MOCK_WORDS.length; i += 1) {
    await wrapper.find(".flashcard").trigger("click");
    await wrapper.find(".review-footer .action-btn.primary").trigger("click");
    await flushPromises();
  }
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
  --green:#58cc02;--green-hover:#4cb302;--green-bg:#e8f8ef;--orange-bg:#fff4e5;
  --orange-hover:#c45c00;--blue:#1cb0f6;--blue-hover:#0d8ecf;--primary:#58cc02;
  --radius-sm:8px;--radius-md:12px;--radius-lg:16px;
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

describe.skipIf(!takeScreenshot)("screenshotVocabReviewPlan", () => {
  beforeEach(() => {
    sessionStorage.clear();
    setActivePinia(createPinia());
    setLocale("zh", { persist: false });
    api.__setInvoke(vi.fn().mockImplementation(defaultInvoke));
    vi.mocked(vocabRatingFeedback.waitVocabRatingAck).mockImplementation(() => Promise.resolve());
  });

  it("writes reading-session completion with news next step", async () => {
    saveReadingSession();

    const router = makeRouter();
    await router.push({ name: "vocab-review", query: { from: "reading" } });
    const wrapper = mount(VocabReviewPage, {
      global: { plugins: [router] },
    });
    await flushPromises();
    await completeReview(wrapper);

    expect(wrapper.find(".next-steps-panel").exists()).toBe(true);
    expect(wrapper.text()).toContain("回新闻继续阅读");
    writeScreenshot(wrapper, "issue51-vocab-review-reading");
  });

  it("writes generic completion with continue-review primary", async () => {
    api.__setInvoke(
      vi.fn().mockImplementation((cmd, args) => {
        if (cmd === "get_unknown_words_cmd") {
          if (args?.limit === 50) return Promise.resolve(MOCK_WORDS);
          return Promise.resolve(MOCK_WORDS.slice(0, 2));
        }
        return defaultInvoke(cmd, args);
      }),
    );

    const router = makeRouter();
    await router.push("/vocab/review");
    const wrapper = mount(VocabReviewPage, {
      global: { plugins: [router] },
    });
    await flushPromises();

    for (let i = 0; i < 2; i += 1) {
      await wrapper.find(".flashcard").trigger("click");
      await wrapper.find(".review-footer .action-btn.primary").trigger("click");
      await flushPromises();
    }

    expect(wrapper.find(".next-steps-panel").exists()).toBe(true);
    expect(wrapper.text()).toContain("继续复习");
    writeScreenshot(wrapper, "issue51-vocab-review-continue");
  });
});

function saveReadingSession() {
  saveReadingSessionSummary({
    unknownCount: MOCK_WORDS.length,
    words: MOCK_WORDS.map((entry) => ({
      word: entry.word,
      context: `News context for ${entry.word}`,
      articleId: 1,
    })),
  });
}