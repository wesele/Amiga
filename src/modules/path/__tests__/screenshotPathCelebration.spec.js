/**
 * Visual snapshot for issue #64 path completion celebration.
 * Run: SCREENSHOT=1 npm test -- --run src/modules/path/__tests__/screenshotPathCelebration.spec.js
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

vi.mock("@/shared/api.js", () => ({
  getPathCurriculum: vi.fn(),
  getCurrentUser: vi.fn().mockResolvedValue({ id: "u1", native_language: "zh" }),
  getLearningGoals: vi.fn().mockResolvedValue([{ target_language: "es", cefr_level: "A1" }]),
  getLearningStreak: vi.fn().mockResolvedValue({ current: 3 }),
  getTeachingContent: vi.fn(),
  updateLearningGoalCefr: vi.fn(),
}));

vi.mock("@/stores/targetLang.js", () => ({
  useTargetLangStore: () => ({
    code: "es",
    load: vi.fn().mockResolvedValue("es"),
  }),
}));

const PathMapPage = (await import("@/modules/path/PathMapPage.vue")).default;

describe.skipIf(!takeScreenshot)("screenshotPathCelebration", () => {
  beforeEach(() => {
    setLocale("zh", { persist: false });
    setActivePinia(createPinia());
    HTMLElement.prototype.scrollIntoView = vi.fn();
    globalThis.IntersectionObserver = class {
      observe() {}
      disconnect() {}
    };
  });

  it("writes path celebration toast screenshot", async () => {
    const api = await import("@/shared/api.js");
    api.getPathCurriculum.mockResolvedValue({
      status: "active",
      cefr: "A1",
      completed_sections: 3,
      total_sections: 4,
      total_stars: 6,
      units: [
        {
          id: "U01",
          title_native: "基础问候与自我介绍",
          title_target: "Saludos y presentación",
          sections: [
            {
              id: "zh-es/U01-GRAMMAR",
              kind: "grammar",
              title_native: "单元知识",
              title_target: "Gramática",
              locked: false,
              current: false,
              stars: 1,
              question_count: 1,
            },
            {
              id: "zh-es/U01-VOCAB",
              kind: "vocab",
              title_native: "单词学习",
              title_target: "Vocabulario",
              locked: false,
              current: false,
              stars: 1,
              question_count: 12,
            },
            {
              id: "zh-es/U01-S01",
              kind: "practice",
              title_native: "基础问候与回应",
              title_target: "Saludos básicos",
              locked: false,
              current: false,
              stars: 3,
              question_count: 8,
            },
            {
              id: "zh-es/U02-GRAMMAR",
              kind: "grammar",
              title_native: "自我介绍",
              title_target: "Presentación",
              locked: false,
              current: true,
              stars: 0,
              question_count: 1,
            },
          ],
        },
      ],
    });

    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: "/learn", name: "learn", component: { template: "<div/>" } },
        { path: "/learn/path", name: "path", component: PathMapPage },
      ],
    });
    await router.push({
      name: "path",
      query: {
        focus: "current",
        celebrate: "zh-es/U01-S01",
        stars: "3",
        kind: "practice",
        perfect: "1",
      },
    });
    await router.isReady();

    const host = document.createElement("div");
    document.body.appendChild(host);
    const wrapper = mount(PathMapPage, { global: { plugins: [router] }, attachTo: host });
    await flushPromises();
    await vi.waitUntil(() => wrapper.find(".path-scroll").exists(), { timeout: 2000 });
    await vi.waitUntil(() => document.body.querySelector(".celebration-toast"), { timeout: 2000 });

    const toast = document.body.querySelector(".celebration-toast");
    expect(toast).toBeTruthy();
    expect(wrapper.find(".path-step.is-celebrating").exists()).toBe(true);

    const root = join(dirname(fileURLToPath(import.meta.url)), "../../../..");
    const outDir = join(root, "screenshots");
    mkdirSync(outDir, { recursive: true });
    const outHtml = join(outDir, "issue64-path-celebration.html");
    const outPng = join(outDir, "issue64-path-celebration.png");

    const scopedCss = Array.from(document.querySelectorAll("style"))
      .map((s) => s.textContent)
      .join("\n");

    const mapHtml = wrapper.find(".path-map").html();
    const toastHtml = toast.outerHTML;

    const html = `<!DOCTYPE html>
<html lang="zh"><head><meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<style>
:root {
  --white:#fff;--surface:#fff;--text:#1a1a1a;--text-light:#666;--border:#e5e5e5;
  --green:#58cc02;--green-hover:#46a302;--green-bg:#e8f9d8;
  --orange-hover:#e65a00;--radius-sm:8px;--radius-md:12px;--safe-top:0px;--safe-bottom:0px;
}
*{box-sizing:border-box}html,body{margin:0;height:100%;font-family:system-ui,sans-serif}
#app{width:480px;height:800px;margin:0 auto;position:relative;overflow:hidden}
${scopedCss}
</style></head><body><div id="app">${mapHtml}${toastHtml}</div></body></html>`;

    writeFileSync(outHtml, html);
    exec(
      `google-chrome --headless=new --disable-gpu --window-size=480,800 --screenshot=${outPng} file://${outHtml}`,
      { stdio: "inherit" },
    );

    wrapper.unmount();
    host.remove();
  });
});