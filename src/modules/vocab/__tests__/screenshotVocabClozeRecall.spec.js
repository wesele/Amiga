/**
 * Visual snapshot for issue #94 cloze recall in vocab review.
 * Run: SCREENSHOT=1 npm test -- --run src/modules/vocab/__tests__/screenshotVocabClozeRecall.spec.js
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
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
const VOCAB_PAGE_STYLES =
  readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), "../VocabReviewPage.vue"),
    "utf8",
  ).match(/<style scoped>([\s\S]*?)<\/style>/)?.[1] ?? "";

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
        id: 4,
        word: "frontera",
        mastery: 1,
        definition_zh: "边境",
        example: "Cruzaron la frontera al amanecer.",
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
  --blue:#1cb0f6;--blue-hover:#1899d6;--primary:#58cc02;--orange-bg:#fff4e5;
  --orange-hover:#c65d00;--radius-md:12px;--transition:0.2s ease;
}
body { margin:0; background:var(--bg); font-family:system-ui,sans-serif; }
#app { width:480px; height:800px; margin:0 auto; overflow:hidden; background:var(--bg); }
${VOCAB_PAGE_STYLES}
</style></head><body><div id="app">${wrapper.html()}</div></body></html>`;
  writeFileSync(outHtml, html);
  exec(
    `google-chrome --headless=new --disable-gpu --window-size=480,800 --screenshot=${outPng} file://${outHtml}`,
    { stdio: "pipe" },
  );
  return outPng;
}

describe.skipIf(!takeScreenshot)("screenshotVocabClozeRecall", () => {
  beforeEach(() => {
    sessionStorage.clear();
    setActivePinia(createPinia());
    setLocale("zh", { persist: false });
    api.__setInvoke(vi.fn().mockImplementation(defaultInvoke));
  });

  it("renders cloze and revealed states", async () => {
    const router = makeRouter();
    await router.push("/vocab/review");
    const wrapper = mount(VocabReviewPage, {
      global: { plugins: [router] },
    });
    await flushPromises();

    expect(wrapper.find(".flashcard-cloze-blank").exists()).toBe(true);
    expect(wrapper.find(".recall-reveal-btn").exists()).toBe(true);

    writeScreenshot(wrapper, "vocab-cloze-front");

    await wrapper.find(".recall-reveal-btn").trigger("click");
    await flushPromises();

    expect(wrapper.text()).toContain("frontera");
    expect(wrapper.text()).toContain("边境");
    writeScreenshot(wrapper, "vocab-cloze-revealed");
  });
});