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

  it("loads summary data and accepted friends", async () => {
    mockInvoke.mockImplementation((cmd) => {
      if (cmd === "get_current_user") {
        return Promise.resolve({ id: "uuid-1", nickname: "Alice", avatar: "🙂", native_language: "en" });
      }
      return Promise.resolve("");
    });

    fetchMock
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ userCount: 12 }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ items: [{ fromUserId: "Bob", createdAt: "2026-01-01T00:00:00Z" }] }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ items: [{ friendUserId: "Carol", updatedAt: "2026-01-02T00:00:00Z" }] }), { status: 200 }));

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
});
