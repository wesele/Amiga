import { beforeEach, describe, expect, it, vi } from "vitest";
import { eventBus } from "@/shared/eventBus.js";
import {
  clearSocialPreview,
  clearSocialUnread,
  getSocialContactKey,
  getSocialPreview,
  getTotalUnreadCount,
  SOCIAL_PREVIEW_UPDATED,
  SOCIAL_TOTAL_UNREAD_CHANGED,
  updateSocialPreview,
} from "@/modules/chat/social/socialPreview.js";

describe("socialPreview", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it("maps contact types to stable preview keys", () => {
    expect(getSocialContactKey("social-public")).toBe("public");
    expect(getSocialContactKey("social-direct", "Bob")).toBe("direct:Bob");
  });

  it("stores last message preview and increments unread count for incoming messages", () => {
    updateSocialPreview({
      contactKey: "public",
      text: "Hello room",
      createdAt: "2026-06-01T12:00:00Z",
      senderId: "Bob",
      currentUserId: "Alice",
    });

    const preview = getSocialPreview("public");
    expect(preview.text).toBe("Hello room");
    expect(preview.unread).toBe(1);
  });

  it("increments unread count on multiple incoming messages", () => {
    const opts = {
      contactKey: "public",
      senderId: "Bob",
      currentUserId: "Alice",
    };
    updateSocialPreview({ ...opts, text: "First", createdAt: "2026-06-01T12:00:00Z" });
    updateSocialPreview({ ...opts, text: "Second", createdAt: "2026-06-01T12:01:00Z" });
    updateSocialPreview({ ...opts, text: "Third", createdAt: "2026-06-01T12:02:00Z" });

    expect(getSocialPreview("public").unread).toBe(3);
  });

  it("does not increment unread count for own messages", () => {
    const opts = {
      contactKey: "direct:Bob",
      senderId: "Alice",
      currentUserId: "Alice",
    };
    updateSocialPreview({ ...opts, text: "First", createdAt: "2026-06-01T12:00:00Z" });
    updateSocialPreview({ ...opts, text: "Second", createdAt: "2026-06-01T12:01:00Z" });

    expect(getSocialPreview("direct:Bob").unread).toBe(0);
  });

  it("resets unread count when conversation is opened", () => {
    updateSocialPreview({
      contactKey: "direct:Bob",
      text: "Ping",
      createdAt: "2026-06-01T12:00:00Z",
      senderId: "Bob",
      currentUserId: "Alice",
    });

    clearSocialUnread("direct:Bob");
    expect(getSocialPreview("direct:Bob").unread).toBe(0);
  });

  it("calculates total unread across all conversations", () => {
    updateSocialPreview({
      contactKey: "public",
      text: "Hello",
      createdAt: "2026-06-01T12:00:00Z",
      senderId: "Bob",
      currentUserId: "Alice",
    });
    updateSocialPreview({
      contactKey: "public",
      text: "World",
      createdAt: "2026-06-01T12:01:00Z",
      senderId: "Bob",
      currentUserId: "Alice",
    });
    updateSocialPreview({
      contactKey: "direct:Charlie",
      text: "Hey",
      createdAt: "2026-06-01T12:00:00Z",
      senderId: "Charlie",
      currentUserId: "Alice",
    });

    expect(getTotalUnreadCount()).toBe(3);
  });

  it("emits preview updates through the event bus with unread count", () => {
    const handler = vi.fn();
    eventBus.on(SOCIAL_PREVIEW_UPDATED, handler);

    updateSocialPreview({
      contactKey: "public",
      text: "Ping",
      createdAt: "2026-06-01T12:00:00Z",
      senderId: "Bob",
      currentUserId: "Alice",
    });

    expect(handler).toHaveBeenCalledWith({
      contactKey: "public",
      unread: 1,
      unreadCount: 1,
    });
  });

  it("emits total unread count changes", () => {
    const handler = vi.fn();
    eventBus.on(SOCIAL_TOTAL_UNREAD_CHANGED, handler);

    updateSocialPreview({
      contactKey: "public",
      text: "Ping",
      createdAt: "2026-06-01T12:00:00Z",
      senderId: "Bob",
      currentUserId: "Alice",
    });

    expect(handler).toHaveBeenCalledWith(1);
  });

  it("emits total unread count when clearing", () => {
    updateSocialPreview({
      contactKey: "public",
      text: "Ping",
      createdAt: "2026-06-01T12:00:00Z",
      senderId: "Bob",
      currentUserId: "Alice",
    });

    const handler = vi.fn();
    eventBus.on(SOCIAL_TOTAL_UNREAD_CHANGED, handler);
    clearSocialUnread("public");

    expect(handler).toHaveBeenCalledWith(0);
  });
});
