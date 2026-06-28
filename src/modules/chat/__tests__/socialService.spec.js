import { beforeEach, describe, expect, it, vi } from "vitest";
import * as api from "@/shared/api.js";
import {
  acceptFriendRequest,
  createSocialSocket,
  getSocialConfig,
  getSocialFriendships,
  getSocialStats,
  getSocialUserId,
  getPendingFriendRequests,
  pullOfflineMessages,
  registerSocialUser,
  sendFriendRequest,
  shouldDisconnectSocialSocketOnHidden,
} from "@/modules/chat/socialService.js";

describe("socialService", () => {
  let mockInvoke;
  let fetchMock;

  beforeEach(() => {
    mockInvoke = vi.fn();
    api.__setInvoke(mockInvoke);
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  describe("getSocialConfig", () => {
    it("returns the built-in production endpoints", async () => {
      const config = await getSocialConfig();
      expect(config).toEqual({
        apiBaseUrl: "https://amiga-chat-social.wh1018.workers.dev",
        wsBaseUrl: "wss://amiga-chat-social.wh1018.workers.dev",
      });
    });
  });

  describe("getSocialUserId", () => {
    it("uses nickname as the social user id", async () => {
      mockInvoke.mockImplementation((cmd) => {
        if (cmd === "get_current_user") {
          return Promise.resolve({ id: "uuid-1", nickname: "Alice" });
        }
        return Promise.resolve(null);
      });
      await expect(getSocialUserId()).resolves.toBe("Alice");
    });

    it("falls back to user id when nickname is empty", async () => {
      mockInvoke.mockImplementation((cmd) => {
        if (cmd === "get_current_user") {
          return Promise.resolve({ id: "uuid-2", nickname: "" });
        }
        return Promise.resolve(null);
      });
      await expect(getSocialUserId()).resolves.toBe("uuid-2");
    });

    it("falls back to user id when nickname is whitespace-only", async () => {
      mockInvoke.mockImplementation((cmd) => {
        if (cmd === "get_current_user") {
          return Promise.resolve({ id: "uuid-3", nickname: "   " });
        }
        return Promise.resolve(null);
      });
      await expect(getSocialUserId()).resolves.toBe("uuid-3");
    });

    it("falls back to 'learner' on failure", async () => {
      mockInvoke.mockRejectedValue(new Error("no user"));
      await expect(getSocialUserId()).resolves.toBe("learner");
    });
  });

  describe("shouldDisconnectSocialSocketOnHidden", () => {
    it("returns false for desktop browser", () => {
      expect(shouldDisconnectSocialSocketOnHidden("Mozilla/5.0 (Windows NT 10.0; Win64; x64)")).toBe(false);
    });

    it("returns true for Android mobile", () => {
      expect(shouldDisconnectSocialSocketOnHidden("Mozilla/5.0 (Linux; Android 15; Pixel) Mobile")).toBe(true);
    });

    it("returns true for iPhone", () => {
      expect(shouldDisconnectSocialSocketOnHidden("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Mobile")).toBe(true);
    });

    it("returns true for iPad", () => {
      expect(shouldDisconnectSocialSocketOnHidden("Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) Mobile")).toBe(true);
    });
  });

  describe("createSocialSocket", () => {
    it("creates a websocket against the /ws endpoint with correct URL for direct mode", () => {
      const sentUrls = [];
      class FakeSocket {
        constructor(url) { sentUrls.push(String(url)); }
        addEventListener() {}
      }
      vi.stubGlobal("WebSocket", FakeSocket);

      createSocialSocket(
        { wsBaseUrl: "wss://chat.example.com" },
        { userId: "Alice", mode: "direct", peerId: "Bob" },
      );

      expect(sentUrls[0]).toBe("wss://chat.example.com/ws?userId=Alice&mode=direct&peerId=Bob");
    });

    it("creates a websocket for public mode without peerId", () => {
      const sentUrls = [];
      class FakeSocket {
        constructor(url) { sentUrls.push(String(url)); }
        addEventListener() {}
      }
      vi.stubGlobal("WebSocket", FakeSocket);

      createSocialSocket(
        { wsBaseUrl: "wss://chat.example.com" },
        { userId: "Alice", mode: "public" },
      );

      expect(sentUrls[0]).toBe("wss://chat.example.com/ws?userId=Alice&mode=public");
    });

    it("throws if wsBaseUrl is not configured", () => {
      expect(() => createSocialSocket(
        { wsBaseUrl: "" },
        { userId: "Alice", mode: "public" },
      )).toThrow("social-ws-not-configured");
    });

    it("wires up onOpen callback", () => {
      let recordedOpen = null;
      class FakeSocket {
        addEventListener(event, cb) {
          if (event === "open") recordedOpen = cb;
        }
      }
      vi.stubGlobal("WebSocket", FakeSocket);

      const onOpen = vi.fn();
      createSocialSocket({ wsBaseUrl: "wss://x" }, { userId: "U", mode: "public", onOpen });
      recordedOpen();
      expect(onOpen).toHaveBeenCalled();
    });

    it("wires up onClose callback", () => {
      let recordedClose = null;
      class FakeSocket {
        addEventListener(event, cb) {
          if (event === "close") recordedClose = cb;
        }
      }
      vi.stubGlobal("WebSocket", FakeSocket);

      const onClose = vi.fn();
      createSocialSocket({ wsBaseUrl: "wss://x" }, { userId: "U", mode: "public", onClose });
      recordedClose();
      expect(onClose).toHaveBeenCalled();
    });

    it("wires up onError callback", () => {
      let recordedError = null;
      class FakeSocket {
        addEventListener(event, cb) {
          if (event === "error") recordedError = cb;
        }
      }
      vi.stubGlobal("WebSocket", FakeSocket);

      const onError = vi.fn();
      createSocialSocket({ wsBaseUrl: "wss://x" }, { userId: "U", mode: "public", onError });
      recordedError(new Event("error"));
      expect(onError).toHaveBeenCalled();
    });

    it("parses JSON message and calls onMessage", () => {
      let recordedMessage = null;
      class FakeSocket {
        addEventListener(event, cb) {
          if (event === "message") recordedMessage = cb;
        }
      }
      vi.stubGlobal("WebSocket", FakeSocket);

      const onMessage = vi.fn();
      createSocialSocket({ wsBaseUrl: "wss://x" }, { userId: "U", mode: "public", onMessage });
      recordedMessage({ data: JSON.stringify({ type: "message", text: "hi" }) });
      expect(onMessage).toHaveBeenCalledWith({ type: "message", text: "hi" });
    });

    it("falls back to raw string on non-JSON message", () => {
      let recordedMessage = null;
      class FakeSocket {
        addEventListener(event, cb) {
          if (event === "message") recordedMessage = cb;
        }
      }
      vi.stubGlobal("WebSocket", FakeSocket);

      const onMessage = vi.fn();
      createSocialSocket({ wsBaseUrl: "wss://x" }, { userId: "U", mode: "public", onMessage });
      recordedMessage({ data: "plain text" });
      expect(onMessage).toHaveBeenCalledWith({ type: "system", text: "plain text" });
    });

    it("converts https:// to wss:// for ws base URL", () => {
      const urls = [];
      class FakeSocket {
        constructor(url) { urls.push(String(url)); }
        addEventListener() {}
      }
      vi.stubGlobal("WebSocket", FakeSocket);

      const config = { apiBaseUrl: "https://chat.example.com", wsBaseUrl: "wss://chat.example.com" };
      createSocialSocket(config, { userId: "U", mode: "public" });
      expect(urls[0]).toBe("wss://chat.example.com/ws?userId=U&mode=public");
    });

    it("converts http:// to ws:// for ws base URL", () => {
      const urls = [];
      class FakeSocket {
        constructor(url) { urls.push(String(url)); }
        addEventListener() {}
      }
      vi.stubGlobal("WebSocket", FakeSocket);

      createSocialSocket(
        { wsBaseUrl: "ws://chat.example.com" },
        { userId: "U", mode: "public" },
      );
      expect(urls[0]).toBe("ws://chat.example.com/ws?userId=U&mode=public");
    });
  });

  describe("requestJson helper (tested through public API)", () => {
    it("registerSocialUser sends POST to /api/users/register", async () => {
      fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200 }));

      const config = { apiBaseUrl: "https://social.example.com", wsBaseUrl: "wss://social.example.com" };
      await registerSocialUser(config, { id: "u1", avatar: "🙂", native_language: "en" });

      expect(fetchMock).toHaveBeenCalledWith(
        "https://social.example.com/api/users/register",
        expect.objectContaining({
          method: "POST",
          headers: expect.objectContaining({ "Content-Type": "application/json" }),
        }),
      );
      const body = JSON.parse(fetchMock.mock.calls[0][1].body);
      expect(body).toEqual({ id: "u1", avatar: "🙂", nativeLanguage: "en" });
    });

    it("registerSocialUser handles empty avatar and language", async () => {
      fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200 }));

      const config = { apiBaseUrl: "https://social.example.com", wsBaseUrl: "wss://social.example.com" };
      await registerSocialUser(config, { id: "u2" });

      const body = JSON.parse(fetchMock.mock.calls[0][1].body);
      expect(body).toEqual({ id: "u2", avatar: "", nativeLanguage: "" });
    });

    it("getSocialStats fetches /api/stats", async () => {
      fetchMock.mockResolvedValueOnce(
        new Response(JSON.stringify({ userCount: 42 }), { status: 200 }),
      );

      const config = { apiBaseUrl: "https://social.example.com", wsBaseUrl: "wss://social.example.com" };
      const result = await getSocialStats(config);
      expect(result).toEqual({ userCount: 42 });
      expect(fetchMock).toHaveBeenCalledWith(
        "https://social.example.com/api/stats",
        expect.objectContaining({ headers: expect.objectContaining({ "Content-Type": "application/json" }) }),
      );
    });

    it("getSocialFriendships fetches /api/friends with userId", async () => {
      fetchMock.mockResolvedValueOnce(
        new Response(JSON.stringify({ items: [{ friendUserId: "Bob" }] }), { status: 200 }),
      );

      const config = { apiBaseUrl: "https://social.example.com", wsBaseUrl: "wss://social.example.com" };
      const result = await getSocialFriendships(config, "Alice");
      expect(result.items).toHaveLength(1);
      expect(fetchMock).toHaveBeenCalledWith(
        "https://social.example.com/api/friends?userId=Alice",
        expect.any(Object),
      );
    });

    it("getPendingFriendRequests fetches /api/friends/pending with userId", async () => {
      fetchMock.mockResolvedValueOnce(
        new Response(JSON.stringify({ items: [{ fromUserId: "Bob" }] }), { status: 200 }),
      );

      const config = { apiBaseUrl: "https://social.example.com", wsBaseUrl: "wss://social.example.com" };
      const result = await getPendingFriendRequests(config, "Alice");
      expect(result.items).toHaveLength(1);
      expect(fetchMock).toHaveBeenCalledWith(
        "https://social.example.com/api/friends/pending?userId=Alice",
        expect.any(Object),
      );
    });

    it("sendFriendRequest posts to /api/friends/request", async () => {
      fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200 }));

      const config = { apiBaseUrl: "https://social.example.com", wsBaseUrl: "wss://social.example.com" };
      await sendFriendRequest(config, "Alice", "Bob");

      expect(fetchMock).toHaveBeenCalledWith(
        "https://social.example.com/api/friends/request",
        expect.objectContaining({ method: "POST" }),
      );
      const body = JSON.parse(fetchMock.mock.calls[0][1].body);
      expect(body).toEqual({ fromUserId: "Alice", toUserId: "Bob" });
    });

    it("acceptFriendRequest posts to /api/friends/accept", async () => {
      fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200 }));

      const config = { apiBaseUrl: "https://social.example.com", wsBaseUrl: "wss://social.example.com" };
      await acceptFriendRequest(config, "Alice", "Bob");

      expect(fetchMock).toHaveBeenCalledWith(
        "https://social.example.com/api/friends/accept",
        expect.objectContaining({ method: "POST" }),
      );
      const body = JSON.parse(fetchMock.mock.calls[0][1].body);
      expect(body).toEqual({ userId: "Alice", fromUserId: "Bob" });
    });

    it("pullOfflineMessages fetches /api/messages/offline with userId", async () => {
      fetchMock.mockResolvedValueOnce(
        new Response(JSON.stringify({ items: [{ id: "m1", content: "hi" }] }), { status: 200 }),
      );

      const config = { apiBaseUrl: "https://social.example.com", wsBaseUrl: "wss://social.example.com" };
      const result = await pullOfflineMessages(config, "Alice");

      expect(result.items).toHaveLength(1);
      expect(fetchMock).toHaveBeenCalledWith(
        "https://social.example.com/api/messages/offline?userId=Alice",
        expect.any(Object),
      );
    });

    it("throws on HTTP error with server error message", async () => {
      fetchMock.mockResolvedValueOnce(
        new Response(JSON.stringify({ error: "user not found" }), { status: 404 }),
      );

      const config = { apiBaseUrl: "https://social.example.com", wsBaseUrl: "wss://social.example.com" };
      await expect(getSocialStats(config)).rejects.toThrow("user not found");
    });

    it("throws with HTTP status when no error body", async () => {
      fetchMock.mockResolvedValueOnce(new Response("", { status: 500 }));

      const config = { apiBaseUrl: "https://social.example.com", wsBaseUrl: "wss://social.example.com" };
      await expect(getSocialStats(config)).rejects.toThrow("HTTP 500");
    });

    it("returns null for 204 No Content", async () => {
      fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));

      const config = { apiBaseUrl: "https://social.example.com", wsBaseUrl: "wss://social.example.com" };
      const result = await getSocialStats(config);
      expect(result).toBeNull();
    });

    it("throws when apiBaseUrl is empty", async () => {
      const config = { apiBaseUrl: "", wsBaseUrl: "" };
      await expect(sendFriendRequest(config, "A", "B")).rejects.toThrow("social-api-not-configured");
    });

    it("trims trailing slashes from apiBaseUrl", async () => {
      fetchMock.mockResolvedValueOnce(
        new Response(JSON.stringify({ userCount: 1 }), { status: 200 }),
      );

      const config = { apiBaseUrl: "https://social.example.com/", wsBaseUrl: "wss://social.example.com/" };
      await getSocialStats(config);
      expect(fetchMock).toHaveBeenCalledWith(
        "https://social.example.com/api/stats",
        expect.any(Object),
      );
    });
  });

  describe("URL conversion to WebSocket base", () => {
    it("converts https:// to wss://", async () => {
      const config = await (async () => {
        const { getSocialConfig } = await import("@/modules/chat/socialService.js");
        return getSocialConfig();
      })();
      expect(config.wsBaseUrl).toMatch(/^wss:/);
    });

    it("handles already-wss:// URLs", () => {
      const sentUrls = [];
      class FakeSocket {
        constructor(url) { sentUrls.push(String(url)); }
        addEventListener() {}
      }
      vi.stubGlobal("WebSocket", FakeSocket);

      createSocialSocket(
        { wsBaseUrl: "wss://already-wss.example.com" },
        { userId: "U", mode: "public" },
      );
      expect(sentUrls[0]).toContain("wss://already-wss.example.com/ws");
    });
  });
});
