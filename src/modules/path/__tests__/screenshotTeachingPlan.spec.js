/**
 * Visual snapshot for issue #60 teaching next-steps panel.
 * Run: SCREENSHOT=1 npm test -- --run src/modules/path/__tests__/screenshotTeachingPlan.spec.js
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

const TeachingPage = (await import("@/modules/path/TeachingPage.vue")).default;

const GRAMMAR_NODE_ID = "zh-es/U01-GRAMMAR";
const VOCAB_NODE_ID = "zh-es/U01-VOCAB";

function makeRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: "/", name: "path", component: { template: "<div/>" } },
      {
        path: "/learn/path/teach/:nodeId",
        name: "path-teaching",
        component: TeachingPage,
      },
      {
        path: "/learn/path/lesson/:sectionId",
        name: "path-lesson",
        component: { template: "<div/>" },
      },
    ],
  });
}

function teachingContent(kind = "grammar") {
  return {
    node_id: kind === "grammar" ? GRAMMAR_NODE_ID : VOCAB_NODE_ID,
    kind,
    unit_id: "U01",
    unit_title_native: "基础问候与自我介绍",
    unit_title_target: "Saludos y presentación personal",
    goal_native: "掌握基础问候用语",
    grammar_points: kind === "grammar" ? ["ser 和 estar 的基本区别"] : [],
    words:
      kind === "vocab"
        ? [
            { word: "hola", definition_zh: "你好" },
            { word: "adiós", definition_zh: "再见" },
            { word: "gracias", definition_zh: "谢谢" },
          ]
        : [],
    scenarios: kind === "grammar" ? ["初次见面打招呼"] : [],
  };
}

function completeResult(nextSectionId) {
  return {
    passed: true,
    stars: 1,
    best_score: 100,
    next_section_id: nextSectionId,
    level_upgraded: false,
    streak_extended: false,
    streak_current: 3,
    daily_goal_just_met: false,
    daily_goal_lessons_today: 1,
    daily_goal_target: 3,
    weekly_goal_active_days: 2,
    weekly_goal_target_days: 5,
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
  if (cmd === "get_teaching_content_cmd") {
    return Promise.resolve(teachingContent(args?.nodeId?.includes("VOCAB") ? "vocab" : "grammar"));
  }
  if (cmd === "get_user_vocab_by_level_cmd") {
    return Promise.resolve([
      { id: 1, word: "hola", mastery: null },
      { id: 2, word: "adiós", mastery: 1 },
      { id: 3, word: "gracias", mastery: 2 },
    ]);
  }
  if (cmd === "complete_teaching_node_cmd") {
    const nodeId = args?.nodeId ?? GRAMMAR_NODE_ID;
    return Promise.resolve(
      completeResult(
        nodeId.includes("VOCAB") ? "zh-es/U01-PRACTICE" : "zh-es/U01-VOCAB",
      ),
    );
  }
  if (cmd === "get_unknown_words_cmd") {
    return Promise.resolve([
      { id: 10, word: "algoritmo" },
      { id: 11, word: "desplegar" },
    ]);
  }
  if (cmd === "get_articles_cmd") return Promise.resolve([]);
  if (cmd === "get_articles_reading_status_cmd") return Promise.resolve([]);
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

describe.skipIf(!takeScreenshot)("screenshotTeachingPlan", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    setLocale("zh", { persist: false });
    api.__setInvoke(vi.fn().mockImplementation(defaultInvoke));
  });

  it("writes grammar completion with next-node panel", async () => {
    const router = makeRouter();
    await router.push({ name: "path-teaching", params: { nodeId: GRAMMAR_NODE_ID } });
    const wrapper = mount(TeachingPage, { global: { plugins: [router] } });
    await flushPromises();
    await wrapper.find(".action-btn.primary").trigger("click");
    await flushPromises();

    expect(wrapper.find(".next-steps-panel").exists()).toBe(true);
    expect(wrapper.text()).toContain("继续学词汇");
    writeScreenshot(wrapper, "issue60-teaching-grammar-next-node");
  });

  it("writes vocab completion with practice next step", async () => {
    const router = makeRouter();
    await router.push({ name: "path-teaching", params: { nodeId: VOCAB_NODE_ID } });
    const wrapper = mount(TeachingPage, { global: { plugins: [router] } });
    await flushPromises();
    await wrapper.find(".action-btn.primary").trigger("click");
    await flushPromises();

    expect(wrapper.find(".next-steps-panel").exists()).toBe(true);
    expect(wrapper.text()).toContain("开始练习");
    writeScreenshot(wrapper, "issue60-teaching-vocab-next-node");
  });
});