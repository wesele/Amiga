import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMemoryHistory, createRouter } from "vue-router";
import { flushPromises, mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import * as api from "@/shared/api.js";
import { setLocale } from "@/shared/i18n";
import {
  PENDING_SOURCES,
  savePendingAiPractice,
} from "@/modules/ai-chat/pendingAiPractice.js";

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

function setupMocks({ sessions = [], friends = [] } = {}) {
  const mockInvoke = vi.fn().mockImplementation((cmd) => {
    if (cmd === "get_chat_sessions_cmd") return Promise.resolve(sessions);
    if (cmd === "get_current_user") return Promise.resolve({ id: "u1", nickname: "Alice" });
    return Promise.resolve(null);
  });

  const fetchMock = vi.fn().mockImplementation((url) => {
    const target = String(url);
    if (target.includes("/api/friends?")) {
      return Promise.resolve(new Response(JSON.stringify({ items: friends }), { status: 200 }));
    }
    if (target.includes("/api/messages/offline")) {
      return Promise.resolve(new Response(JSON.stringify({ items: [] }), { status: 200 }));
    }
    return Promise.resolve(new Response(JSON.stringify({}), { status: 200 }));
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
  vi.stubGlobal("fetch", fetchMock);
  vi.stubGlobal("WebSocket", FakeWebSocket);

  return { mockInvoke, fetchMock };
}

describe("ContactList", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    setLocale("zh", { persist: false });
    localStorage.clear();
  });

  it("renders public group, Amiga and AI Translator in the top-level list", async () => {
    setupMocks();

    const router = makeRouter();
    const wrapper = mount(ContactList, {
      global: { plugins: [router] },
    });
    await flushPromises();

    const names = wrapper.findAll(".contact-name").map((item) => item.text());
    expect(names[0]).toBe("公共群聊");
    expect(names).toContain("Amiga");
    expect(names).toContain("AI 翻译");
  });

  it("clicking public group opens the social public chat", async () => {
    setupMocks();

    const router = makeRouter();
    const pushSpy = vi.spyOn(router, "push");
    const wrapper = mount(ContactList, {
      global: { plugins: [router] },
    });
    await flushPromises();

    await wrapper.findAll(".contact-item")[0].trigger("click");
    expect(pushSpy).toHaveBeenCalledWith({ name: "social-chat", params: { mode: "public" } });
  });

  it("clicking the AI Translator contact creates a translator session", async () => {
    const { mockInvoke } = setupMocks();
    let createdArgs = null;
    mockInvoke.mockImplementation((cmd, args) => {
      if (cmd === "get_chat_sessions_cmd") return Promise.resolve([]);
      if (cmd === "get_current_user") return Promise.resolve({ id: "u1", nickname: "Alice" });
      if (cmd === "create_chat_session_cmd") {
        createdArgs = args;
        return Promise.resolve("translator-session-id");
      }
      return Promise.resolve(null);
    });

    const router = makeRouter();
    const pushSpy = vi.spyOn(router, "push");
    const wrapper = mount(ContactList, {
      global: { plugins: [router] },
    });
    await flushPromises();

    const translatorItem = wrapper.findAll(".contact-item")
      .find((item) => item.find(".contact-name").text() === "AI 翻译");
    await translatorItem.trigger("click");

    expect(createdArgs).toMatchObject({ userId: "u1", contactType: "translator" });
    expect(pushSpy).toHaveBeenCalledWith({
      name: "chat-session",
      params: { sessionId: "translator-session-id" },
    });
  });

  it("clicking Amiga creates an amiga session when none exists", async () => {
    const { mockInvoke } = setupMocks();
    let createdArgs = null;
    mockInvoke.mockImplementation((cmd, args) => {
      if (cmd === "get_chat_sessions_cmd") return Promise.resolve([]);
      if (cmd === "get_current_user") return Promise.resolve({ id: "u1", nickname: "Alice" });
      if (cmd === "create_chat_session_cmd") {
        createdArgs = args;
        return Promise.resolve("amiga-session-id");
      }
      return Promise.resolve(null);
    });

    const router = makeRouter();
    const pushSpy = vi.spyOn(router, "push");
    const wrapper = mount(ContactList, {
      global: { plugins: [router] },
    });
    await flushPromises();

    const amigaItem = wrapper.findAll(".contact-item")
      .find((item) => item.find(".contact-name").text() === "Amiga");
    await amigaItem.trigger("click");

    expect(createdArgs).toMatchObject({ userId: "u1", contactType: "amiga" });
    expect(pushSpy).toHaveBeenCalledWith({
      name: "chat-session",
      params: { sessionId: "amiga-session-id" },
    });
  });

  it("opens existing session instead of creating a new one", async () => {
    const { mockInvoke } = setupMocks({
      sessions: [{
        id: "existing-sess",
        contact_type: "amiga",
        target_language: "en",
        updated_at: "2026-06-01T00:00:00Z",
        last_message: "hi",
      }],
    });

    const router = makeRouter();
    const pushSpy = vi.spyOn(router, "push");
    const wrapper = mount(ContactList, {
      global: { plugins: [router] },
    });
    await flushPromises();

    const amigaItem = wrapper.findAll(".contact-item")
      .find((item) => item.find(".contact-name").text() === "Amiga");
    await amigaItem.trigger("click");

    expect(pushSpy).toHaveBeenCalledWith({
      name: "chat-session",
      params: { sessionId: "existing-sess" },
    });
  });

  it("renders friends in the contact list", async () => {
    setupMocks({
      friends: [{ friendUserId: "Bob", updatedAt: "2026-01-01T00:00:00Z" }],
    });

    const router = makeRouter();
    const wrapper = mount(ContactList, {
      global: { plugins: [router] },
    });
    await flushPromises();

    const names = wrapper.findAll(".contact-name").map((el) => el.text());
    expect(names).toContain("Bob");
  });

  it("clicking a friend opens direct chat", async () => {
    setupMocks({
      friends: [{ friendUserId: "Bob", updatedAt: "2026-01-01T00:00:00Z" }],
    });

    const router = makeRouter();
    const pushSpy = vi.spyOn(router, "push");
    const wrapper = mount(ContactList, {
      global: { plugins: [router] },
    });
    await flushPromises();

    const friendItem = wrapper.findAll(".contact-item")
      .find((item) => item.find(".contact-name").text() === "Bob");
    await friendItem.trigger("click");

    expect(pushSpy).toHaveBeenCalledWith({
      name: "social-chat",
      params: { mode: "direct", peerId: "Bob" },
      query: { name: "Bob" },
    });
  });

  it("shows public group description like other contacts", async () => {
    setupMocks();

    const router = makeRouter();
    const wrapper = mount(ContactList, {
      global: { plugins: [router] },
    });
    await flushPromises();

    const publicItem = wrapper.findAll(".contact-item")[0];
    expect(publicItem.find(".contact-desc").text()).toContain("实时群聊");
    expect(publicItem.classes()).not.toContain("contact-item-public");
  });

  it("navigates to social hub on + button click", async () => {
    setupMocks();

    const router = makeRouter();
    const pushSpy = vi.spyOn(router, "push");
    const wrapper = mount(ContactList, {
      global: { plugins: [router] },
    });
    await flushPromises();

    await wrapper.find(".manage-btn").trigger("click");
    expect(pushSpy).toHaveBeenCalledWith({ name: "social-hub" });
  });

  it("shows last message from session as description", async () => {
    setupMocks({
      sessions: [{
        id: "s1",
        contact_type: "amiga",
        target_language: "en",
        updated_at: "2026-06-01T00:00:00Z",
        last_message: "Last msg here",
      }],
    });

    const router = makeRouter();
    const wrapper = mount(ContactList, {
      global: { plugins: [router] },
    });
    await flushPromises();

    const amigaDesc = wrapper.findAll(".contact-item")
      .find((item) => item.find(".contact-name").text() === "Amiga");
    expect(amigaDesc.find(".contact-desc").text()).toBe("Last msg here");
  });

  it("shows pending practice hero when saved words exist", async () => {
    setupMocks();
    savePendingAiPractice({
      source: PENDING_SOURCES.READING,
      words: ["viaje", "hotel", "playa"],
    });

    const router = makeRouter();
    const wrapper = mount(ContactList, {
      global: { plugins: [router] },
    });
    await flushPromises();

    expect(wrapper.find(".pending-practice-hero").exists()).toBe(true);
    expect(wrapper.text()).toContain("待练口语");
    expect(wrapper.text()).toContain("viaje, hotel, playa");
  });

  it("hides pending practice hero when fewer than three words are saved", async () => {
    setupMocks();
    savePendingAiPractice({
      source: PENDING_SOURCES.READING,
      words: ["viaje", "hotel"],
    });

    const router = makeRouter();
    const wrapper = mount(ContactList, {
      global: { plugins: [router] },
    });
    await flushPromises();

    expect(wrapper.find(".pending-practice-hero").exists()).toBe(false);
  });

  it("starts guided practice from pending hero CTA", async () => {
    const { mockInvoke } = setupMocks();
    mockInvoke.mockImplementation((cmd, args) => {
      if (cmd === "get_chat_sessions_cmd") return Promise.resolve([]);
      if (cmd === "get_current_user") return Promise.resolve({ id: "u1", nickname: "Alice" });
      if (cmd === "create_chat_session_cmd") return Promise.resolve("amiga-session-id");
      return Promise.resolve(null);
    });
    savePendingAiPractice({
      source: PENDING_SOURCES.VOCAB,
      words: ["alpha", "beta", "gamma"],
    });

    const router = makeRouter();
    const pushSpy = vi.spyOn(router, "push");
    const wrapper = mount(ContactList, {
      global: { plugins: [router] },
    });
    await flushPromises();

    await wrapper.find(".pending-practice-start").trigger("click");
    await flushPromises();

    expect(pushSpy).toHaveBeenCalledWith({
      name: "chat-session",
      params: { sessionId: "amiga-session-id" },
      query: {
        starterId: "reviewed-words",
        words: "alpha, beta, gamma",
        from: "vocab",
      },
    });
  });

  it("clears pending practice when dismissed", async () => {
    setupMocks();
    savePendingAiPractice({
      source: PENDING_SOURCES.READING,
      words: ["viaje", "hotel", "playa"],
    });

    const router = makeRouter();
    const wrapper = mount(ContactList, {
      global: { plugins: [router] },
    });
    await flushPromises();

    await wrapper.find(".pending-practice-dismiss").trigger("click");
    await flushPromises();

    expect(wrapper.find(".pending-practice-hero").exists()).toBe(false);
  });

  it("handles social API failure gracefully", async () => {
    const mockInvoke = vi.fn().mockImplementation((cmd) => {
      if (cmd === "get_chat_sessions_cmd") return Promise.resolve([]);
      if (cmd === "get_current_user") return Promise.resolve({ id: "u1", nickname: "Alice" });
      return Promise.resolve(null);
    });
    api.__setInvoke(mockInvoke);
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network error")));

    const router = makeRouter();
    const wrapper = mount(ContactList, {
      global: { plugins: [router] },
    });
    await flushPromises();

    const names = wrapper.findAll(".contact-name").map((el) => el.text());
    expect(names).toContain("Amiga");
    expect(names).toContain("AI 翻译");
  });
});
