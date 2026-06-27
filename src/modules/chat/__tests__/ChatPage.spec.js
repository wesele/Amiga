import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { createRouter, createMemoryHistory } from "vue-router";
import * as api from "@/shared/api.js";
import { setLocale } from "@/shared/i18n";

vi.mock("@tauri-apps/plugin-shell", () => ({}));

const ChatPage = (await import("@/modules/chat/ChatPage.vue")).default;

function makeRouter(sessionId) {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: "/", component: { template: "<div/>" } },
      {
        path: "/chat/:sessionId",
        name: "chat-session",
        component: ChatPage,
        props: true,
      },
    ],
  });
}

async function mountPage(sessionId, mockInvoke) {
  const router = makeRouter(sessionId);
  await router.push(`/chat/${sessionId}`);
  await router.isReady();
  return mount(ChatPage, {
    global: { plugins: [router] },
  });
}

describe("ChatPage", () => {
  let mockInvoke;

  beforeEach(() => {
    setActivePinia(createPinia());
    mockInvoke = vi.fn();
    api.__setInvoke(mockInvoke);
    setLocale("zh", { persist: false });
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
});
