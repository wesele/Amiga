/**
 * Visual snapshot for issue #70 failed-lesson recovery panel.
 * Run: SCREENSHOT=1 npm test -- --run src/modules/path/__tests__/screenshotFailedRecovery.spec.js
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

const LessonPage = (await import("@/modules/path/LessonPage.vue")).default;
const SECTION_ID = "zh-es/U01-PR01";

function makeRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: "/learn/path", name: "path", component: { template: "<div/>" } },
      {
        path: "/learn/path/teach/:nodeId",
        name: "path-teaching",
        component: { template: "<div/>" },
      },
      {
        path: "/learn/path/lesson/:sectionId",
        name: "path-lesson",
        component: LessonPage,
      },
      {
        path: "/learn/path/practice/:typeId",
        name: "path-focus-practice",
        component: { template: "<div/>" },
      },
    ],
  });
}

function lessonQuestions() {
  return [
    {
      id: "q1",
      type: "T05",
      sentence: "Hola, me llamo ____.",
      options: ["Ana", "casa", "perro", "libro"],
      answerIdx: 0,
    },
    {
      id: "q2",
      type: "T05",
      sentence: "Buenos ____.",
      options: ["días", "noches", "tardes", "años"],
      answerIdx: 0,
    },
    {
      id: "q3",
      type: "T01",
      sentence: "Pick hola",
      options: ["hola", "casa", "perro", "libro"],
      answerIdx: 0,
    },
  ];
}

function curriculumWithUnfinishedGrammar() {
  return {
    status: "active",
    units: [
      {
        id: "U01",
        sections: [
          {
            id: "zh-es/U01-GRAMMAR",
            kind: "grammar",
            stars: 0,
            locked: false,
          },
          {
            id: "zh-es/U01-VOCAB",
            kind: "vocab",
            stars: 3,
            locked: false,
          },
          {
            id: SECTION_ID,
            kind: "practice",
            stars: 0,
            locked: false,
            question_count: 3,
          },
        ],
      },
    ],
  };
}

function defaultInvoke(cmd, args) {
  if (cmd === "get_current_user") {
    return Promise.resolve({ id: "u1", native_language: "zh" });
  }
  if (cmd === "get_target_language_cmd") return Promise.resolve("es");
  if (cmd === "get_learning_goals_cmd") {
    return Promise.resolve([{ target_language: "es", cefr_level: "A1" }]);
  }
  if (cmd === "get_path_curriculum_cmd") {
    return Promise.resolve(curriculumWithUnfinishedGrammar());
  }
  if (cmd === "get_section_lesson_cmd") {
    return Promise.resolve({
      section_title_native: "闯关练习",
      questions: lessonQuestions(),
    });
  }
  if (cmd === "get_unknown_words_cmd") return Promise.resolve([]);
  if (cmd === "complete_section_cmd") {
    return Promise.resolve({ passed: false, stars: 0 });
  }
  return Promise.reject(new Error(`unexpected invoke: ${cmd}`));
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const screenshotsDir = join(__dirname, "../../../../screenshots");

function writeScreenshot(wrapper, name) {
  mkdirSync(screenshotsDir, { recursive: true });
  const outHtml = join(screenshotsDir, `${name}.html`);
  const outPng = join(screenshotsDir, `${name}.png`);
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
:root {
  --bg:#f5f5f5;--white:#fff;--surface:#fff;--surface-variant:#f5f5f5;--text:#1a1a1a;
  --text-secondary:#666;--text-light:#666;--text-lighter:#999;--border:#e5e5e5;
  --green:#58cc02;--green-hover:#4cb302;--green-bg:#e8f8ef;--orange:#ff9600;--orange-bg:#fff4e5;
  --orange-hover:#c45c00;--blue:#1cb0f6;--blue-hover:#0d8ecf;--primary:#58cc02;--red:#ff4b4b;
  --radius-sm:8px;--radius-md:12px;--radius-lg:16px;--transition:0.15s ease;--safe-bottom:0px;
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

async function answerQuestion(wrapper, answer) {
  wrapper.vm.currentAnswer = answer;
  wrapper.vm.onPrimaryAction();
  await flushPromises();
  wrapper.vm.onPrimaryAction();
  await flushPromises();
}

async function failLesson(wrapper, questionCount = 3) {
  for (let i = 0; i < questionCount; i += 1) {
    await answerQuestion(wrapper, 1);
  }
  for (let i = 0; i < questionCount; i += 1) {
    await answerQuestion(wrapper, 0);
  }
}

describe.skipIf(!takeScreenshot)("screenshotFailedRecovery", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    setLocale("zh", { persist: false });
    api.__setInvoke(vi.fn().mockImplementation(defaultInvoke));
  });

  it("writes grammar-prep recovery panel after skipping prep and failing", async () => {
    const router = makeRouter();
    await router.push({ name: "path-lesson", params: { sectionId: SECTION_ID } });
    const wrapper = mount(LessonPage, { global: { plugins: [router] } });
    await flushPromises();
    await failLesson(wrapper);

    const panel = wrapper.find(".next-steps-panel");
    expect(panel.exists()).toBe(true);
    expect(wrapper.text()).toContain("恢复学习");
    expect(wrapper.text()).toContain("先复习本单元语法预习");
    expect(wrapper.find(".summary-actions .action-btn.primary").text()).toContain("去复习语法预习");

    writeScreenshot(wrapper, "issue70-failed-lesson-grammar-recovery");
  });
});