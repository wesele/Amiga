/**
 * Visual snapshot for issue #55 AI practice wrap-up overlay.
 * Run: SCREENSHOT=1 npm test -- --run src/modules/ai-chat/__tests__/screenshotPracticeWrapUp.spec.js
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

const ChatPage = (await import("@/modules/ai-chat/ChatPage.vue")).default;

function makeRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: "/learn", name: "learn", component: { template: "<div />" } },
      { path: "/path", name: "path", component: { template: "<div />" } },
      {
        path: "/chat/:sessionId",
        name: "chat-session",
        component: ChatPage,
        meta: { parent: "chat" },
      },
    ],
  });
}

function defaultInvoke(cmd) {
  if (cmd === "get_current_user") {
    return Promise.resolve({ id: "u1", native_language: "zh" });
  }
  if (cmd === "get_learning_goals_cmd") {
    return Promise.resolve([{ id: 1, target_language: "es", cefr_level: "A1" }]);
  }
  if (cmd === "get_path_curriculum_cmd") {
    return Promise.resolve({
      status: "active",
      units: [
        {
          title_native: "日常活动",
          sections: [
            {
              id: "zh-es/U01-GRAMMAR",
              kind: "grammar",
              title_native: "语法",
              current: true,
            },
          ],
        },
      ],
    });
  }
  if (cmd === "get_daily_goal_progress_cmd") {
    return Promise.resolve({
      lessons_today: 1,
      effective_lessons_today: 1,
      target_lessons: 2,
      goal_met: false,
    });
  }
  if (cmd === "get_unknown_words_cmd") return Promise.resolve([]);
  if (cmd === "get_articles_cmd") return Promise.resolve([]);
  if (cmd === "get_chat_sessions_cmd") {
    return Promise.resolve([{ id: "amiga-sess", contact_type: "amiga", target_language: "es" }]);
  }
  if (cmd === "get_chat_messages_cmd") return Promise.resolve([]);
  if (cmd === "chat_completion_with_session_cmd") return Promise.resolve("¡Muy bien!");
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
  --green:#58cc02;--green-hover:#4cb302;--green-bg:#e8f8ef;--orange-bg:#fff4e5;
  --primary:#58cc02;--radius-sm:8px;--radius-md:12px;--radius-lg:16px;
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

describe.skipIf(!takeScreenshot)("screenshotPracticeWrapUp", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    setLocale("zh", { persist: false });
    api.__setInvoke(vi.fn().mockImplementation(defaultInvoke));
    Object.defineProperty(window, "visualViewport", {
      configurable: true,
      value: {
        height: 700,
        offsetTop: 0,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      },
    });
    vi.stubGlobal("requestAnimationFrame", vi.fn(() => 1));
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
  });

  it("writes guided practice wrap-up with daily goal primary CTA", async () => {
    const { useTargetLangStore } = await import("@/stores/targetLang.js");
    const store = useTargetLangStore();
    vi.spyOn(store, "load").mockResolvedValue("es");

    const router = makeRouter();
    await router.push({
      path: "/chat/amiga-sess",
      query: {
        starterId: "reviewed-words",
        words: "inflación, mercado, precio",
        from: "vocab",
      },
    });

    const wrapper = mount(ChatPage, { global: { plugins: [router] } });
    await flushPromises();
    await flushPromises();

    await wrapper.find(".chat-input").setValue("inflación");
    await wrapper.find(".send-btn").trigger("click");
    await flushPromises();
    await flushPromises();

    await wrapper.find(".back-btn").trigger("click");
    await flushPromises();
    await flushPromises();

    expect(wrapper.find(".practice-wrap-overlay").exists()).toBe(true);
    expect(wrapper.find(".next-steps-panel").exists()).toBe(true);
    writeScreenshot(wrapper, "issue55-ai-practice-wrapup");
  });
});