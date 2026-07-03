import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { mount, flushPromises } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { createRouter, createMemoryHistory } from "vue-router";
import * as api from "@/shared/api.js";
import { setLocale } from "@/shared/i18n";

vi.mock("@tauri-apps/plugin-shell", () => ({}));

const ROOT = resolve(__dirname, "../../../..");
const ChatPage = (await import("@/modules/ai-chat/ChatPage.vue")).default;

function makeRouter(sessionId, { query = {} } = {}) {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: "/", name: "learn", component: { template: "<div/>" } },
      { path: "/news", name: "news", component: { template: "<div/>" } },
      { path: "/path", name: "path", component: { template: "<div/>" } },
      {
        path: "/chat/:sessionId",
        name: "chat-session",
        component: ChatPage,
        props: true,
        meta: { parent: "chat" },
      },
      { path: "/chat", name: "chat", component: { template: "<div/>" } },
    ],
  });
}

async function mountPage(sessionId, mockInvoke, { query = {} } = {}) {
  const router = makeRouter(sessionId, { query });
  await router.push({ path: `/chat/${sessionId}`, query });
  await router.isReady();
  return mount(ChatPage, {
    global: { plugins: [router] },
  });
}

describe("ChatPage", () => {
  let mockInvoke;
  let viewport;
  let resizeHandler;

  beforeEach(() => {
    setActivePinia(createPinia());
    mockInvoke = vi.fn();
    api.__setInvoke(mockInvoke);
    setLocale("zh", { persist: false });
    resizeHandler = null;
    viewport = {
      height: 700,
      offsetTop: 0,
      addEventListener: vi.fn((event, handler) => {
        if (event === "resize") resizeHandler = handler;
      }),
      removeEventListener: vi.fn(),
    };
    Object.defineProperty(window, "visualViewport", {
      configurable: true,
      value: viewport,
    });
    vi.stubGlobal("requestAnimationFrame", vi.fn(() => 1));
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
  });

  it("shows the translator name and 🌐 avatar when the session is a translator one", async () => {
    let sessionsArgs = null;
    mockInvoke.mockImplementation((cmd, args) => {
      if (cmd === "get_current_user") {
        return Promise.resolve({ id: "u1", native_language: "zh" });
      }
      if (cmd === "get_chat_sessions_cmd") {
        sessionsArgs = args;
        return Promise.resolve([
          {
            id: "translator-sess",
            user_id: "u1",
            title: "AI 翻译",
            contact_type: "translator",
            target_language: "en",
            last_message: "",
            created_at: "",
            updated_at: "",
            message_count: 0,
            user_profile_json: "{}",
            conversation_summary: "",
          },
        ]);
      }
      if (cmd === "get_chat_messages_cmd") return Promise.resolve([]);
      return Promise.resolve(null);
    });

    const { useTargetLangStore } = await import("@/stores/targetLang.js");
    const store = useTargetLangStore();
    vi.spyOn(store, "load").mockResolvedValue("en");

    const wrapper = await mountPage("translator-sess", mockInvoke);
    await flushPromises();
    await flushPromises();

    // The page must query with the active targetLang; assert that here
    // so this test doubles as the regression guard for the
    // "进去后是Amiga" bug.
    expect(sessionsArgs).toMatchObject({ targetLang: "en" });
    expect(wrapper.find(".header-name").text()).toBe("AI 翻译");
    expect(wrapper.find(".contact-avatar").text()).toBe("🌐");
    expect(wrapper.text()).toContain("你好！我是 AI 翻译");
  });

  it("falls back to Amiga defaults when the session lookup returns nothing", async () => {
    let sessionsArgs = null;
    mockInvoke.mockImplementation((cmd, args) => {
      if (cmd === "get_current_user") {
        return Promise.resolve({ id: "u1", native_language: "zh" });
      }
      if (cmd === "get_chat_sessions_cmd") {
        // The page must still pass the targetLang, even when no rows
        // match — the bug was that the page would silently miss the
        // session because the call ran with target_language = ''.
        sessionsArgs = args;
        return Promise.resolve([]);
      }
      if (cmd === "get_chat_messages_cmd") return Promise.resolve([]);
      return Promise.resolve(null);
    });

    const { useTargetLangStore } = await import("@/stores/targetLang.js");
    const store = useTargetLangStore();
    vi.spyOn(store, "load").mockResolvedValue("en");

    const wrapper = await mountPage("nonexistent", mockInvoke);
    await flushPromises();
    await flushPromises();

    expect(sessionsArgs).toMatchObject({ targetLang: "en" });
    expect(wrapper.find(".header-name").text()).toBe("Amiga");
    // The amiga avatar is the brand icon served from public/amiga-icon.png.
    // Keep this exact URL pinned so Chat cannot drift back to a stale
    // src/assets copy.
    const avatar = wrapper.find(".contact-avatar");
    const img = avatar.find("img");
    expect(img.exists()).toBe(true);
    expect(img.attributes("src")).toBe("/amiga-icon.png");
  });

  it("getChatSessions is invoked with the active targetLang (regression: was called with no arg)", async () => {
    const calls = [];
    mockInvoke.mockImplementation((cmd, args) => {
      if (cmd === "get_chat_sessions_cmd") {
        calls.push(args);
        return Promise.resolve([]);
      }
      if (cmd === "get_current_user") {
        return Promise.resolve({ id: "u1", native_language: "zh" });
      }
      if (cmd === "get_chat_messages_cmd") return Promise.resolve([]);
      return Promise.resolve(null);
    });

    const { useTargetLangStore } = await import("@/stores/targetLang.js");
    const store = useTargetLangStore();
    vi.spyOn(store, "load").mockResolvedValue("es");

    await mountPage("any-sess", mockInvoke);
    await flushPromises();
    await flushPromises();

    expect(calls.length).toBeGreaterThan(0);
    for (const c of calls) {
      // The previous bug left targetLang undefined; the backend would
      // then run `WHERE target_language = ''` and return zero rows,
      // causing the header to silently fall back to amiga.
      expect(c).toBeDefined();
      expect(c.targetLang).toBe("es");
    }
  });

  it("reserves bottom safe-area for the input bar when the shell nav is hidden", async () => {
    mockInvoke.mockImplementation((cmd) => {
      if (cmd === "get_current_user") {
        return Promise.resolve({ id: "u1", native_language: "zh" });
      }
      if (cmd === "get_chat_sessions_cmd") return Promise.resolve([]);
      if (cmd === "get_chat_messages_cmd") return Promise.resolve([]);
      return Promise.resolve(null);
    });

    const wrapper = await mountPage("sess-1", mockInvoke);
    await flushPromises();

    const safeStrip = wrapper.find(".chat-safe-bottom");
    expect(safeStrip.exists()).toBe(true);
    expect(safeStrip.attributes("aria-hidden")).toBe("true");

    const source = readFileSync(resolve(ROOT, "src/modules/ai-chat/ChatPage.vue"), "utf8");
    const safeBlock = source.match(/\.chat-safe-bottom\s*\{[^}]+\}/);
    expect(safeBlock).toBeTruthy();
    expect(safeBlock[0]).toMatch(/height\s*:\s*var\(--safe-bottom/);
  });

  it("zeros chat-safe-bottom while the keyboard is open to avoid double IME offset", async () => {
    mockInvoke.mockImplementation((cmd) => {
      if (cmd === "get_current_user") {
        return Promise.resolve({ id: "u1", native_language: "zh" });
      }
      if (cmd === "get_chat_sessions_cmd") return Promise.resolve([]);
      if (cmd === "get_chat_messages_cmd") return Promise.resolve([]);
      return Promise.resolve(null);
    });

    const wrapper = await mountPage("sess-1", mockInvoke);
    await flushPromises();

    const safeStrip = wrapper.find(".chat-safe-bottom");
    expect(safeStrip.classes()).not.toContain("keyboard-open");

    viewport.height = 500;
    resizeHandler();
    await flushPromises();
    expect(safeStrip.classes()).toContain("keyboard-open");

    viewport.height = 700;
    resizeHandler();
    await flushPromises();
    expect(safeStrip.classes()).not.toContain("keyboard-open");
  });

  it("shows contextual starter chips on an empty Amiga session", async () => {
    mockInvoke.mockImplementation((cmd, args) => {
      if (cmd === "get_current_user") {
        return Promise.resolve({ id: "u1", native_language: "zh" });
      }
      if (cmd === "get_learning_goals_cmd") {
        return Promise.resolve([
          { id: 1, target_language: "es", cefr_level: "A1" },
        ]);
      }
      if (cmd === "get_path_curriculum_cmd") {
        return Promise.resolve({
          status: "active",
          units: [
            {
              title_native: "日常活动",
              title_target: "Rutinas",
              sections: [
                {
                  id: "grammar-1",
                  kind: "grammar",
                  title_native: "单元知识",
                  current: true,
                },
              ],
            },
          ],
        });
      }
      if (cmd === "get_teaching_content_cmd") {
        return Promise.resolve({
          grammar_points: ["过去时 -ar"],
          words: [],
        });
      }
      if (cmd === "get_chat_sessions_cmd") {
        return Promise.resolve([
          {
            id: "amiga-sess",
            contact_type: "amiga",
            target_language: "es",
          },
        ]);
      }
      if (cmd === "get_chat_messages_cmd") return Promise.resolve([]);
      return Promise.resolve(null);
    });

    const { useTargetLangStore } = await import("@/stores/targetLang.js");
    const store = useTargetLangStore();
    vi.spyOn(store, "load").mockResolvedValue("es");

    const wrapper = await mountPage("amiga-sess", mockInvoke);
    await flushPromises();
    await flushPromises();

    const chips = wrapper.findAll(".starter-chip");
    expect(chips.length).toBeGreaterThan(0);
    expect(chips.some((c) => c.text().includes("语法"))).toBe(true);
  });

  it("shows practice wrap-up overlay after guided practice with interaction", async () => {
    mockInvoke.mockImplementation((cmd) => {
      if (cmd === "get_current_user") {
        return Promise.resolve({ id: "u1", native_language: "zh" });
      }
      if (cmd === "get_learning_goals_cmd") {
        return Promise.resolve([{ id: 1, target_language: "es", cefr_level: "A1" }]);
      }
      if (cmd === "get_path_curriculum_cmd") {
        return Promise.resolve({ status: "active", units: [] });
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
      if (cmd === "chat_completion_with_session_cmd") {
        return Promise.resolve("¡Muy bien!");
      }
      return Promise.resolve(null);
    });

    const { useTargetLangStore } = await import("@/stores/targetLang.js");
    const store = useTargetLangStore();
    vi.spyOn(store, "load").mockResolvedValue("es");

    const wrapper = await mountPage("amiga-sess", mockInvoke, {
      query: { starterId: "reviewed-words", words: "hola, adiós", from: "vocab" },
    });
    await flushPromises();
    await flushPromises();

    await wrapper.find(".chat-input").setValue("hola");
    await wrapper.find(".send-btn").trigger("click");
    await flushPromises();
    await flushPromises();

    await wrapper.find(".back-btn").trigger("click");
    await flushPromises();
    await flushPromises();

    expect(wrapper.find(".practice-wrap-overlay").exists()).toBe(true);
    expect(wrapper.text()).toContain("口语练习完成");
    expect(wrapper.find(".next-steps-panel").exists()).toBe(true);
    expect(wrapper.find(".next-steps-primary").text()).toContain("还差");
  });

  it("returns to chat list for normal Amiga chat without guided practice", async () => {
    const replaceSpy = vi.fn();
    mockInvoke.mockImplementation((cmd) => {
      if (cmd === "get_current_user") {
        return Promise.resolve({ id: "u1", native_language: "zh" });
      }
      if (cmd === "get_chat_sessions_cmd") return Promise.resolve([]);
      if (cmd === "get_chat_messages_cmd") return Promise.resolve([]);
      return Promise.resolve(null);
    });

    const router = makeRouter("sess-1");
    router.replace = replaceSpy;
    await router.push("/chat/sess-1");
    await router.isReady();

    const wrapper = mount(ChatPage, { global: { plugins: [router] } });
    await flushPromises();

    await wrapper.find(".back-btn").trigger("click");
    expect(replaceSpy).toHaveBeenCalledWith({ name: "chat" });
    expect(wrapper.find(".practice-wrap-overlay").exists()).toBe(false);
  });

  it("resets the fixed chat viewport styles after the keyboard closes", async () => {
    mockInvoke.mockImplementation((cmd) => {
      if (cmd === "get_current_user") {
        return Promise.resolve({ id: "u1", native_language: "zh" });
      }
      if (cmd === "get_chat_sessions_cmd") return Promise.resolve([]);
      if (cmd === "get_chat_messages_cmd") return Promise.resolve([]);
      return Promise.resolve(null);
    });

    const wrapper = await mountPage("sess-1", mockInvoke);
    await flushPromises();

    const chatView = wrapper.find(".chat-view").element;
    expect(chatView.style.height).toBe("");

    viewport.height = 500;
    resizeHandler();
    expect(chatView.style.height).toBe("500px");

    viewport.height = 700;
    resizeHandler();
    expect(chatView.style.height).toBe("");
    expect(chatView.style.top).toBe("");
  });
});
