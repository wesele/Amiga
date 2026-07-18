import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMemoryHistory, createRouter } from "vue-router";
import * as api from "@/shared/api.js";
import { openAiContact } from "@/modules/ai-chat/openAiContact.js";

function makeRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: "/chat/:sessionId", name: "chat-session", component: { template: "<div/>" } },
      {
        path: "/learn/translator/:sessionId",
        name: "learn-translator",
        component: { template: "<div/>" },
      },
    ],
  });
}

describe("openAiContact", () => {
  let mockInvoke;

  beforeEach(() => {
    mockInvoke = vi.fn();
    api.__setInvoke(mockInvoke);
  });

  it("creates a session and navigates to chat-session by default", async () => {
    mockInvoke.mockImplementation((cmd) => {
      if (cmd === "get_chat_sessions_cmd") return Promise.resolve([]);
      if (cmd === "get_current_user") return Promise.resolve({ id: "u1" });
      if (cmd === "create_chat_session_cmd") return Promise.resolve("new-sess");
      return Promise.resolve(null);
    });

    const router = makeRouter();
    const pushSpy = vi.spyOn(router, "push");

    const ok = await openAiContact(
      router,
      { name: "翻译", contactType: "translator" },
      { targetLang: "es" },
    );

    expect(ok).toBe(true);
    expect(pushSpy).toHaveBeenCalledWith({
      name: "chat-session",
      params: { sessionId: "new-sess" },
      query: {},
    });
  });

  it("reuses an existing session without creating a new one", async () => {
    mockInvoke.mockImplementation((cmd) => {
      if (cmd === "get_chat_sessions_cmd") {
        return Promise.resolve([{ id: "existing", contact_type: "translator" }]);
      }
      return Promise.resolve(null);
    });

    const router = makeRouter();
    const pushSpy = vi.spyOn(router, "push");

    await openAiContact(
      router,
      { name: "翻译", contactType: "translator" },
      { targetLang: "es" },
    );

    expect(mockInvoke).not.toHaveBeenCalledWith("create_chat_session_cmd", expect.anything());
    expect(pushSpy).toHaveBeenCalledWith({
      name: "chat-session",
      params: { sessionId: "existing" },
      query: {},
    });
  });

  it("supports learn-translator route name", async () => {
    mockInvoke.mockImplementation((cmd) => {
      if (cmd === "get_chat_sessions_cmd") return Promise.resolve([]);
      if (cmd === "get_current_user") return Promise.resolve({ id: "u1" });
      if (cmd === "create_chat_session_cmd") return Promise.resolve("learn-sess");
      return Promise.resolve(null);
    });

    const router = makeRouter();
    const pushSpy = vi.spyOn(router, "push");

    await openAiContact(
      router,
      { name: "翻译", contactType: "translator" },
      { routeName: "learn-translator", targetLang: "es" },
    );

    expect(pushSpy).toHaveBeenCalledWith({
      name: "learn-translator",
      params: { sessionId: "learn-sess" },
      query: {},
    });
  });
});