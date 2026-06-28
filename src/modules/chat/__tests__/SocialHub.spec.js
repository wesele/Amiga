import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMemoryHistory, createRouter } from "vue-router";
import { flushPromises, mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import * as api from "@/shared/api.js";
import { setLocale } from "@/shared/i18n";

vi.mock("@tauri-apps/plugin-shell", () => ({}));

const SocialHub = (await import("@/modules/chat/SocialHub.vue")).default;

function makeRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: "/chat", name: "chat", component: { template: "<div/>" } },
      { path: "/chat/social", name: "social-hub", component: SocialHub },
      { path: "/chat/social/:mode/:peerId?", name: "social-chat", component: { template: "<div/>" } },
    ],
  });
}

describe("SocialHub", () => {
  let mockInvoke;
  let fetchMock;

  beforeEach(() => {
    setActivePinia(createPinia());
    setLocale("en", { persist: false });
    mockInvoke = vi.fn();
    api.__setInvoke(mockInvoke);
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  function setupFetchMock({ userCount = 0, pending = [], friends = [] } = {}) {
    fetchMock
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ userCount }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ items: pending }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ items: friends }), { status: 200 }));
  }

  function setupFetchMockReload({ userCount = 0, pending = [], friends = [] } = {}) {
    fetchMock
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ userCount }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ items: pending }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ items: friends }), { status: 200 }));
  }

  it("loads summary data and accepted friends", async () => {
    mockInvoke.mockImplementation((cmd) => {
      if (cmd === "get_current_user") {
        return Promise.resolve({ id: "uuid-1", nickname: "Alice", avatar: "🙂", native_language: "en" });
      }
      return Promise.resolve("");
    });

    setupFetchMock({
      userCount: 12,
      pending: [{ fromUserId: "Bob", createdAt: "2026-01-01T00:00:00Z" }],
      friends: [{ friendUserId: "Carol", updatedAt: "2026-01-02T00:00:00Z" }],
    });

    const router = makeRouter();
    await router.push("/chat/social");
    await router.isReady();

    const wrapper = mount(SocialHub, {
      global: { plugins: [router] },
    });
    await flushPromises();

    expect(wrapper.text()).toContain("12");
    expect(wrapper.text()).toContain("Bob");
    expect(wrapper.text()).toContain("Carol");
  });

  it("navigates back to chat list on back button click", async () => {
    mockInvoke.mockImplementation((cmd) => {
      if (cmd === "get_current_user") return Promise.resolve({ id: "u1", nickname: "A" });
      return Promise.resolve("");
    });

    setupFetchMock();

    const router = makeRouter();
    await router.push("/chat/social");
    await router.isReady();

    const wrapper = mount(SocialHub, {
      global: { plugins: [router] },
    });
    await flushPromises();

    const replaceSpy = vi.spyOn(router, "replace");
    await wrapper.find(".back-btn").trigger("click");
    expect(replaceSpy).toHaveBeenCalledWith({ name: "chat" });
  });

  it("navigates to public group on 'Enter' click", async () => {
    mockInvoke.mockImplementation((cmd) => {
      if (cmd === "get_current_user") return Promise.resolve({ id: "u1", nickname: "A" });
      return Promise.resolve("");
    });

    setupFetchMock();

    const router = makeRouter();
    await router.push("/chat/social");
    await router.isReady();

    const wrapper = mount(SocialHub, {
      global: { plugins: [router] },
    });
    await flushPromises();

    const pushSpy = vi.spyOn(router, "push");
    const buttons = wrapper.findAll(".primary-btn");
    const enterBtn = buttons.find((btn) => btn.text().includes("Enter"));
    await enterBtn.trigger("click");
    expect(pushSpy).toHaveBeenCalledWith({ name: "social-chat", params: { mode: "public" } });
  });

  it("sends a friend request", async () => {
    mockInvoke.mockImplementation((cmd) => {
      if (cmd === "get_current_user") return Promise.resolve({ id: "u1", nickname: "Alice" });
      return Promise.resolve("");
    });

    setupFetchMock();
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    setupFetchMockReload();

    const router = makeRouter();
    await router.push("/chat/social");
    await router.isReady();

    const wrapper = mount(SocialHub, {
      global: { plugins: [router] },
    });
    await flushPromises();

    const input = wrapper.find("input");
    await input.setValue("Bob");

    const buttons = wrapper.findAll(".primary-btn");
    const requestBtn = buttons.find((btn) => btn.text().includes("Request"));
    await requestBtn.trigger("click");
    await flushPromises();

    expect(wrapper.text()).toContain("Friend request sent");
  });

  it("rejects friend requests to self", async () => {
    mockInvoke.mockImplementation((cmd) => {
      if (cmd === "get_current_user") return Promise.resolve({ id: "u1", nickname: "Alice" });
      return Promise.resolve("");
    });

    setupFetchMock();

    const router = makeRouter();
    await router.push("/chat/social");
    await router.isReady();

    const wrapper = mount(SocialHub, {
      global: { plugins: [router] },
    });
    await flushPromises();

    const input = wrapper.find("input");
    await input.setValue("Alice");
    await flushPromises();
    const buttons = wrapper.findAll(".primary-btn");
    const requestBtn = buttons.find((btn) => btn.text().includes("Request"));
    expect(requestBtn.element.disabled).toBe(true);
    expect(wrapper.text()).toContain("yourself");
  });

  it("rejects empty friend requests", async () => {
    mockInvoke.mockImplementation((cmd) => {
      if (cmd === "get_current_user") return Promise.resolve({ id: "u1", nickname: "Alice" });
      return Promise.resolve("");
    });

    setupFetchMock();

    const router = makeRouter();
    await router.push("/chat/social");
    await router.isReady();

    const wrapper = mount(SocialHub, {
      global: { plugins: [router] },
    });
    await flushPromises();

    const input = wrapper.find("input");
    await input.setValue("   ");
    await flushPromises();
    const buttons = wrapper.findAll(".primary-btn");
    const requestBtn = buttons.find((btn) => btn.text().includes("Request"));
    expect(requestBtn.element.disabled).toBe(true);
  });

  it("accepts a friend request", async () => {
    mockInvoke.mockImplementation((cmd) => {
      if (cmd === "get_current_user") return Promise.resolve({ id: "u1", nickname: "Alice" });
      return Promise.resolve("");
    });

    setupFetchMock({
      userCount: 1,
      pending: [{ fromUserId: "Bob", createdAt: "2026-01-01T00:00:00Z" }],
      friends: [],
    });

    fetchMock
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    setupFetchMockReload({
      userCount: 1,
      pending: [],
      friends: [{ friendUserId: "Bob", updatedAt: "2026-01-02T00:00:00Z" }],
    });

    const router = makeRouter();
    await router.push("/chat/social");
    await router.isReady();

    const wrapper = mount(SocialHub, {
      global: { plugins: [router] },
    });
    await flushPromises();

    const buttons = wrapper.findAll(".primary-btn");
    const acceptBtn = buttons.find((btn) => btn.text().includes("Accept"));
    await acceptBtn.trigger("click");
    await flushPromises();

    expect(wrapper.text()).toContain("Friend accepted");
  });

  it("opens direct chat with a friend", async () => {
    mockInvoke.mockImplementation((cmd) => {
      if (cmd === "get_current_user") return Promise.resolve({ id: "u1", nickname: "Alice" });
      return Promise.resolve("");
    });

    setupFetchMock({
      friends: [{ friendUserId: "Carol", updatedAt: "2026-01-02T00:00:00Z" }],
    });

    const router = makeRouter();
    await router.push("/chat/social");
    await router.isReady();

    const wrapper = mount(SocialHub, {
      global: { plugins: [router] },
    });
    await flushPromises();

    const pushSpy = vi.spyOn(router, "push");
    const buttons = wrapper.findAll(".primary-btn");
    const chatBtn = buttons.find((btn) => btn.text().includes("Chat"));
    await chatBtn.trigger("click");
    expect(pushSpy).toHaveBeenCalledWith({
      name: "social-chat",
      params: { mode: "direct", peerId: "Carol" },
      query: { name: "Carol" },
    });
  });

  it("shows empty state for no pending requests", async () => {
    mockInvoke.mockImplementation((cmd) => {
      if (cmd === "get_current_user") return Promise.resolve({ id: "u1", nickname: "A" });
      return Promise.resolve("");
    });

    setupFetchMock();

    const router = makeRouter();
    await router.push("/chat/social");
    await router.isReady();

    const wrapper = mount(SocialHub, {
      global: { plugins: [router] },
    });
    await flushPromises();

    expect(wrapper.text()).toContain("No pending requests");
  });

  it("shows empty state for no friends", async () => {
    mockInvoke.mockImplementation((cmd) => {
      if (cmd === "get_current_user") return Promise.resolve({ id: "u1", nickname: "A" });
      return Promise.resolve("");
    });

    setupFetchMock();

    const router = makeRouter();
    await router.push("/chat/social");
    await router.isReady();

    const wrapper = mount(SocialHub, {
      global: { plugins: [router] },
    });
    await flushPromises();

    expect(wrapper.text()).toContain("No accepted friends yet");
  });

  it("handles load failure gracefully", async () => {
    mockInvoke.mockImplementation((cmd) => {
      if (cmd === "get_current_user") return Promise.resolve({ id: "u1", nickname: "A" });
      return Promise.resolve("");
    });

    fetchMock.mockRejectedValue(new Error("network error"));

    const router = makeRouter();
    await router.push("/chat/social");
    await router.isReady();

    const wrapper = mount(SocialHub, {
      global: { plugins: [router] },
    });
    await flushPromises();

    expect(wrapper.text()).toContain("Could not load social chat data");
  });

  it("disables buttons when userId is not yet loaded", async () => {
    mockInvoke.mockImplementation((cmd) => {
      if (cmd === "get_current_user") return new Promise(() => {});
      return Promise.resolve("");
    });

    fetchMock.mockRejectedValue(new Error("no user yet"));

    const router = makeRouter();
    await router.push("/chat/social");
    await router.isReady();

    const wrapper = mount(SocialHub, {
      global: { plugins: [router] },
    });
    await flushPromises();

    const disabledBtns = wrapper.findAll(".primary-btn[disabled]");
    expect(disabledBtns.length).toBeGreaterThan(0);
  });

  it("shows the user ID in the add friend description", async () => {
    mockInvoke.mockImplementation((cmd) => {
      if (cmd === "get_current_user") return Promise.resolve({ id: "u1", nickname: "MyNick" });
      return Promise.resolve("");
    });

    setupFetchMock();

    const router = makeRouter();
    await router.push("/chat/social");
    await router.isReady();

    const wrapper = mount(SocialHub, {
      global: { plugins: [router] },
    });
    await flushPromises();

    expect(wrapper.text()).toContain("MyNick");
  });

  it("shows online user count in stats", async () => {
    mockInvoke.mockImplementation((cmd) => {
      if (cmd === "get_current_user") return Promise.resolve({ id: "u1", nickname: "A" });
      return Promise.resolve("");
    });

    setupFetchMock({ userCount: 42 });

    const router = makeRouter();
    await router.push("/chat/social");
    await router.isReady();

    const wrapper = mount(SocialHub, {
      global: { plugins: [router] },
    });
    await flushPromises();

    const pills = wrapper.findAll(".stat-pill strong");
    expect(pills[0].text()).toBe("42");
  });

  it("shows pending count in stats", async () => {
    mockInvoke.mockImplementation((cmd) => {
      if (cmd === "get_current_user") return Promise.resolve({ id: "u1", nickname: "A" });
      return Promise.resolve("");
    });

    setupFetchMock({
      pending: [{ fromUserId: "X" }, { fromUserId: "Y" }],
    });

    const router = makeRouter();
    await router.push("/chat/social");
    await router.isReady();

    const wrapper = mount(SocialHub, {
      global: { plugins: [router] },
    });
    await flushPromises();

    const pills = wrapper.findAll(".stat-pill strong");
    expect(pills[1].text()).toBe("2");
  });
});
