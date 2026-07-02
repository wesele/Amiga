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
const SECTION_ID = "zh-es/U01-PRACTICE";
const LessonPage = (await import("@/modules/path/LessonPage.vue")).default;

function makeRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: "/learn/path", name: "path", component: { template: "<div/>" } },
      {
        path: "/learn/path/lesson/:sectionId",
        name: "path-lesson",
        component: LessonPage,
      },
    ],
  });
}

function captureScreenshot(wrapper, filename) {
  const styles = readFileSync(resolve(ROOT, "src/modules/path/LessonPage.vue"), "utf8")
    .match(/<style scoped>([\s\S]*?)<\/style>/)?.[1] ?? "";
  const outDir = resolve(ROOT, "screenshots");
  const htmlPath = resolve(outDir, `${filename}.html`);
  const pngPath = resolve(outDir, `${filename}.png`);
  mkdirSync(outDir, { recursive: true });
  writeFileSync(
    htmlPath,
    `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
    * { box-sizing: border-box; }
    body { margin: 0; background: #f5f5f5; font-family: system-ui, sans-serif; }
    .lesson-page { width: 480px; margin: 0 auto; background: #fff; min-height: 800px; padding: 16px; }
    ${styles}
    </style></head><body>${wrapper.find(".lesson-page").html()}</body></html>`,
  );
  execSync(
    `google-chrome --headless=new --disable-gpu --window-size=480,1200 --screenshot=${pngPath} file://${htmlPath}`,
    { stdio: "inherit" },
  );
  rmSync(htmlPath);
  return pngPath;
}

describe("wrong-answer explanation screenshots", () => {
  let mockInvoke;

  beforeEach(() => {
    setActivePinia(createPinia());
    setLocale("zh", { persist: false });
    mockInvoke = vi.fn().mockImplementation((cmd) => {
      if (cmd === "get_current_user") {
        return Promise.resolve({ id: "u1", native_language: "zh" });
      }
      if (cmd === "get_target_language_cmd") return Promise.resolve("es");
      if (cmd === "get_learning_goals_cmd") {
        return Promise.resolve([{ target_language: "es", cefr_level: "A2" }]);
      }
      if (cmd === "get_section_lesson_cmd") {
        return Promise.resolve({
          section_title_native: "微讲解截图",
          questions: [
            {
              id: "t12-shot",
              type: "T12",
              scenario: "朋友问上周末做了什么",
              options: ["Fui al parque", "Voy al parque", "Iré al parque"],
              answerIdx: 0,
              pragmaticsNote: "问的是过去的事，要用过去时 fui。",
            },
            {
              id: "t05-shot",
              type: "T05",
              sentence: "Hola, me llamo ____.",
              options: ["Ana", "casa", "perro"],
              answerIdx: 0,
            },
          ],
        });
      }
      return Promise.resolve(null);
    });
    api.__setInvoke(mockInvoke);
  });

  it("renders T12 and T05 wrong-answer explanations for visual verification", async () => {
    const router = makeRouter();
    await router.push({ name: "path-lesson", params: { sectionId: SECTION_ID } });
    await router.isReady();

    const wrapper = mount(LessonPage, { global: { plugins: [router] } });
    await flushPromises();

    wrapper.vm.currentAnswer = 1;
    wrapper.vm.onPrimaryAction();
    await flushPromises();

    const t12Explanation = wrapper.find(".wrong-explanation");
    expect(t12Explanation.exists()).toBe(true);
    expect(t12Explanation.text()).toContain("过去时 fui");

    if (process.env.SCREENSHOT) {
      captureScreenshot(wrapper, "wrong-answer-t12");
    }

    wrapper.vm.onPrimaryAction();
    await flushPromises();

    wrapper.vm.currentAnswer = 1;
    wrapper.vm.onPrimaryAction();
    await flushPromises();

    const t05Explanation = wrapper.find(".wrong-explanation");
    expect(t05Explanation.exists()).toBe(true);
    expect(t05Explanation.text()).toContain("casa");

    if (process.env.SCREENSHOT) {
      captureScreenshot(wrapper, "wrong-answer-t05");
    }
  });
});