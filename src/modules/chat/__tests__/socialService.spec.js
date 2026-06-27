import { beforeEach, describe, expect, it, vi } from "vitest";
import * as api from "@/shared/api.js";
import {
  createSocialSocket,
  getSocialConfig,
  getSocialUserId,
  saveSocialConfig,
} from "@/modules/chat/socialService.js";

describe("socialService", () => {
  let mockInvoke;

  beforeEach(() => {
    mockInvoke = vi.fn();
    api.__setInvoke(mockInvoke);
  });

  it("loads saved social config and normalizes the websocket url", async () => {
    mockInvoke.mockImplementation((cmd, args) => {
      if (cmd === "get_setting_cmd" && args.key === "social_api_base_url") {
        return Promise.resolve("https://chat.example.com/");
      }
      if (cmd === "get_setting_cmd" && args.key === "social_ws_base_url") {
        return Promise.resolve("https://socket.example.com/");
      }
      return Promise.resolve("");
    });

    await expect(getSocialConfig()).resolves.toEqual({
      apiBaseUrl: "https://chat.example.com",
      wsBaseUrl: "wss://socket.example.com",
    });
  });

  it("saves trimmed config values", async () => {
    mockInvoke.mockResolvedValue("");

    await saveSocialConfig({
      apiBaseUrl: "https://chat.example.com/",
      wsBaseUrl: "http://socket.example.com/",
    });

    expect(mockInvoke).toHaveBeenCalledWith("save_setting_cmd", {
      key: "social_api_base_url",
      value: "https://chat.example.com",
    });
    expect(mockInvoke).toHaveBeenCalledWith("save_setting_cmd", {
      key: "social_ws_base_url",
      value: "ws://socket.example.com",
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
