/**
 * Visual snapshot for learn hub today activity strip (#56).
 * Run: SCREENSHOT=1 npm test -- --run src/modules/learn/__tests__/screenshotTodayActivity.spec.js
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

const LearnHubPage = (await import("@/modules/learn/LearnHubPage.vue")).default;

const MOCK_CURRICULUM = {
  status: "active",
  units: [
    {
      id: "U01",
      title_native: "问候与介绍",
      sections: [
        {
          id: "zh-es/U01-PRACTICE",
          kind: "practice",
          title_native: "闯关练习",
          current: true,
          locked: false,
          question_count: 6,
        },
      ],
    },
  ],
};

function defaultInvoke(cmd) {
  if (cmd === "get_target_language_cmd") return Promise.resolve("es");
  if (cmd === "get_chat_sessions_cmd") return Promise.resolve([]);
  if (cmd === "get_current_user") {
    return Promise.resolve({ id: "u1", native_language: "zh" });
  }
  if (cmd === "get_learning_goals_cmd") {
    return Promise.resolve([{ target_language: "es", cefr_level: "A1" }]);
  }
  if (cmd === "get_path_curriculum_cmd") return Promise.resolve(MOCK_CURRICULUM);
  if (cmd === "get_weekly_activity_cmd") {
    return Promise.resolve({
      active_days: 2,
      days: Array.from({ length: 7 }, (_, i) => ({
        date: `2026-06-${27 + i}`,
        weekday: i,
        active: i >= 5,
        is_today: i === 6,
      })),
    });
  }
  if (cmd === "get_unknown_words_cmd") return Promise.resolve([]);
  if (cmd === "get_lesson_milestone_progress_cmd") {
    return Promise.resolve({ completed: 0, next_milestone: 10, progress_pct: 0 });
  }
  if (cmd === "get_learning_streak_cmd") {
    return Promise.resolve({ current: 3, longest: 3, practiced_today: true });
  }
  if (cmd === "get_perfect_lesson_streak_cmd") {
    return Promise.resolve({ current: 0, best: 0 });
  }
  if (cmd === "get_user_vocab_stats_cmd") {
    return Promise.resolve({ total_known: 0, total_learning: 0, total: 1000 });
  }
  return Promise.resolve(null);
}

function makeRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [{ path: "/learn", name: "learn", component: LearnHubPage }],
  });
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
  --surface:#fff;--surface-2:#f5f5f5;--surface-variant:#f5f5f5;--text:#1a1a1a;--text-light:#666;--text-lighter:#999;
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

describe.skipIf(!takeScreenshot)("screenshotTodayActivity", () => {
  let mockInvoke;

  beforeEach(() => {
    setLocale("zh", { persist: false });
    setActivePinia(createPinia());
    mockInvoke = vi.fn().mockImplementation(defaultInvoke);
    api.__setInvoke(mockInvoke);
  });

  it("writes reading-only today activity screenshot", async () => {
    mockInvoke.mockImplementation((cmd) => {
      if (cmd === "get_daily_goal_progress_cmd") {
        return Promise.resolve({
          lessons_today: 0,
          articles_read_today: 1,
          words_reviewed_today: 0,
          review_sessions_today: 0,
          target_lessons: 2,
          progress_pct: 0,
          goal_met: false,
          streak_current: 3,
          practiced_today: true,
        });
      }
      return defaultInvoke(cmd);
    });

    const router = makeRouter();
    const wrapper = mount(LearnHubPage, {
      global: { plugins: [router] },
    });
    await flushPromises();

    expect(wrapper.find(".today-activity-strip").exists()).toBe(true);
    writeScreenshot(wrapper, "issue56-today-activity-reading");
  });

  it("writes empty today activity screenshot", async () => {
    mockInvoke.mockImplementation((cmd) => {
      if (cmd === "get_daily_goal_progress_cmd") {
        return Promise.resolve({
          lessons_today: 0,
          articles_read_today: 0,
          words_reviewed_today: 0,
          review_sessions_today: 0,
          target_lessons: 2,
          progress_pct: 0,
          goal_met: false,
          streak_current: 0,
          practiced_today: false,
        });
      }
      return defaultInvoke(cmd);
    });

    const router = makeRouter();
    const wrapper = mount(LearnHubPage, {
      global: { plugins: [router] },
    });
    await flushPromises();

    expect(wrapper.find(".today-activity-empty").exists()).toBe(true);
    writeScreenshot(wrapper, "issue56-today-activity-empty");
  });
});