import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { startSocialInboxListener } from "@/modules/chat/social/socialInbox.js";
import { getSocialMessages } from "@/modules/chat/social/socialMessages.js";
import { getSocialPreview, setActiveSocialContact } from "@/modules/chat/social/socialPreview.js";

class FakeWebSocket {
  static OPEN = 1;
  static CLOSED = 3;

  constructor(url) {
    this.url = String(url);
    this.readyState = 1;
    this._listeners = {};
    FakeWebSocket.instances.push(this);
  }

  addEventListener(event, cb) {
    if (!this._listeners[event]) this._listeners[event] = [];
    this._listeners[event].push(cb);
  }

  removeEventListener() {}

  close() {
    this.readyState = 3;
    for (const cb of this._listeners.close || []) cb();
  }

  emitMessage(data) {
    const event = { data: JSON.stringify(data) };
    for (const cb of this._listeners.message || []) cb(event);
  }
}
FakeWebSocket.instances = [];

describe("socialInbox", () => {
  let stopListener;

  beforeEach(() => {
    FakeWebSocket.instances = [];
    vi.stubGlobal("WebSocket", FakeWebSocket);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ items: [] }), { status: 200 })));
    vi.stubGlobal("localStorage", {
      _data: {},
      getItem(key) { return this._data[key] ?? null; },
      setItem(key, value) { this._data[key] = String(value); },
      removeItem(key) { delete this._data[key]; },
      clear() { this._data = {}; },
    });
    Object.defineProperty(navigator, "userAgent", {
      value: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Desktop",
      configurable: true,
    });
  });

  afterEach(() => {
    stopListener?.();
    stopListener = null;
    setActiveSocialContact(null);
    vi.unstubAllGlobals();
  });

  it("stores public group messages from friends while the inbox listener is active", async () => {
    stopListener = startSocialInboxListener({
      userId: "Alice",
      friends: [{ friendUserId: "Bob" }],
    });

    await vi.waitFor(() => {
      expect(FakeWebSocket.instances.some((socket) => socket.url.includes("mode=public"))).toBe(true);
    });
    const publicSocket = FakeWebSocket.instances.find((socket) => socket.url.includes("mode=public"));

    publicSocket.emitMessage({
      type: "message",
      mode: "public",
      senderId: "Bob",
      text: "hello group",
      createdAt: "2026-07-05T10:00:00.000Z",
    });

    expect(getSocialMessages("public")).toHaveLength(1);
    expect(getSocialMessages("public")[0].text).toBe("hello group");
    expect(getSocialPreview("public")?.text).toBe("hello group");
    expect(getSocialPreview("public")?.unread).toBe(1);
  });

  it("does not increment unread while the public group conversation is open", async () => {
    setActiveSocialContact("public");
    stopListener = startSocialInboxListener({
      userId: "Alice",
      friends: [{ friendUserId: "Bob" }],
    });

    await vi.waitFor(() => {
      expect(FakeWebSocket.instances.some((socket) => socket.url.includes("mode=public"))).toBe(true);
    });
    const publicSocket = FakeWebSocket.instances.find((socket) => socket.url.includes("mode=public"));

    publicSocket.emitMessage({
      type: "message",
      mode: "public",
      senderId: "Bob",
      text: "seen live",
      createdAt: "2026-07-05T10:02:00.000Z",
    });

    expect(getSocialPreview("public")?.text).toBe("seen live");
    expect(getSocialPreview("public")?.unread).toBe(0);
  });

  it("does not double-count unread when the same public message is delivered twice", async () => {
    stopListener = startSocialInboxListener({
      userId: "Alice",
      friends: [{ friendUserId: "Bob" }],
    });

    await vi.waitFor(() => {
      expect(FakeWebSocket.instances.some((socket) => socket.url.includes("mode=public"))).toBe(true);
    });
    const publicSocket = FakeWebSocket.instances.find((socket) => socket.url.includes("mode=public"));

    const payload = {
      type: "message",
      mode: "public",
      id: "dup-1",
      senderId: "Bob",
      text: "once only",
      createdAt: "2026-07-05T10:03:00.000Z",
    };
    publicSocket.emitMessage(payload);
    publicSocket.emitMessage(payload);

    expect(getSocialPreview("public")?.unread).toBe(1);
  });

  it("stores direct messages delivered on the user relay socket", async () => {
    stopListener = startSocialInboxListener({
      userId: "Alice",
      friends: [{ friendUserId: "Bob" }],
    });

    await vi.waitFor(() => {
      expect(FakeWebSocket.instances.some((socket) => socket.url.includes("mode=direct"))).toBe(true);
    });
    const directSocket = FakeWebSocket.instances.find((socket) => socket.url.includes("mode=direct"));

    directSocket.emitMessage({
      type: "message",
      mode: "direct",
      senderId: "Bob",
      text: "hi alice",
      createdAt: "2026-07-05T10:01:00.000Z",
    });

    expect(getSocialMessages("direct:Bob")).toHaveLength(1);
    expect(getSocialPreview("direct:Bob")?.unread).toBe(1);
  });
});
