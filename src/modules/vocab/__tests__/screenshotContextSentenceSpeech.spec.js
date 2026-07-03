/**
 * Visual snapshot for issue #86 context sentence listen on flashcard back.
 * Run: SCREENSHOT=1 npm test -- --run src/modules/vocab/__tests__/screenshotContextSentenceSpeech.spec.js
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

const VocabReviewPage = (await import("@/modules/vocab/VocabReviewPage.vue")).default;
const MicroReviewSheet = (await import("@/modules/vocab/MicroReviewSheet.vue")).default;

function makeRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: "/learn", name: "learn", component: { template: "<div />" } },
      { path: "/vocab/review", name: "vocab-review", component: VocabReviewPage },
    ],
  });
}

function defaultInvoke(cmd) {
  if (cmd === "get_target_language_cmd") return Promise.resolve("es");
  if (cmd === "get_current_user") {
    return Promise.resolve({ id: "u1", native_language: "zh" });
  }
  if (cmd === "get_learning_goals_cmd") {
    return Promise.resolve([{ target_language: "es", cefr_level: "A1" }]);
  }
  if (cmd === "get_unknown_words_cmd") {
    return Promise.resolve([
      {
        id: 1,
        word: "por lo tanto",
        mastery: 1,
        definition_zh: "因此",
        example: "El mercado subió; por lo tanto, invirtió más.",
        source: "news_reading",
        has_user_context: true,
      },
    ]);
  }
  if (cmd === "update_word_mastery_cmd") return Promise.resolve();
  if (cmd === "get_user_vocab_stats_cmd") {
    return Promise.resolve({ total_known: 12, total_learning: 4, total: 1000 });
  }
  return Promise.resolve(null);
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
  --bg:#f5f5f5;--white:#fff;--surface:#fff;--surface-variant:#f5f5f5;--text:#1a1a1a;
  --text-secondary:#666;--text-light:#666;--text-lighter:#999;--border:#e5e5e5;
  --gray-light:#f0f0f0;--green:#58cc02;--green-hover:#46a302;--green-bg:#e8f8ef;
  --orange:#ff9600;--orange-bg:#fff4e5;--orange-hover:#c45c00;--blue:#1cb0f6;
  --primary:#58cc02;--radius-sm:8px;--radius-md:12px;--radius-lg:16px;
}
*{box-sizing:border-box}html,body{margin:0;height:100%;font-family:system-ui,sans-serif;background:#f0f0f0}
#app{width:480px;height:800px;margin:0 auto;overflow:hidden;background:var(--bg)}
mark{background:rgba(88,204,2,.25);color:inherit;border-radius:2px;padding:0 1px}
</style></head><body><div id="app">${wrapper.html()}</div></body></html>`;

  writeFileSync(outHtml, html);
  exec(
    `google-chrome --headless=new --disable-gpu --window-size=480,800 --screenshot=${outPng} file://${outHtml}`,
    { stdio: "inherit" },
  );
  return outPng;
}

describe.skipIf(!takeScreenshot)("screenshotContextSentenceSpeech", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    setLocale("zh", { persist: false });
    api.__setInvoke(vi.fn().mockImplementation(defaultInvoke));
    class MockUtterance {
      constructor(text) {
        this.text = text;
        this.lang = "";
        this.rate = 1;
        this.onend = null;
        this.onerror = null;
      }
    }
    Object.defineProperty(globalThis, "SpeechSynthesisUtterance", {
      configurable: true,
      value: MockUtterance,
    });
    Object.defineProperty(globalThis, "speechSynthesis", {
      configurable: true,
      value: {
        speak(utter) {
          utter.onend?.();
        },
        cancel: vi.fn(),
      },
    });
  });

  it("writes vocab review back with context sentence listen controls", async () => {
    const router = makeRouter();
    await router.push("/vocab/review");
    const wrapper = mount(VocabReviewPage, {
      global: { plugins: [router] },
    });
    await flushPromises();

    await wrapper.find(".flashcard").trigger("click");
    await flushPromises();

    expect(wrapper.find(".context-speech-controls").exists()).toBe(true);
    expect(wrapper.text()).toContain("por lo tanto");
    writeScreenshot(wrapper, "issue86-vocab-context-sentence-listen");
  });

  it("writes micro review back with context sentence listen controls", async () => {
    const wrapper = mount(MicroReviewSheet, {
      props: {
        open: true,
        card: { word: "por lo tanto", example: "El mercado subió; por lo tanto, invirtió más." },
        sessionCount: 1,
        index: 0,
        queueLength: 1,
        definition: "因此",
        contextLabel: "来自你读过的文章",
        contextParts: [
          { text: "El mercado subió; ", highlight: false },
          { text: "por lo tanto", highlight: true },
          { text: ", invirtió más.", highlight: false },
        ],
        flipped: true,
        speechLanguage: "es",
        titleKey: "news.microReviewTitle",
        hintKey: "news.microReviewHint",
        continueKey: "news.microReviewContinue",
        laterKey: "news.microReviewLater",
      },
    });
    await flushPromises();

    expect(wrapper.find(".context-speech-controls").exists()).toBe(true);
    writeScreenshot(wrapper, "issue86-micro-review-context-sentence-listen");
  });
});