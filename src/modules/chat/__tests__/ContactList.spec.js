import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMemoryHistory, createRouter } from "vue-router";
import { flushPromises, mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import * as api from "@/shared/api.js";
import { setLocale } from "@/shared/i18n";

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

describe("ContactList", () => {
  let mockInvoke;
  let fetchMock;

  beforeEach(() => {
    setActivePinia(createPinia());
    mockInvoke = vi.fn();
    api.__setInvoke(mockInvoke);
    setLocale("zh", { persist: false });
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  it("renders public group, Amiga and AI Translator in the top-level list", async () => {
    mockInvoke.mockImplementation((cmd) => {
      if (cmd === "get_chat_sessions_cmd") return Promise.resolve([]);
      if (cmd === "get_current_user") return Promise.resolve({ id: "u1", nickname: "Alice" });
      return Promise.resolve(null);
    });
    fetchMock
      .mockResolvedValueOnce(new Response(JSON.stringify({ userCount: 5 }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ items: [] }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ items: [] }), { status: 200 }));

    const router = makeRouter();
    const wrapper = mount(ContactList, {
      global: { plugins: [router] },
    });
    await flushPromises();

    const names = wrapper.findAll(".contact-name").map((item) => item.text());
    expect(names[0]).toBe("Public group");
    expect(names).toContain("Amiga");
    expect(names).toContain("AI 翻译");
  });

  it("clicking public group opens the social public chat", async () => {
    mockInvoke.mockImplementation((cmd) => {
      if (cmd === "get_chat_sessions_cmd") return Promise.resolve([]);
      if (cmd === "get_current_user") return Promise.resolve({ id: "u1", nickname: "Alice" });
      return Promise.resolve(null);
    });
    fetchMock
      .mockResolvedValueOnce(new Response(JSON.stringify({ userCount: 5 }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ items: [] }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ items: [] }), { status: 200 }));

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
    fetchMock
      .mockResolvedValueOnce(new Response(JSON.stringify({ userCount: 5 }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ items: [] }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ items: [] }), { status: 200 }));

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
    expect(pushSpy).toHaveBeenCalledWith("/chat/translator-session-id");
  });
});
