/**
 * Visual snapshot for issue #63 pending AI practice hero on chat tab.
 * Run: SCREENSHOT=1 npm test -- --run src/modules/chat/__tests__/screenshotPendingPractice.spec.js
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { createMemoryHistory, createRouter } from "vue-router";
import { execSync as exec } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { setLocale } from "@/shared/i18n";
import * as api from "@/shared/api.js";
import {
  PENDING_SOURCES,
  savePendingAiPractice,
} from "@/modules/ai-chat/pendingAiPractice.js";

const takeScreenshot = process.env.SCREENSHOT === "1";

vi.mock("@tauri-apps/plugin-shell", () => ({}));

const ContactList = (await import("@/modules/chat/ContactList.vue")).default;

function makeRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: "/chat", name: "chat", component: { template: "<div/>" } },
      { path: "/chat/:sessionId", name: "chat-session", component: { template: "<div/>" } },
      { path: "/chat/social/:mode/:peerId?", name: "social-chat", component: { template: "<div/>" } },
      { path: "/chat/social", name: "social-hub", component: { template: "<div/>" } },
    ],
  });
}

function setupMocks() {
  const mockInvoke = vi.fn().mockImplementation((cmd) => {
    if (cmd === "get_chat_sessions_cmd") return Promise.resolve([]);
    if (cmd === "get_current_user") return Promise.resolve({ id: "u1", nickname: "Alice" });
    return Promise.resolve(null);
  });

  class FakeWebSocket {
    static OPEN = 1;
    constructor() {
      this.readyState = 1;
      this.send = vi.fn();
      this.close = vi.fn();
      this._listeners = {};
    }
    addEventListener(event, cb) {
      if (!this._listeners[event]) this._listeners[event] = [];
      this._listeners[event].push(cb);
    }
    removeEventListener() {}
  }

  api.__setInvoke(mockInvoke);
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network error")));
  vi.stubGlobal("WebSocket", FakeWebSocket);
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
  --bg:#f5f5f5;--white:#fff;--surface:#fff;--text:#1a1a1a;--text-lighter:#999;
  --green:#58cc02;--green-hover:#4cb302;--green-bg:#e8f8ef;
  --purple:#7c3aed;--purple-bg:#ede9fe;
  --radius-sm:8px;--radius-md:12px;--transition:0.15s ease;
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

describe.skipIf(!takeScreenshot)("screenshotPendingPractice", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    setLocale("zh", { persist: false });
    localStorage.clear();
    setupMocks();
  });

  it("writes chat tab with pending practice hero", async () => {
    savePendingAiPractice({
      source: PENDING_SOURCES.READING,
      words: ["viaje", "hotel", "playa", "restaurante"],
    });

    const router = makeRouter();
    const wrapper = mount(ContactList, {
      global: { plugins: [router] },
    });
    await flushPromises();

    expect(wrapper.find(".pending-practice-hero").exists()).toBe(true);
    writeScreenshot(wrapper, "issue63-pending-practice-hero");
  });
});