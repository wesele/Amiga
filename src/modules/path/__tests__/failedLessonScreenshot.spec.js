/**
 * @vitest-environment happy-dom
 */
import { execSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
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

function lessonPayload() {
  return {
    section_title_native: "闯关练习",
    questions: [
      {
        id: "q1",
        type: "T05",
        sentence: "Hola, me llamo ____.",
        options: ["Ana", "casa", "perro", "libro"],
        answerIdx: 0,
      },
    ],
  };
}

describe("failed lesson recovery screenshot", () => {
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
        return Promise.resolve([{ target_language: "es", cefr_level: "A1" }]);
      }
      if (cmd === "get_section_lesson_cmd") return Promise.resolve(lessonPayload());
      if (cmd === "complete_section_cmd") {
        return Promise.resolve({ passed: false, stars: 0 });
      }
      return Promise.resolve(null);
    });
    api.__setInvoke(mockInvoke);
  });

  it("renders recovery panel markup for visual verification", async () => {
    const router = makeRouter();
    await router.push({ name: "path-lesson", params: { sectionId: SECTION_ID } });
    await router.isReady();

    const wrapper = mount(LessonPage, { global: { plugins: [router] } });
    await flushPromises();

    wrapper.vm.currentAnswer = 1;
    wrapper.vm.onPrimaryAction();
    await flushPromises();
    wrapper.vm.onPrimaryAction();
    await flushPromises();
    wrapper.vm.currentAnswer = 1;
    wrapper.vm.onPrimaryAction();
    await flushPromises();
    wrapper.vm.onPrimaryAction();
    await flushPromises();

    const panel = wrapper.find(".next-steps-panel");
    expect(panel.exists()).toBe(true);
    expect(panel.text()).toContain("恢复学习");

    if (!process.env.SCREENSHOT) return;

    const styles = readFileSync(resolve(ROOT, "src/modules/path/LessonPage.vue"), "utf8")
      .match(/<style scoped>([\s\S]*?)<\/style>/)?.[1] ?? "";
    const outDir = resolve(ROOT, "screenshots");
    const htmlPath = resolve(outDir, "failed-lesson-recovery.html");
    const pngPath = resolve(outDir, "failed-lesson-recovery.png");
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
  });
});