import { beforeEach, describe, expect, it, vi } from "vitest";
import * as api from "@/shared/api.js";
import {
  createSocialSocket,
  getSocialConfig,
  getSocialUserId,
} from "@/modules/chat/socialService.js";

describe("socialService", () => {
  let mockInvoke;

  beforeEach(() => {
    mockInvoke = vi.fn();
    api.__setInvoke(mockInvoke);
  });

  it("returns the built-in production endpoints", async () => {
    await expect(getSocialConfig()).resolves.toEqual({
      apiBaseUrl: "https://amiga-chat-social.wh1018.workers.dev",
      wsBaseUrl: "wss://amiga-chat-social.wh1018.workers.dev",
    });
  });

  it("uses nickname as the social user id", async () => {
    mockInvoke.mockImplementation((cmd) => {
      if (cmd === "get_current_user") {
        return Promise.resolve({ id: "uuid-1", nickname: "Alice" });
      }
      return Promise.resolve(null);
    });

    await expect(getSocialUserId()).resolves.toBe("Alice");
  });

  it("creates a websocket against the /ws endpoint", () => {
    const sentUrls = [];
    class FakeSocket {
      constructor(url) {
        sentUrls.push(String(url));
      }
      addEventListener() {}
    }
    vi.stubGlobal("WebSocket", FakeSocket);

    createSocialSocket(
      { wsBaseUrl: "wss://chat.example.com" },
      { userId: "Alice", mode: "direct", peerId: "Bob" },
    );

    expect(sentUrls[0]).toBe("wss://chat.example.com/ws?userId=Alice&mode=direct&peerId=Bob");
  });
});
