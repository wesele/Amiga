import { describe, it, expect, vi, beforeEach } from "vitest";
import { useWordLearning } from "../useWordLearning.js";
import * as api from "@/shared/api.js";

describe("useWordLearning", () => {
  let mockInvoke;

  beforeEach(() => {
    mockInvoke = vi.fn((cmd) => {
      if (cmd === "lookup_word_ids_cmd") return Promise.resolve([]);
      if (cmd === "add_discovered_word_cmd") return Promise.resolve(42);
      if (cmd === "update_word_mastery_cmd") return Promise.resolve(null);
      return Promise.resolve(null);
    });
    api.__setInvoke(mockInvoke);
  });

  it("persists unknown words with the configured source", async () => {
    const onWordMarkedUnknown = vi.fn();
    const learning = useWordLearning({
      getTargetLang: () => "es",
      getUserId: () => "u1",
      source: "ai_chat",
      t: (key) => key,
      onWordMarkedUnknown,
      unknownToastKey: "chat.wordSaved",
    });

    learning.openWordPopup("mercado", "fui al mercado");
    await learning.handleWordUnknown();

    expect(mockInvoke).toHaveBeenCalledWith("add_discovered_word_cmd", {
      userId: "u1",
      word: "mercado",
      language: "es",
      context: "fui al mercado",
    });
    expect(onWordMarkedUnknown).toHaveBeenCalledWith("mercado");
    expect(learning.wordToast.value).toBe("chat.wordSaved");
    expect(learning.selectedWord.value).toBeNull();
  });
});