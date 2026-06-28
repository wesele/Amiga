import { beforeEach, describe, expect, it } from "vitest";
import {
  appendSocialMessage,
  clearSocialMessages,
  getSocialMessages,
  mergeSocialMessages,
} from "@/modules/chat/socialMessages.js";

describe("socialMessages", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("persists and reloads messages for a conversation", () => {
    appendSocialMessage("public", {
      id: "m1",
      senderId: "Bob",
      text: "Hello",
      createdAt: "2026-06-01T12:00:00Z",
    });

    expect(getSocialMessages("public")).toHaveLength(1);
    expect(getSocialMessages("public")[0].text).toBe("Hello");
  });

  it("dedupes merged messages by id", () => {
    mergeSocialMessages("direct:Bob", [{
      id: "m1",
      senderId: "Bob",
      text: "Hi",
      createdAt: "2026-06-01T12:00:00Z",
    }]);
    mergeSocialMessages("direct:Bob", [{
      id: "m1",
      senderId: "Bob",
      text: "Hi",
      createdAt: "2026-06-01T12:00:00Z",
    }]);

    expect(getSocialMessages("direct:Bob")).toHaveLength(1);
  });

  it("clears cached messages on delete", () => {
    appendSocialMessage("public", {
      id: "m1",
      senderId: "Bob",
      text: "Hello",
      createdAt: "2026-06-01T12:00:00Z",
    });

    clearSocialMessages("public");
    expect(getSocialMessages("public")).toHaveLength(0);
  });
});