/**
 * @vitest-environment happy-dom
 */
import { execSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMemoryHistory, createRouter } from "vue-router";
import { flushPromises, mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import * as api from "@/shared/api.js";
import { setLocale } from "@/shared/i18n";

const ROOT = resolve(__dirname, "../../../..");
const AchievementsPage = (await import("@/modules/achievements/AchievementsPage.vue")).default;

function makeRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: "/achievements", name: "achievements", component: AchievementsPage },
      { path: "/path", name: "path", component: { template: "<div/>" } },
    ],
  });
}

function captureScreenshot(wrapper, filename) {
  const styles = readFileSync(resolve(ROOT, "src/modules/achievements/AchievementsPage.vue"), "utf8")
    .match(/<style scoped>([\s\S]*?)<\/style>/)?.[1] ?? "";
  const outDir = resolve(ROOT, "screenshots");
  const htmlPath = resolve(outDir, `${filename}.html`);
  const pngPath = resolve(outDir, `${filename}.png`);
  mkdirSync(outDir, { recursive: true });
  writeFileSync(
    htmlPath,
    `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
    :root {
      --bg: #f5f5f5;
      --white: #fff;
      --surface: #fff;
      --surface-variant: #f0f0f0;
      --green-bg: #e8f7ef;
      --green: #2e9e6a;
      --text: #1a1a1a;
      --text-light: #666;
      --text-lighter: #999;
      --radius-md: 12px;
      --radius-sm: 8px;
      --transition: 0.2s ease;
      --safe-bottom: 0px;
    }
    * { box-sizing: border-box; }
    body { margin: 0; background: var(--bg); font-family: system-ui, sans-serif; }
    .achievements-page { width: 480px; margin: 0 auto; min-height: 800px; }
    ${styles}
    </style></head><body>${wrapper.find(".achievements-page").html()}</body></html>`,
  );
  execSync(
    `google-chrome --headless=new --disable-gpu --window-size=480,1200 --screenshot=${pngPath} file://${htmlPath}`,
    { stdio: "inherit" },
  );
  rmSync(htmlPath);
  return pngPath;
}

describe("achievements page screenshot", () => {
  let mockInvoke;

  beforeEach(() => {
    localStorage.clear();
    setActivePinia(createPinia());
    setLocale("zh", { persist: false });
    mockInvoke = vi.fn();
    api.__setInvoke(mockInvoke);
  });

  it(
    "captures grouped badges and next-badge hero card",
    async () => {
    mockInvoke.mockImplementation((cmd) => {
      if (cmd === "get_current_user") return Promise.resolve({ id: "u1", native_language: "zh" });
      if (cmd === "get_learning_goals_cmd") {
        return Promise.resolve([{ id: 1, target_language: "es", cefr_level: "A1" }]);
      }
      if (cmd === "get_target_language_cmd") return Promise.resolve("es");
      if (cmd === "get_user_vocab_stats_cmd") {
        return Promise.resolve({ total_known: 80, total_learning: 5, total: 85 });
      }
      if (cmd === "get_learning_streak_cmd") {
        return Promise.resolve({ current: 5, longest: 14, practiced_today: true });
      }
      if (cmd === "get_lesson_milestone_progress_cmd") {
        return Promise.resolve({ completed: 18, next_milestone: 25, progress_pct: 53 });
      }
      if (cmd === "get_perfect_lesson_streak_cmd") {
        return Promise.resolve({ current: 2, best: 2 });
      }
      return Promise.resolve(null);
    });

    const router = makeRouter();
    await router.push("/achievements");
    await router.isReady();
    const wrapper = mount(AchievementsPage, { global: { plugins: [router] } });
    await flushPromises();

    expect(wrapper.text()).toContain("下一枚徽章");
    expect(wrapper.text()).toContain("课时徽章");
    const pngPath = captureScreenshot(wrapper, "achievements-polish");
    expect(pngPath).toContain("achievements-polish.png");
    },
    30_000,
  );
});