/**
 * Visual snapshot for issue #62 focus practice next-steps panel.
 * Run: SCREENSHOT=1 npm test -- --run src/modules/path/__tests__/screenshotFocusPracticePlan.spec.js
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
    streak: { extended: true, current: 3 },
    daily_goal_just_met: false,
    daily_goal: {
      goal_met: false,
      effective_lessons_today: 1,
      target_lessons: 2,
    },
  }),
  reviewStreakCelebration: vi.fn(() => "🔥 3 天连胜！"),
}));

vi.mock("@/shared/lessonFeedback.js", () => ({
  playAnswerFeedback: vi.fn(),
}));

vi.mock("@/modules/ai-chat/openAiContact.js", () => ({
  openAiContact: vi.fn().mockResolvedValue(true),
}));

const FocusPracticePage = (await import("@/modules/path/FocusPracticePage.vue")).default;

const MOCK_QUESTION = {
  id: "q-focus-1",
  type: "T09",
  hint: "hello",
  answer: "hola",
};

function makeRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: "/learn", name: "learn", component: { template: "<div />" } },
      {
        path: "/learn/path/practice/:typeId",
        name: "path-focus-practice",
        component: FocusPracticePage,
      },
    ],
  });
}

function defaultInvoke(cmd) {
  if (cmd === "get_focus_practice_cmd") {
    return Promise.resolve({
      question_type: "T09",
      questions: [MOCK_QUESTION],
    });
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
  if (cmd === "get_unknown_words_cmd") return Promise.resolve([]);
  if (cmd === "get_articles_cmd") return Promise.resolve([]);
  if (cmd === "get_articles_reading_status_cmd") return Promise.resolve([]);
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

describe.skipIf(!takeScreenshot)("screenshotFocusPracticePlan", () => {
  beforeEach(() => {
    localStorage.clear();
    setLocale("zh", { persist: false });
    api.__setInvoke(vi.fn().mockImplementation(defaultInvoke));
  });

  it("writes imperfect round with continue-focus primary", async () => {
    const router = makeRouter();
    await router.push({ name: "path-focus-practice", params: { typeId: "T09" } });
    const wrapper = mount({ template: "<router-view />" }, {
      global: { plugins: [router] },
    });
    await flushPromises();

    await wrapper.find("input").setValue("wrong");
    await wrapper.find(".review-footer .action-btn.primary").trigger("click");
    await flushPromises();
    await wrapper.find(".review-footer .action-btn.primary").trigger("click");
    await flushPromises();

    expect(wrapper.find(".next-steps-panel").exists()).toBe(true);
    expect(wrapper.text()).toContain("再练一轮");
    writeScreenshot(wrapper, "issue62-focus-practice-continue");
  });
});