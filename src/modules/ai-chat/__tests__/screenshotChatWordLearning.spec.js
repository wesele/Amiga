/**
 * Visual snapshot for issue #61 AI chat immersive word learning.
 * Run: SCREENSHOT=1 npm test -- --run src/modules/ai-chat/__tests__/screenshotChatWordLearning.spec.js
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
    return Promise.resolve({ status: "active", units: [] });
  }
  if (cmd === "get_chat_sessions_cmd") {
    return Promise.resolve([{ id: "amiga-sess", contact_type: "amiga", target_language: "es" }]);
  }
  if (cmd === "get_chat_messages_cmd") return Promise.resolve([]);
  if (cmd === "translate_word_cmd") {
    return Promise.resolve({ translation: "市场", phonetic: "", audio_url: "" });
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
  --bg:#f5f5f5;--white:#fff;--surface:#fff;--text:#1a1a1a;--text-secondary:#666;
  --border:#e5e5e5;--green:#58cc02;--green-bg:#e8f8ef;--purple:#7c3aed;
  --primary:#58cc02;--radius-sm:8px;--radius-md:12px;--radius-lg:16px;--shadow-lg:0 8px 24px rgba(0,0,0,.12);
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

describe("screenshotChatWordLearning", () => {
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

  it("shows the tap-to-learn hint on an empty Amiga session", async () => {
    const router = makeRouter();
    await router.push({ path: "/chat/amiga-sess" });

    const wrapper = mount(ChatPage, { global: { plugins: [router] } });
    await flushPromises();
    await flushPromises();

    expect(wrapper.find(".tap-to-learn-hint").text()).toContain("划选");
    if (takeScreenshot) writeScreenshot(wrapper, "issue61-chat-word-learning");
  });

  it("marks AI reply bubbles as learnable when messages exist", async () => {
    api.__setInvoke(
      vi.fn().mockImplementation((cmd) => {
        if (cmd === "get_chat_messages_cmd") {
          return Promise.resolve([
            { id: 1, role: "assistant", content: "Ayer fui al mercado y compré frutas." },
          ]);
        }
        return defaultInvoke(cmd);
      }),
    );

    const router = makeRouter();
    await router.push({ path: "/chat/amiga-sess" });

    const wrapper = mount(ChatPage, { global: { plugins: [router] } });
    await flushPromises();
    await flushPromises();

    expect(wrapper.find(".chat-learnable").exists()).toBe(true);
  });

  it("does not enable word learning UI for translator sessions", async () => {
    api.__setInvoke(
      vi.fn().mockImplementation((cmd) => {
        if (cmd === "get_chat_sessions_cmd") {
          return Promise.resolve([
            { id: "translator-sess", contact_type: "translator", target_language: "es" },
          ]);
        }
        return defaultInvoke(cmd);
      }),
    );

    const router = makeRouter();
    await router.push({ path: "/chat/translator-sess" });

    const wrapper = mount(ChatPage, { global: { plugins: [router] } });
    await flushPromises();
    await flushPromises();

    expect(wrapper.find(".chat-learnable").exists()).toBe(false);
    expect(wrapper.find(".tap-to-learn-hint").exists()).toBe(false);
  });
});