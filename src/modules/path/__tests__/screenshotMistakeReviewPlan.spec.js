/**
 * Visual snapshot for issue #53 mistake review next-steps panel.
 * Run: SCREENSHOT=1 npm test -- --run src/modules/path/__tests__/screenshotMistakeReviewPlan.spec.js
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { createRouter, createMemoryHistory } from "vue-router";
import { writeFileSync, mkdirSync } from "node:fs";
import { execSync as exec } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { setLocale } from "@/shared/i18n";
import * as api from "@/shared/api.js";
import { MISTAKE_REVIEW_SESSION_LIMIT } from "../mistakeReviewStore.js";
import { saveMistakeQueue } from "../mistakeReviewStore.js";

const takeScreenshot = process.env.SCREENSHOT === "1";

vi.mock("@tauri-apps/plugin-shell", () => ({}));

vi.mock("@/shared/learningContext.js", () => ({
  loadLearningContext: vi.fn().mockResolvedValue({
    user: { id: "u1" },
    nativeLang: "zh",
    targetLang: "es",
    cefr: "A1",
  }),
}));

vi.mock("@/shared/reviewStreak.js", () => ({
  applyReviewStreak: vi.fn().mockResolvedValue({
    streak: { extended: true, current: 4 },
    daily_goal_just_met: false,
    daily_goal: {
      lessons_today: 1,
      effective_lessons_today: 1,
      target_lessons: 2,
      goal_met: false,
    },
  }),
  reviewStreakCelebration: vi.fn(() => ""),
  reviewDailyGoalCelebration: vi.fn(() => ""),
  reviewDailyGoalNudge: vi.fn(() => ""),
  reviewDailyGoalContributed: vi.fn(() => ""),
}));

vi.mock("@/shared/lessonFeedback.js", () => ({
  playAnswerFeedback: vi.fn(),
}));

vi.mock("@/modules/ai-chat/openAiContact.js", () => ({
  openAiContact: vi.fn().mockResolvedValue(true),
}));

const MistakeReviewPage = (await import("@/modules/path/MistakeReviewPage.vue")).default;

const REVIEW_ANSWER = "ok";
const PAIR = "zh-es";

function makeRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: "/learn", name: "learn", component: { template: "<div />" } },
      {
        path: "/learn/path/mistake-review",
        name: "path-mistake-review",
        component: MistakeReviewPage,
      },
    ],
  });
}

function seedDueMistakes(count) {
  const now = 1000;
  const items = Array.from({ length: count }, (_, i) => ({
    question_id: `q${i + 1}`,
    pair_key: PAIR,
    question: {
      id: `q${i + 1}`,
      type: "T09",
      hint: `word-${i + 1}`,
      answer: REVIEW_ANSWER,
    },
    user_answer: "wrong",
    wrong_at: now + i,
    level: 0,
    next_review_at: 0,
  }));
  saveMistakeQueue(items);
}

function defaultInvoke(cmd) {
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
  if (cmd === "get_unknown_words_cmd") return Promise.resolve([]);
  if (cmd === "get_articles_cmd") return Promise.resolve([]);
  if (cmd === "get_articles_reading_status_cmd") return Promise.resolve([]);
  return Promise.resolve(null);
}

async function completeMistakeReviewSession(wrapper) {
  while (!wrapper.find(".summary").exists()) {
    const input = wrapper.find(".text-input");
    if (!input.exists()) break;
    await input.setValue(REVIEW_ANSWER);
    await wrapper.find(".action-btn.primary").trigger("click");
    await flushPromises();
    await wrapper.find(".action-btn.primary").trigger("click");
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

describe.skipIf(!takeScreenshot)("screenshotMistakeReviewPlan", () => {
  beforeEach(() => {
    localStorage.clear();
    setLocale("zh", { persist: false });
    api.__setInvoke(vi.fn().mockImplementation(defaultInvoke));
  });

  it("writes backlog completion with continue-review primary", async () => {
    seedDueMistakes(MISTAKE_REVIEW_SESSION_LIMIT * 2);

    const router = makeRouter();
    await router.push({ name: "path-mistake-review" });
    const wrapper = mount(MistakeReviewPage, {
      global: { plugins: [router] },
    });
    await flushPromises();
    await completeMistakeReviewSession(wrapper);

    expect(wrapper.find(".next-steps-panel").exists()).toBe(true);
    expect(wrapper.text()).toContain("继续复习");
    writeScreenshot(wrapper, "issue53-mistake-review-continue");
  });

  it("writes cleared backlog with daily-goal next lesson primary", async () => {
    seedDueMistakes(1);

    const router = makeRouter();
    await router.push({ name: "path-mistake-review" });
    const wrapper = mount(MistakeReviewPage, {
      global: { plugins: [router] },
    });
    await flushPromises();
    await completeMistakeReviewSession(wrapper);

    expect(wrapper.find(".next-steps-panel").exists()).toBe(true);
    expect(wrapper.text()).toContain("继续下一课");
    writeScreenshot(wrapper, "issue53-mistake-review-daily-goal");
  });
});