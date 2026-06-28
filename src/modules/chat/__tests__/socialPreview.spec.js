import { beforeEach, describe, expect, it, vi } from "vitest";
import { eventBus } from "@/shared/eventBus.js";
import {
  clearSocialUnread,
  getSocialContactKey,
  getSocialPreview,
  SOCIAL_PREVIEW_UPDATED,
  updateSocialPreview,
} from "@/modules/chat/socialPreview.js";

describe("socialPreview", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it("maps contact types to stable preview keys", () => {
    expect(getSocialContactKey("social-public")).toBe("public");
    expect(getSocialContactKey("social-direct", "Bob")).toBe("direct:Bob");
  });

  it("stores last message preview and marks incoming messages unread", () => {
    updateSocialPreview({
      contactKey: "public",
      text: "Hello room",
      createdAt: "2026-06-01T12:00:00Z",
      senderId: "Bob",
      currentUserId: "Alice",
    });

    const preview = getSocialPreview("public");
    expect(preview.text).toBe("Hello room");
    expect(preview.unread).toBe(true);
  });

  it("does not mark own messages unread", () => {
    updateSocialPreview({
      contactKey: "direct:Bob",
      text: "My message",
      createdAt: "2026-06-01T12:00:00Z",
      senderId: "Alice",
      currentUserId: "Alice",
    });

    expect(getSocialPreview("direct:Bob").unread).toBe(false);
  });

  it("clears unread state for an opened conversation", () => {
    updateSocialPreview({
      contactKey: "direct:Bob",
      text: "Ping",
      createdAt: "2026-06-01T12:00:00Z",
      senderId: "Bob",
      currentUserId: "Alice",
    });

    clearSocialUnread("direct:Bob");
    expect(getSocialPreview("direct:Bob").unread).toBe(false);
  });

  it("emits preview updates through the event bus", () => {
    const handler = vi.fn();
    eventBus.on(SOCIAL_PREVIEW_UPDATED, handler);

    updateSocialPreview({
      contactKey: "public",
      text: "Ping",
      createdAt: "2026-06-01T12:00:00Z",
      senderId: "Bob",
      currentUserId: "Alice",
    });

    expect(handler).toHaveBeenCalledWith({ contactKey: "public", unread: true });
  });
});