/**
 * Visual snapshot for issue #66 teaching vocab micro-review bottom sheet.
 * Run: SCREENSHOT=1 npm test -- --run src/modules/path/__tests__/screenshotTeachingMicroReview.spec.js
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { createRouter, createMemoryHistory } from "vue-router";
import { writeFileSync, mkdirSync, readFileSync } from "node:fs";
import { execSync as exec } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { setLocale } from "@/shared/i18n";
import * as api from "@/shared/api.js";

const takeScreenshot = process.env.SCREENSHOT === "1";

vi.mock("@tauri-apps/plugin-shell", () => ({}));

const TeachingPage = (await import("@/modules/path/TeachingPage.vue")).default;
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
    ],
  });
}

function writeScreenshot(wrapper, filename) {
  const root = join(dirname(fileURLToPath(import.meta.url)), "../../../..");
  const outDir = join(root, "screenshots");
  mkdirSync(outDir, { recursive: true });
  const outHtml = join(outDir, `${filename}.html`);
  const outPng = join(outDir, `${filename}.png`);
  const teachingStyles =
    readFileSync(join(root, "src/modules/path/TeachingPage.vue"), "utf8").match(
      /<style scoped>([\s\S]*?)<\/style>/,
    )?.[1] ?? "";
  const sheetStyles =
    readFileSync(join(root, "src/modules/vocab/MicroReviewSheet.vue"), "utf8").match(
      /<style scoped>([\s\S]*?)<\/style>/,
    )?.[1] ?? "";

  const html = `<!DOCTYPE html>
<html lang="zh"><head><meta charset="utf-8" />
<style>
:root {
  --bg:#f5f5f5;--white:#fff;--surface:#fff;--surface-variant:#f0f0f0;
  --text:#1a1a1a;--text-light:#666;--text-lighter:#999;--border:#e5e5e5;
  --primary:#1cb0f6;--green:#58cc02;--blue:#1cb0f6;--purple:#7c3aed;
  --radius-md:12px;--transition:0.2s ease;--safe-bottom:0px;
}
*{box-sizing:border-box}body{margin:0;font-family:system-ui,sans-serif;background:var(--bg)}
.teaching-page{width:480px;height:800px;margin:0 auto;position:relative;overflow:hidden}
${teachingStyles}
${sheetStyles}
</style></head><body>${wrapper.find(".teaching-page").html()}</body></html>`;

  writeFileSync(outHtml, html);
  exec(
    `google-chrome --headless=new --disable-gpu --window-size=480,900 --screenshot=${outPng} file://${outHtml}`,
    { stdio: "inherit" },
  );
  return outPng;
}

describe.skipIf(!takeScreenshot)("screenshotTeachingMicroReview", () => {
  let mockInvoke;

  beforeEach(() => {
    setActivePinia(createPinia());
    mockInvoke = vi.fn();
    api.__setInvoke(mockInvoke);
    setLocale("zh", { persist: false });

    mockInvoke.mockImplementation((cmd) => {
      if (cmd === "get_current_user") {
        return Promise.resolve({ id: "u1", native_language: "zh" });
      }
      if (cmd === "get_target_language_cmd") return Promise.resolve("es");
      if (cmd === "get_learning_goals_cmd") {
        return Promise.resolve([{ target_language: "es", cefr_level: "A1" }]);
      }
      if (cmd === "get_teaching_content_cmd") {
        return Promise.resolve({
          node_id: VOCAB_NODE_ID,
          kind: "vocab",
          unit_id: "U01",
          unit_title_native: "基础问候与自我介绍",
          goal_native: "掌握基础问候用语",
          grammar_points: [],
          words: [
            { word: "hola", definition_zh: "你好" },
            { word: "adiós", definition_zh: "再见" },
            { word: "gracias", definition_zh: "谢谢" },
          ],
          scenarios: [],
        });
      }
      if (cmd === "get_user_vocab_by_level_cmd") {
        return Promise.resolve([
          { id: 1, word: "hola", mastery: null },
          { id: 2, word: "adiós", mastery: 1 },
          { id: 3, word: "gracias", mastery: 2 },
        ]);
      }
      if (cmd === "update_word_mastery_cmd") return Promise.resolve(undefined);
      if (cmd === "translate_word_cmd") {
        return Promise.resolve({ translation: "你好", pos: "interj" });
      }
      return Promise.reject(new Error(`unexpected invoke: ${cmd}`));
    });
  });

  it("captures micro-review sheet after marking three unknown words in vocab preview", async () => {
    const router = makeRouter();
    await router.push({ name: "path-teaching", params: { nodeId: VOCAB_NODE_ID } });
    await router.isReady();

    const wrapper = mount(TeachingPage, { global: { plugins: [router] } });
    await flushPromises();

    for (let i = 0; i < 3; i += 1) {
      await wrapper.findAll(".word-chip")[i].trigger("click");
      await flushPromises();
      await wrapper.find(".act-unknown").trigger("click");
      await flushPromises();
    }

    expect(wrapper.find(".micro-review-sheet").exists()).toBe(true);
    expect(wrapper.text()).toContain("趁热巩固 3 个生词");
    const pngPath = writeScreenshot(wrapper, "teaching-micro-review");
    expect(pngPath).toContain("teaching-micro-review.png");
  }, 30_000);
});