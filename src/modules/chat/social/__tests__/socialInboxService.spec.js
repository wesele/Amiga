import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as api from "@/shared/api.js";
import { eventBus } from "@/shared/eventBus.js";
import {
  bootSocialInbox,
  getInboxFriends,
  getInboxUserId,
  isSocialInboxBooted,
  refreshSocialInboxFriends,
  SOCIAL_FRIENDS_UPDATED,
  SOCIAL_INBOX_BOOTED,
  SOCIAL_INBOX_STOPPED,
  stopSocialInbox,
  _resetSocialInboxServiceForTests,
} from "@/modules/chat/social/socialInboxService.js";

class FakeWebSocket {
  static OPEN = 1;
  static CLOSED = 3;
  constructor() {
    this.readyState = 1;
    this.sentFrames = [];
    this._listeners = {};
    FakeWebSocket.instances.push(this);
  }
  send(data) {
    this.sentFrames.push(data);
  }
  close() {
    this.readyState = 3;
  }
  addEventListener(event, cb) {
    if (!this._listeners[event]) this._listeners[event] = [];
    this._listeners[event].push(cb);
  }
  removeEventListener() {}
}
FakeWebSocket.instances = [];

function setupFetchMock({ registerOk = true, friends = [], offline = [] } = {}) {
  const fetchMock = vi.fn().mockImplementation((url, init = {}) => {
    const target = String(url);
    if (target.includes("/api/users/register")) {
      return Promise.resolve(new Response(JSON.stringify({ ok: registerOk }), { status: 200 }));
    }
    if (target.includes("/api/friends?")) {
      return Promise.resolve(new Response(JSON.stringify({ items: friends }), { status: 200 }));
    }
    if (target.includes("/api/messages/offline")) {
      return Promise.resolve(new Response(JSON.stringify({ items: offline }), { status: 200 }));
    }
    return Promise.resolve(new Response(JSON.stringify({}), { status: 200 }));
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function stubDesktopUserAgent() {
  Object.defineProperty(navigator, "userAgent", {
    value: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Desktop",
    configurable: true,
  });
}

function stubMobileUserAgent() {
  Object.defineProperty(navigator, "userAgent", {
    value: "Mozilla/5.0 (Linux; Android 15; Pixel) Mobile",
    configurable: true,
  });
}

describe("socialInboxService", () => {
  let mockInvoke;

  beforeEach(() => {
    _resetSocialInboxServiceForTests();
    FakeWebSocket.instances = [];
    mockInvoke = vi.fn();
    api.__setInvoke(mockInvoke);
    mockInvoke.mockImplementation((cmd) => {
      if (cmd === "get_current_user") {
        return Promise.resolve({ id: "u1", nickname: "Alice" });
      }
      return Promise.resolve(null);
    });
    vi.stubGlobal("WebSocket", FakeWebSocket);
    stubDesktopUserAgent();
  });

  afterEach(() => {
    _resetSocialInboxServiceForTests();
    api.__resetInvoke();
    vi.unstubAllGlobals();
  });

  it("boots once, registers the user, fetches friends, and starts a public socket", async () => {
    const fetchMock = setupFetchMock({
      friends: [{ friendUserId: "Bob", friendAvatar: "🦊", updatedAt: "2026-01-02T00:00:00Z" }],
    });

    await bootSocialInbox();

    expect(isSocialInboxBooted()).toBe(true);
    expect(getInboxUserId()).toBe("Alice");
    expect(getInboxFriends()).toHaveLength(1);
    expect(getInboxFriends()[0].friendUserId).toBe("Bob");

    const urls = fetchMock.mock.calls.map((c) => String(c[0]));
    expect(urls.some((u) => u.includes("/api/users/register"))).toBe(true);
    expect(urls.some((u) => u.includes("/api/friends?"))).toBe(true);
    expect(urls.some((u) => u.includes("/api/messages/offline"))).toBe(true);

    // Public socket + one direct socket (for Bob).
    expect(FakeWebSocket.instances.length).toBe(2);
    const firstUrl = String(FakeWebSocket.instances[0]?.constructor?.name);
    expect(firstUrl).toBe("FakeWebSocket");
  });

  it("is idempotent: a second boot does not register or re-fetch friends", async () => {
    const fetchMock = setupFetchMock({ friends: [] });

    await bootSocialInbox();
    const callCountAfterFirst = fetchMock.mock.calls.length;
    const wsCountAfterFirst = FakeWebSocket.instances.length;

    await bootSocialInbox();
    await bootSocialInbox();

    expect(fetchMock.mock.calls.length).toBe(callCountAfterFirst);
    expect(FakeWebSocket.instances.length).toBe(wsCountAfterFirst);
  });

  it("emits SOCIAL_FRIENDS_UPDATED when friends are loaded", async () => {
    setupFetchMock({ friends: [{ friendUserId: "Bob", updatedAt: "2026-01-01T00:00:00Z" }] });
    const handler = vi.fn();
    eventBus.on(SOCIAL_FRIENDS_UPDATED, handler);

    await bootSocialInbox();

    expect(handler).toHaveBeenCalled();
    const lastPayload = handler.mock.calls.at(-1)[0];
    expect(lastPayload).toHaveLength(1);
    expect(lastPayload[0].friendUserId).toBe("Bob");
  });

  it("emits SOCIAL_INBOX_BOOTED on successful boot", async () => {
    setupFetchMock();
    const handler = vi.fn();
    eventBus.on(SOCIAL_INBOX_BOOTED, handler);

    await bootSocialInbox();

    expect(handler).toHaveBeenCalledWith({ userId: "Alice", friendCount: 0 });
  });

  it("refreshSocialInboxFriends is a no-op when the inbox has not booted", async () => {
    const fetchMock = setupFetchMock({ friends: [] });
    expect(isSocialInboxBooted()).toBe(false);

    await refreshSocialInboxFriends();

    expect(fetchMock).not.toHaveBeenCalled();
    expect(FakeWebSocket.instances).toHaveLength(0);
  });

  it("refreshSocialInboxFriends re-fetches friends and restarts the listener when booted", async () => {
    const fetchMock = setupFetchMock({ friends: [{ friendUserId: "Bob" }] });
    await bootSocialInbox();
    const socketsAfterBoot = FakeWebSocket.instances.length;
    const fetchCallsAfterBoot = fetchMock.mock.calls.length;

    fetchMock
      .mockImplementationOnce((url) => {
        const target = String(url);
        if (target.includes("/api/friends?")) {
          return Promise.resolve(new Response(JSON.stringify({
            items: [{ friendUserId: "Bob" }, { friendUserId: "Carol" }],
          }), { status: 200 }));
        }
        return Promise.resolve(new Response(JSON.stringify({}), { status: 200 }));
      })
      .mockImplementationOnce((url) => {
        const target = String(url);
        if (target.includes("/api/messages/offline")) {
          return Promise.resolve(new Response(JSON.stringify({ items: [] }), { status: 200 }));
        }
        return Promise.resolve(new Response(JSON.stringify({}), { status: 200 }));
      });

    await refreshSocialInboxFriends();

    expect(getInboxFriends()).toHaveLength(2);
    expect(fetchMock.mock.calls.length).toBeGreaterThan(fetchCallsAfterBoot);
    // Old sockets were closed via stop(); new public + 2 direct sockets created.
    expect(FakeWebSocket.instances.length).toBe(socketsAfterBoot + 3);
  });

  it("stopSocialInbox closes sockets and clears state", async () => {
    setupFetchMock({ friends: [{ friendUserId: "Bob" }] });
    await bootSocialInbox();
    const sockets = [...FakeWebSocket.instances];
    expect(sockets.length).toBeGreaterThan(0);

    const closeSpy = vi.spyOn(sockets[0], "close");
    stopSocialInbox();

    expect(closeSpy).toHaveBeenCalled();
    expect(isSocialInboxBooted()).toBe(false);
    expect(getInboxUserId()).toBe("");
    expect(getInboxFriends()).toHaveLength(0);
  });

  it("emits SOCIAL_INBOX_STOPPED on stop", async () => {
    setupFetchMock();
    await bootSocialInbox();

    const handler = vi.fn();
    eventBus.on(SOCIAL_INBOX_STOPPED, handler);

    stopSocialInbox();

    expect(handler).toHaveBeenCalledWith({ keepBootable: false });
  });

  it("on mobile, hiding the document stops the listener but allows re-boot on visible", async () => {
    stubMobileUserAgent();
    setupFetchMock({ friends: [{ friendUserId: "Bob" }] });
    await bootSocialInbox();
    expect(isSocialInboxBooted()).toBe(true);

    Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true });
    document.dispatchEvent(new Event("visibilitychange"));

    expect(isSocialInboxBooted()).toBe(false);

    Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true });
    setupFetchMock({ friends: [{ friendUserId: "Bob" }] });
    document.dispatchEvent(new Event("visibilitychange"));

    // Wait for the microtask queue to flush.
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));
    expect(isSocialInboxBooted()).toBe(true);
  });

  it("on desktop, hiding the document does not stop the listener", async () => {
    stubDesktopUserAgent();
    setupFetchMock({ friends: [] });
    await bootSocialInbox();
    expect(isSocialInboxBooted()).toBe(true);

    Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true });
    document.dispatchEvent(new Event("visibilitychange"));

    expect(isSocialInboxBooted()).toBe(true);
  });

  it("tolerates a network failure during boot without throwing", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));

    await expect(bootSocialInbox()).resolves.not.toThrow();
    // The boot path swallows friend-registration and friend-fetch
    // failures, so the listener still comes up and the inbox is
    // considered booted (just with an empty friend list).
  });
});
