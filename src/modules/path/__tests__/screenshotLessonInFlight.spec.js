/**
 * Visual snapshot for issue #67 lesson in-flight briefing.
 * Run: SCREENSHOT=1 npm test -- --run src/modules/path/__tests__/screenshotLessonInFlight.spec.js
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
import {
  buildLessonInFlightSnapshot,
  buildPairKey,
  saveLessonInFlight,
} from "../lessonInFlight.js";

const takeScreenshot = process.env.SCREENSHOT === "1";

vi.mock("@/shared/api.js", () => ({
  getPathCurriculum: vi.fn(),
  getCurrentUser: vi.fn().mockResolvedValue({ id: "u1", native_language: "zh" }),
  getLearningGoals: vi.fn().mockResolvedValue([{ target_language: "es", cefr_level: "A1" }]),
  getLearningStreak: vi.fn().mockResolvedValue({ current: 3 }),
  getTeachingContent: vi.fn().mockResolvedValue({
    grammar_points: ["ser 和 estar 的基本区别"],
    words: [{ word: "hola" }, { word: "gracias" }],
    goal_native: "掌握基础问候用语",
  }),
  updateLearningGoalCefr: vi.fn(),
}));

vi.mock("@/stores/targetLang.js", () => ({
  useTargetLangStore: () => ({
    code: "es",
    load: vi.fn().mockResolvedValue("es"),
  }),
}));

const PathMapPage = (await import("@/modules/path/PathMapPage.vue")).default;

describe.skipIf(!takeScreenshot)("screenshotLessonInFlight", () => {
  beforeEach(() => {
    setLocale("zh", { persist: false });
    setActivePinia(createPinia());
    localStorage.clear();
    HTMLElement.prototype.scrollIntoView = vi.fn();
    globalThis.IntersectionObserver = class {
      observe() {}
      disconnect() {}
    };
  });

  it("writes briefing sheet with in-flight practice progress", async () => {
    saveLessonInFlight(
      buildLessonInFlightSnapshot({
        pairKey: buildPairKey("zh", "es", "A1"),
        sectionId: "zh-es/U01-S01",
        questions: Array.from({ length: 15 }, (_, idx) => ({ id: `q${idx + 1}` })),
        index: 7,
        correctCount: 6,
        comboCount: 3,
      }),
    );

    const api = await import("@/shared/api.js");
    api.getPathCurriculum.mockResolvedValue({
      status: "active",
      cefr: "A1",
      completed_sections: 2,
      total_sections: 4,
      total_stars: 2,
      units: [
        {
          id: "U01",
          title_native: "基础问候与自我介绍",
          title_target: "Saludos y presentación",
          sections: [
            {
              id: "zh-es/U01-S01",
              kind: "practice",
              title_native: "基础问候与回应",
              title_target: "Saludos básicos",
              locked: false,
              current: true,
              stars: 0,
              question_count: 15,
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
    await router.push("/learn/path");
    await router.isReady();

    const host = document.createElement("div");
    document.body.appendChild(host);
    const wrapper = mount(PathMapPage, { global: { plugins: [router] }, attachTo: host });
    await flushPromises();
    await vi.waitUntil(() => wrapper.find(".path-scroll").exists(), { timeout: 2000 });

    await wrapper.find(".path-node.practice:not([disabled])").trigger("click");
    await flushPromises();
    await vi.waitUntil(() => document.body.querySelector(".briefing-in-flight"), {
      timeout: 2000,
    });

    const inFlight = document.body.querySelector(".briefing-in-flight");
    expect(inFlight?.textContent).toContain("8/15");

    const root = join(dirname(fileURLToPath(import.meta.url)), "../../../..");
    const outDir = join(root, "screenshots");
    mkdirSync(outDir, { recursive: true });
    const outHtml = join(outDir, "issue67-lesson-in-flight-briefing.html");
    const outPng = join(outDir, "issue67-lesson-in-flight-briefing.png");

    const scopedCss = PathMapPage.__scopeId
      ? Array.from(document.querySelectorAll("style"))
          .map((s) => s.textContent)
          .join("\n")
      : "";

    const html = `<!DOCTYPE html>
<html lang="zh"><head><meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<style>
:root {
  --white:#fff;--surface:#fff;--text:#1a1a1a;--text-light:#666;--border:#e5e5e5;
  --green:#58cc02;--green-hover:#46a302;--green-bg:#e8f9d8;
  --radius-sm:8px;--radius-md:12px;--safe-bottom:0px;
}
*{box-sizing:border-box}html,body{margin:0;height:100%;font-family:system-ui,sans-serif;background:rgba(0,0,0,.45)}
#app{width:480px;height:800px;margin:0 auto;position:relative;overflow:hidden}
${scopedCss}
</style></head><body><div id="app">${document.body.querySelector(".briefing-overlay").outerHTML}</div></body></html>`;

    writeFileSync(outHtml, html);
    exec(
      `google-chrome --headless=new --disable-gpu --window-size=480,800 --screenshot=${outPng} file://${outHtml}`,
      { stdio: "inherit" },
    );

    wrapper.unmount();
    host.remove();
  });
});