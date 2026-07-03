/**
 * Visual snapshot for issue #73 global nav + module badges.
 * Run: SCREENSHOT=1 npm test -- --run src/modules/shell/__tests__/screenshotNavBadges.spec.js
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

vi.mock("@tauri-apps/plugin-shell", () => ({}));

vi.mock("@/modules/shell/loadNavAttentionContext.js", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    loadNavAttentionContext: vi.fn().mockResolvedValue({
      dailyGoal: { target_lessons: 2, lessons_today: 0, streak_current: 8, practiced_today: false },
      dueVocabCount: 5,
      dueMistakes: 2,
      newsUnreadCount: 3,
      resumeTarget: {
        section: {
          id: "zh-es/U01-PRACTICE",
          kind: "practice",
          question_count: 10,
          locked: false,
        },
      },
      pendingAiPractice: { source: "reading", words: ["hola", "gracias", "adiós"], at: Date.now() },
      localHour: 20,
    }),
    shouldForceNavAttentionRefresh: vi.fn().mockReturnValue(false),
  };
});

const AppShell = (await import("@/modules/shell/AppShell.vue")).default;
const LearnHubPage = (await import("@/modules/learn/LearnHubPage.vue")).default;

const MOCK_CURRICULUM = {
  status: "active",
  units: [
    {
      sections: [
        {
          id: "zh-es/U01-PRACTICE",
          kind: "practice",
          current: true,
          locked: false,
          question_count: 10,
          title_native: "闯关练习",
        },
      ],
    },
  ],
};

function defaultInvoke(cmd) {
  if (cmd === "get_target_language_cmd") return Promise.resolve("es");
  if (cmd === "get_current_user") {
    return Promise.resolve({ id: "u1", native_language: "zh" });
  }
  if (cmd === "get_learning_goals_cmd") {
    return Promise.resolve([{ target_language: "es", cefr_level: "A1" }]);
  }
  if (cmd === "get_path_curriculum_cmd") return Promise.resolve(MOCK_CURRICULUM);
  if (cmd === "get_daily_goal_progress_cmd") {
    return Promise.resolve({
      lessons_today: 1,
      target_lessons: 2,
      progress_pct: 50,
      goal_met: false,
      streak_current: 3,
      practiced_today: true,
    });
  }
  if (cmd === "get_weekly_activity_cmd") {
    return Promise.resolve({ active_days: 1, days: [] });
  }
  if (cmd === "get_unknown_words_cmd") {
    return Promise.resolve([
      { word: "hola" },
      { word: "gracias" },
      { word: "adiós" },
      { word: "buenos" },
      { word: "días" },
    ]);
  }
  if (cmd === "get_articles_cmd") {
    return Promise.resolve([
      { id: 1, original_title: "新闻 A", hot_rank: 1 },
      { id: 2, original_title: "新闻 B", hot_rank: 2 },
      { id: 3, original_title: "新闻 C", hot_rank: 3 },
    ]);
  }
  if (cmd === "get_articles_reading_status_cmd") return Promise.resolve([]);
  if (cmd === "get_perfect_lesson_streak_cmd") {
    return Promise.resolve({ current: 0, best: 0 });
  }
  return Promise.resolve(null);
}

function makeRouter() {
  return createRouter({
    history: createMemoryHistory("/profile"),
    routes: [
      { path: "/", redirect: "/profile" },
      { path: "/learn", name: "learn", component: LearnHubPage },
      { path: "/profile", name: "profile", component: { template: "<div>profile</div>" } },
    ],
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
  --bg:#f5f5f5;--white:#fff;--surface:#fff;--text:#1a1a1a;--text-lighter:#999;
  --green:#58cc02;--green-hover:#4cb302;--green-bg:#e8f8ef;
  --purple:#7c3aed;--purple-bg:#ede9fe;--border:#e5e5e5;
  --radius-sm:8px;--radius-md:12px;--transition:0.15s ease;
}
body { margin:0; background:var(--bg); font-family:system-ui,sans-serif; }
.app-shell, .learn-hub { width:480px; margin:0 auto; }
</style>
<link rel="stylesheet" href="file://${join(root, "src/style.css")}" />
</head><body>${wrapper.html()}</body></html>`;

  writeFileSync(outHtml, html);
  exec(`wkhtmltoimage --width 480 --height 800 "${outHtml}" "${outPng}"`, { stdio: "pipe" });
}

describe("screenshotNavBadges", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    api.__setInvoke(vi.fn().mockImplementation(defaultInvoke));
    setLocale("zh");
  });

  it("renders cross-tab nav badges and learn hub module badges", async () => {
    const router = makeRouter();
    const shell = mount(AppShell, {
      global: {
        plugins: [router],
        stubs: { RouterView: false },
      },
    });
    await flushPromises();
    await router.push("/profile");
    await flushPromises();

    expect(shell.findAll(".nav-badge").length).toBe(2);

    await router.push("/learn");
    await flushPromises();
    expect(shell.findAll(".module-badge").length).toBeGreaterThanOrEqual(3);

    if (takeScreenshot) {
      await router.push("/profile");
      await flushPromises();
      writeScreenshot(shell, "nav-badges-cross-tab");
      await router.push("/learn");
      await flushPromises();
      writeScreenshot(shell, "nav-badges-learn-modules");
    }
  });
});