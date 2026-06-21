import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { createRouter, createMemoryHistory } from "vue-router";
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
    ],
  });
}

function makeStubRoute(query = {}) {
  return { params: {}, query, path: "/chat", name: "chat" };
}

function makeStubRouter() {
  return {
    push: vi.fn(),
    replace: vi.fn(),
    currentRoute: { value: { fullPath: "/chat" } },
  };
}

function mountList() {
  return mount(ContactList, {
    global: {
      mocks: { $router: makeStubRouter(), $route: makeStubRoute() },
    },
  });
}

describe("ContactList", () => {
  let mockInvoke;
  let stubRouter;

  beforeEach(() => {
    setActivePinia(createPinia());
    mockInvoke = vi.fn();
    api.__setInvoke(mockInvoke);
    setLocale("zh", { persist: false });
  });

  it("renders both Amiga and AI Translator contacts", async () => {
    mockInvoke.mockImplementation((cmd) => {
      if (cmd === "get_chat_sessions_cmd") return Promise.resolve([]);
      return Promise.resolve(null);
    });
    const wrapper = mountList();
    await flushPromises();
    const items = wrapper.findAll(".contact-item");
    expect(items.length).toBe(2);
    const names = items.map((i) => i.find(".contact-name").text());
    expect(names).toContain("Amiga");
    expect(names).toContain("AI 翻译");
  });

  it("Amiga contact uses the Android app-icon image, not the 🤖 emoji", async () => {
    mockInvoke.mockImplementation((cmd) => {
      if (cmd === "get_chat_sessions_cmd") return Promise.resolve([]);
      return Promise.resolve(null);
    });
    const wrapper = mountList();
    await flushPromises();
    const amigaItem = wrapper
      .findAll(".contact-item")
      .find((el) => el.find(".contact-name").text() === "Amiga");
    expect(amigaItem).toBeTruthy();
    const avatar = amigaItem.find(".contact-avatar");
    // The avatar is the Android launcher brand mark (orange + blue
    // ring) extracted from the built APK and served from
    // /amiga-icon.png. No 🤖 emoji, no inline SVG, no green "I".
    const img = avatar.find("img");
    expect(img.exists()).toBe(true);
    expect(img.attributes("src")).toBe("/amiga-icon.png");
    expect(img.attributes("alt")).toBe("Amiga");
  });

  it("clicking the AI 翻译 contact creates a translator session and navigates to it", async () => {
    let createdArgs = null;
    mockInvoke.mockImplementation((cmd, args) => {
      if (cmd === "get_chat_sessions_cmd") return Promise.resolve([]);
      if (cmd === "get_current_user") return Promise.resolve({ id: "u1" });
      if (cmd === "create_chat_session_cmd") {
        createdArgs = args;
        return Promise.resolve("translator-session-id");
      }
      return Promise.resolve(null);
    });

    const router = makeRouter();
    const pushSpy = vi.spyOn(router, "push");
    const wrapper = mount(ContactList, {
      global: {
        plugins: [router],
        mocks: { $route: makeStubRoute() },
      },
    });
    await flushPromises();

    const translatorItem = wrapper
      .findAll(".contact-item")
      .find((el) => el.find(".contact-name").text() === "AI 翻译");
    expect(translatorItem).toBeTruthy();
    await translatorItem.trigger("click");
    await flushPromises();

    // The session must be created with contactType="translator" — the
    // bug that previously caused ChatPage to render the wrong header
    // was that the backend had this field set correctly but the
    // page's session-lookup was using the wrong target_lang, so it
    // couldn't find the row. This test pins the *creation* half.
    expect(createdArgs).toMatchObject({
      userId: "u1",
      contactType: "translator",
    });
    expect(pushSpy).toHaveBeenCalledWith(
      "/chat/translator-session-id",
    );
  });

  it("clicking the Amiga contact creates an amiga session", async () => {
    let createdArgs = null;
    mockInvoke.mockImplementation((cmd, args) => {
      if (cmd === "get_chat_sessions_cmd") return Promise.resolve([]);
      if (cmd === "get_current_user") return Promise.resolve({ id: "u1" });
      if (cmd === "create_chat_session_cmd") {
        createdArgs = args;
        return Promise.resolve("amiga-session-id");
      }
      return Promise.resolve(null);
    });

    const router = makeRouter();
    const pushSpy = vi.spyOn(router, "push");
    const wrapper = mount(ContactList, {
      global: {
        plugins: [router],
        mocks: { $route: makeStubRoute() },
      },
    });
    await flushPromises();

    const amigaItem = wrapper
      .findAll(".contact-item")
      .find((el) => el.find(".contact-name").text() === "Amiga");
    expect(amigaItem).toBeTruthy();
    await amigaItem.trigger("click");
    await flushPromises();

    expect(createdArgs).toMatchObject({
      userId: "u1",
      contactType: "amiga",
    });
    expect(pushSpy).toHaveBeenCalledWith(
      "/chat/amiga-session-id",
    );
  });

  it("reuses an existing session instead of creating a new one", async () => {
    let createCalls = 0;
    mockInvoke.mockImplementation((cmd) => {
      if (cmd === "get_chat_sessions_cmd") {
        return Promise.resolve([
          { id: "existing-translator-id", contact_type: "translator", target_language: "es", last_message: "", updated_at: "" },
        ]);
      }
      if (cmd === "create_chat_session_cmd") {
        createCalls++;
        return Promise.resolve("should-not-be-used");
      }
      return Promise.resolve(null);
    });

    const router = makeRouter();
    const pushSpy = vi.spyOn(router, "push");
    const wrapper = mount(ContactList, {
      global: {
        plugins: [router],
        mocks: { $route: makeStubRoute() },
      },
    });
    await flushPromises();

    const translatorItem = wrapper
      .findAll(".contact-item")
      .find((el) => el.find(".contact-name").text() === "AI 翻译");
    await translatorItem.trigger("click");
    await flushPromises();

    expect(createCalls).toBe(0);
    expect(pushSpy).toHaveBeenCalledWith(
      "/chat/existing-translator-id",
    );
  });
});
