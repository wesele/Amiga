import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMemoryHistory, createRouter } from "vue-router";
import { flushPromises, mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import * as api from "@/shared/api.js";
import { setLocale } from "@/shared/i18n";

vi.mock("@tauri-apps/plugin-shell", () => ({}));

const SocialChatPage = (await import("@/modules/chat/SocialChatPage.vue")).default;

function makeRouter(mode = "public", peerId) {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: "/chat", name: "chat", component: { template: "<div/>" } },
      { path: "/chat/social", name: "social-hub", component: { template: "<div/>" } },
      {
        path: "/chat/social/:mode/:peerId?",
        name: "social-chat",
        component: SocialChatPage,
        meta: { parent: "chat" },
      },
    ],
  });
}

describe("SocialChatPage", () => {
  let mockInvoke;
  let fetchMock;
  let capturedSocket;

  beforeEach(() => {
    setActivePinia(createPinia());
    setLocale("en", { persist: false });
    mockInvoke = vi.fn();
    api.__setInvoke(mockInvoke);
    capturedSocket = null;

    class FakeWebSocket {
      static OPEN = 1;
      constructor(url) {
        this.url = String(url);
        this.readyState = 1;
        this.send = vi.fn();
        this.close = vi.fn();
        this._listeners = {};
        capturedSocket = this;
      }
      addEventListener(event, cb) {
        if (!this._listeners[event]) this._listeners[event] = [];
        this._listeners[event].push(cb);
      }
      removeEventListener() {}
      _emit(event, ...args) {
        for (const cb of this._listeners[event] || []) cb(...args);
      }
    }

    vi.stubGlobal("WebSocket", FakeWebSocket);
    vi.stubGlobal("WebSocket.OPEN", 1);

    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));

    mockInvoke.mockImplementation((cmd) => {
      if (cmd === "get_current_user") {
        return Promise.resolve({ id: "uuid-1", nickname: "Alice", native_language: "en" });
      }
      return Promise.resolve(null);
    });
  });

  async function mountPage(mode = "public", peerId) {
    const router = makeRouter(mode, peerId);
    const path = peerId ? `/chat/social/${mode}/${peerId}` : `/chat/social/${mode}`;
    await router.push(path);
    await router.isReady();

    const wrapper = mount(SocialChatPage, {
      global: { plugins: [router] },
    });
    await flushPromises();
    await flushPromises();
    return { wrapper, router };
  }

  it("renders public group room title", async () => {
    const { wrapper } = await mountPage("public");
    expect(wrapper.find(".header-name").text()).toBe("Public group");
  });

  it("renders direct room title from query name", async () => {
    const router = makeRouter("direct", "Bob");
    await router.push({ path: "/chat/social/direct/Bob", query: { name: "Bob" } });
    await router.isReady();

    const wrapper = mount(SocialChatPage, { global: { plugins: [router] } });
    await flushPromises();
    await flushPromises();

    expect(wrapper.find(".header-name").text()).toBe("Bob");
  });

  it("disables send while the socket is still connecting", async () => {
    const { wrapper } = await mountPage("public");
    expect(wrapper.find(".send-btn").classes()).toContain("disabled");
  });

  it("enables send after WebSocket open", async () => {
    const { wrapper } = await mountPage("public");

    capturedSocket._emit("open");
    await flushPromises();

    const input = wrapper.find(".chat-input");
    await input.setValue("Hello");
    expect(wrapper.find(".send-btn").classes()).not.toContain("disabled");
  });

  it("displays incoming messages", async () => {
    const { wrapper } = await mountPage("public");

    capturedSocket._emit("message", { data: JSON.stringify({
      type: "message",
      id: "m1",
      senderId: "Bob",
      text: "Hello everyone!",
      createdAt: "2026-01-01T12:00:00Z",
    }) });
    await flushPromises();

    const bubbles = wrapper.findAll(".msg-bubble");
    expect(bubbles).toHaveLength(1);
    expect(bubbles[0].find(".msg-text").text()).toBe("Hello everyone!");
    expect(bubbles[0].find(".msg-sender").text()).toBe("Bob");
  });

  it("displays history messages on connect", async () => {
    const { wrapper } = await mountPage("public");

    capturedSocket._emit("message", { data: JSON.stringify({
      type: "history",
      items: [
        { id: "h1", senderId: "Alice", text: "Hi", createdAt: "2026-01-01T12:00:00Z" },
        { id: "h2", senderId: "Bob", text: "Hey", createdAt: "2026-01-01T12:01:00Z" },
      ],
    }) });
    await flushPromises();

    const bubbles = wrapper.findAll(".msg-bubble");
    expect(bubbles).toHaveLength(2);
  });

  it("sends a message via WebSocket on click send", async () => {
    const { wrapper } = await mountPage("public");

    capturedSocket._emit("open");
    await flushPromises();

    const input = wrapper.find(".chat-input");
    await input.setValue("Hello world");

    const sendBtn = wrapper.find(".send-btn");
    await sendBtn.trigger("click");
    await flushPromises();

    expect(capturedSocket.send).toHaveBeenCalled();
    const sent = JSON.parse(capturedSocket.send.mock.calls[0][0]);
    expect(sent.type).toBe("message");
    expect(sent.mode).toBe("public");
    expect(sent.text).toBe("Hello world");
  });

  it("sends a message on Enter key", async () => {
    const { wrapper } = await mountPage("public");

    capturedSocket._emit("open");
    await flushPromises();

    const input = wrapper.find(".chat-input");
    await input.setValue("Test enter");
    await input.trigger("keydown.enter");
    await flushPromises();

    expect(capturedSocket.send).toHaveBeenCalled();
  });

  it("does not send empty messages", async () => {
    const { wrapper } = await mountPage("public");

    capturedSocket._emit("open");
    await flushPromises();

    const sendBtn = wrapper.find(".send-btn");
    expect(sendBtn.classes()).toContain("disabled");
  });

  it("classifies messages as mine vs theirs", async () => {
    const { wrapper } = await mountPage("public");

    capturedSocket._emit("message", { data: JSON.stringify({
      type: "message",
      id: "m1",
      senderId: "Bob",
      text: "From Bob",
      createdAt: "2026-01-01T12:00:00Z",
    }) });
    await flushPromises();

    const rows = wrapper.findAll(".msg-row");
    expect(rows[0].classes()).toContain("msg-other");
  });

  it("classifies own sent messages as mine", async () => {
    const { wrapper } = await mountPage("public");

    capturedSocket._emit("open");
    await flushPromises();

    const input = wrapper.find(".chat-input");
    await input.setValue("My message");
    await input.trigger("keydown.enter");
    await flushPromises();

    const rows = wrapper.findAll(".msg-row.msg-user");
    expect(rows.length).toBeGreaterThanOrEqual(1);
  });

  it("clears input after sending", async () => {
    const { wrapper } = await mountPage("public");

    capturedSocket._emit("open");
    await flushPromises();

    const input = wrapper.find(".chat-input");
    await input.setValue("Will be cleared");
    await input.trigger("keydown.enter");
    await flushPromises();

    expect(wrapper.find(".chat-input").element.value).toBe("");
  });

  it("loads offline messages for direct mode", async () => {
    fetchMock
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        items: [
          { id: "off1", senderId: "Bob", receiverId: "Alice", content: "Offline msg", createdAt: "2026-01-01T12:00:00Z" },
        ],
      }), { status: 200 }));

    const { wrapper } = await mountPage("direct", "Bob");

    const bubbles = wrapper.findAll(".msg-bubble");
    expect(bubbles.some((b) => b.text().includes("Offline msg"))).toBe(true);
  });

  it("navigates back to chat list on back click", async () => {
    const { wrapper, router } = await mountPage("public");

    const replaceSpy = vi.spyOn(router, "replace");
    const backBtn = wrapper.find(".back-btn");
    await backBtn.trigger("click");

    expect(replaceSpy).toHaveBeenCalledWith({ name: "chat" });
  });

  it("closes WebSocket on back", async () => {
    const { wrapper } = await mountPage("public");

    const backBtn = wrapper.find(".back-btn");
    await backBtn.trigger("click");

    expect(capturedSocket.close).toHaveBeenCalledWith(1000, "client-background");
  });

  it("shows welcome state when no messages", async () => {
    const { wrapper } = await mountPage("public");
    expect(wrapper.find(".welcome-box").exists()).toBe(true);
  });

  it("disconnects socket on unmount", async () => {
    const { wrapper } = await mountPage("public");

    wrapper.unmount();
    expect(capturedSocket.close).toHaveBeenCalled();
  });

  it("closes the old socket and reconnects when route peerId changes", async () => {
    const { wrapper, router } = await mountPage("direct", "Bob");
    const firstSocket = capturedSocket;
    expect(firstSocket.url).toContain("peerId=Bob");

    await router.push("/chat/social/direct/Carol");
    await flushPromises();
    await flushPromises();

    expect(firstSocket.close).toHaveBeenCalled();
    expect(capturedSocket).not.toBe(firstSocket);
    expect(capturedSocket.url).toContain("peerId=Carol");
  });

  it("clears messages when navigating between direct chats", async () => {
    const { wrapper, router } = await mountPage("direct", "Bob");
    capturedSocket._emit("message", { data: JSON.stringify({
      type: "message",
      id: "m1",
      senderId: "Bob",
      text: "hi from Bob",
      createdAt: "2026-01-01T12:00:00Z",
    }) });
    await flushPromises();
    expect(wrapper.findAll(".msg-bubble").length).toBe(1);

    await router.push("/chat/social/direct/Carol");
    await flushPromises();
    await flushPromises();

    expect(wrapper.findAll(".msg-bubble").length).toBe(0);
  });

  it("schedules a reconnect after the websocket closes", async () => {
    vi.useFakeTimers();
    try {
      const { wrapper } = await mountPage("public");
      const initialSocket = capturedSocket;
      initialSocket._emit("open");
      await flushPromises();
      initialSocket._emit("close", new Event("close"));
      await flushPromises();
      vi.advanceTimersByTime(2000);
      for (let i = 0; i < 5; i += 1) {
        await flushPromises();
      }
      expect(capturedSocket).not.toBe(initialSocket);
    } finally {
      vi.useRealTimers();
    }
  });

  it("warns the user when pressing Enter before the socket is open", async () => {
    const { wrapper } = await mountPage("public");
    const input = wrapper.find(".chat-input");
    await input.setValue("hi");
    await input.trigger("keydown.enter");
    await flushPromises();
    expect(wrapper.find(".chat-send-error").exists()).toBe(true);
    expect(wrapper.find(".chat-send-error").text().length).toBeGreaterThan(0);
  });

  it("constructs WebSocket URL with peerId for direct mode", async () => {
    const { wrapper } = await mountPage("direct", "Bob");

    expect(capturedSocket).not.toBeNull();
    expect(capturedSocket.url).toContain("peerId=Bob");
    expect(capturedSocket.url).toContain("mode=direct");
  });

  it("constructs WebSocket URL without peerId for public mode", async () => {
    const { wrapper } = await mountPage("public");

    expect(capturedSocket).not.toBeNull();
    expect(capturedSocket.url).toContain("mode=public");
    expect(capturedSocket.url).not.toContain("peerId");
  });
});
