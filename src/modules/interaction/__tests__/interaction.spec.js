import { describe, it, expect, vi } from "vitest";
import * as api from "@/shared/api.js";

describe("Interaction API", () => {
  let mockInvoke;

  beforeEach(() => {
    mockInvoke = vi.fn();
    api.__setInvoke(mockInvoke);
  });

  afterEach(() => {
    api.__resetInvoke();
  });

  it("chatCompletion calls invoke with correct params", () => {
    const msgs = [{ role: "user", content: "hello" }];
    api.chatCompletion(msgs, "zh", "es");
    expect(mockInvoke).toHaveBeenCalledWith("chat_completion_cmd", {
      messages: msgs,
      nativeLang: "zh",
      targetLang: "es",
    });
  });

  it("chatCompletionWithSession calls invoke with correct params", () => {
    api.chatCompletionWithSession("sess-1", "hola", "zh", "es");
    expect(mockInvoke).toHaveBeenCalledWith("chat_completion_with_session_cmd", {
      sessionId: "sess-1",
      message: "hola",
      nativeLang: "zh",
      targetLang: "es",
    });
  });

  it("createChatSession calls invoke with contactType", () => {
    api.createChatSession("user-1", "New Chat", "amiga");
    expect(mockInvoke).toHaveBeenCalledWith("create_chat_session_cmd", {
      userId: "user-1",
      title: "New Chat",
      contactType: "amiga",
    });
  });

  it("getChatSessions calls invoke", () => {
    api.getChatSessions();
    expect(mockInvoke).toHaveBeenCalledWith("get_chat_sessions_cmd");
  });

  it("deleteChatSession calls invoke", () => {
    api.deleteChatSession("sess-1");
    expect(mockInvoke).toHaveBeenCalledWith("delete_chat_session_cmd", {
      sessionId: "sess-1",
    });
  });

  it("getChatMessages calls invoke", () => {
    api.getChatMessages("sess-1", 30);
    expect(mockInvoke).toHaveBeenCalledWith("get_chat_messages_cmd", {
      sessionId: "sess-1",
      limit: 30,
    });
  });

  it("updateChatSessionTitle calls invoke", () => {
    api.updateChatSessionTitle("sess-1", "New Title");
    expect(mockInvoke).toHaveBeenCalledWith("update_chat_session_title_cmd", {
      sessionId: "sess-1",
      title: "New Title",
    });
  });

  it("getAmigaProfile calls invoke", () => {
    api.getAmigaProfile();
    expect(mockInvoke).toHaveBeenCalledWith("get_amiga_profile_cmd");
  });
});
