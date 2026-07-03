/**
 * Visual snapshot for issue #57 vocab review mastery SRS feedback.
 * Run: SCREENSHOT=1 npm test -- --run src/modules/vocab/__tests__/screenshotVocabMastery.spec.js
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
import * as vocabRatingFeedback from "../vocabRatingFeedback.js";

const takeScreenshot = process.env.SCREENSHOT === "1";

vi.mock("@tauri-apps/plugin-shell", () => ({}));

vi.mock("../vocabRatingFeedback.js", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    waitVocabRatingAck: vi.fn(() => Promise.resolve()),
    playVocabRatingFeedback: vi.fn(),
  };
});

const VocabReviewPage = (await import("@/modules/vocab/VocabReviewPage.vue")).default;

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
        word: "hospital",
        mastery: 1,
        definition_zh: "医院",
        example: "Voy al hospital.",
        source: "news_reading",
      },
      {
        id: 2,
        word: "mercado",
        mastery: null,
        definition_zh: "市场",
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
.srs-progress{display:flex;align-items:center;justify-content:center;gap:6px;margin:0 0 12px}
.srs-dot{width:8px;height:8px;border-radius:50%;background:var(--gray-light);border:1px solid var(--border)}
.srs-dot.is-filled{background:var(--green);border-color:var(--green)}
.srs-label{margin-left:4px;font-size:12px;font-weight:600;color:var(--text-light)}
.srs-schedule{margin:0 0 10px;padding:8px 12px;background:rgba(76,175,80,.1);border-radius:var(--radius-sm);
  color:var(--green-hover);font-size:13px;font-weight:600;text-align:center;line-height:1.4}
</style></head><body><div id="app">${wrapper.html()}</div></body></html>`;

  writeFileSync(outHtml, html);
  exec(
    `google-chrome --headless=new --disable-gpu --window-size=480,800 --screenshot=${outPng} file://${outHtml}`,
    { stdio: "inherit" },
  );
  return outPng;
}

describe.skipIf(!takeScreenshot)("screenshotVocabMastery", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    setLocale("zh", { persist: false });
    api.__setInvoke(vi.fn().mockImplementation(defaultInvoke));
  });

  it("writes reinforcement card with mastery stage dots", async () => {
    const router = makeRouter();
    await router.push("/vocab/review");
    const wrapper = mount(VocabReviewPage, {
      global: { plugins: [router] },
    });
    await flushPromises();

    expect(wrapper.text()).toContain("记忆 2/3");
    writeScreenshot(wrapper, "issue57-vocab-mastery-reinforce");
  });

  it("writes schedule feedback after got it rating", async () => {
    let releaseAck;
    vi.mocked(vocabRatingFeedback.waitVocabRatingAck).mockImplementation(
      () =>
        new Promise((resolve) => {
          releaseAck = resolve;
        }),
    );

    const router = makeRouter();
    await router.push("/vocab/review");
    const wrapper = mount(VocabReviewPage, {
      global: { plugins: [router] },
    });
    await flushPromises();

    await wrapper.find(".flashcard").trigger("click");
    await wrapper.find(".review-footer .action-btn.primary").trigger("click");
    await flushPromises();

    expect(wrapper.text()).toContain("已掌握");
    writeScreenshot(wrapper, "issue57-vocab-mastery-rated");
    releaseAck();
    await flushPromises();
  });
});