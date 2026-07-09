import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const ensureWordsSeen = vi.fn();
const lookupWordIds = vi.fn();
const updateWordMastery = vi.fn();
const addDiscoveredWord = vi.fn();

vi.mock("@/shared/backend/vocabulary.js", () => ({
  ensureWordsSeen: (...args) => ensureWordsSeen(...args),
  lookupWordIds: (...args) => lookupWordIds(...args),
  updateWordMastery: (...args) => updateWordMastery(...args),
  addDiscoveredWord: (...args) => addDiscoveredWord(...args),
}));

let useNewsArticleWords;

beforeEach(async () => {
  ({ useNewsArticleWords } = await import("../useNewsArticleWords.js"));
  ensureWordsSeen.mockReset().mockResolvedValue(undefined);
  lookupWordIds.mockReset().mockResolvedValue([]);
  updateWordMastery.mockReset().mockResolvedValue(undefined);
  addDiscoveredWord.mockReset().mockResolvedValue("new-id");
});

afterEach(() => {
  vi.restoreAllMocks();
});

const article = {
  original_title: "Hola",
  rewritten_body: "mundo bonito",
};

function setup(overrides = {}) {
  return useNewsArticleWords({
    getUserId: () => "user-1",
    getTargetLang: () => "es",
    getArticle: () => article,
    ...overrides,
  });
}

describe("useNewsArticleWords", () => {
  describe("processArticleWords", () => {
    it("marks extracted words as seen and flags processing as done", async () => {
      const words = setup();
      await words.processArticleWords();

      expect(ensureWordsSeen).toHaveBeenCalledWith(
        "user-1",
        ["hola", "mundo", "bonito"],
        "es",
      );
    });

    it("does nothing when there is no user", async () => {
      const words = setup({ getUserId: () => null });
      await words.processArticleWords();
      expect(ensureWordsSeen).not.toHaveBeenCalled();
    });

    it("does not run twice", async () => {
      const words = setup();
      await words.processArticleWords();
      await words.processArticleWords();
      expect(ensureWordsSeen).toHaveBeenCalledTimes(1);
    });

    it("skips articles that yield no word tokens", async () => {
      const words = setup({ getArticle: () => ({ original_title: "" }) });
      await words.processArticleWords();
      expect(ensureWordsSeen).not.toHaveBeenCalled();
    });

    it("swallows backend errors", async () => {
      vi.spyOn(console, "error").mockImplementation(() => {});
      ensureWordsSeen.mockRejectedValue(new Error("boom"));
      const words = setup();
      await expect(words.processArticleWords()).resolves.toBeUndefined();
    });
  });

  describe("ensureArticleWordsSeenIfNeeded", () => {
    it("marks words seen when processing has not happened", async () => {
      const words = setup();
      await words.ensureArticleWordsSeenIfNeeded();
      expect(ensureWordsSeen).toHaveBeenCalledTimes(1);
    });

    it("does nothing once words have been processed", async () => {
      const words = setup();
      await words.processArticleWords();
      ensureWordsSeen.mockClear();
      await words.ensureArticleWordsSeenIfNeeded();
      expect(ensureWordsSeen).not.toHaveBeenCalled();
    });
  });

  describe("onWordTap", () => {
    it("selects tapped words and tracks their text", () => {
      window.getSelection = vi.fn(() => ({ toString: () => "" }));
      const words = setup();
      const token = { isWord: true, text: "hola" };
      words.onWordTap(token);

      expect(words.selectedWord.value).toEqual(token);
      expect(words.knownWordIds.value.has("hola")).toBe(true);
    });

    it("ignores non-word tokens", () => {
      const words = setup();
      words.onWordTap({ isWord: false, text: " " });
      expect(words.selectedWord.value).toBe(null);
    });

    it("ignores taps while a text selection is active", () => {
      window.getSelection = vi.fn(() => ({ toString: () => "hola mundo" }));
      const words = setup();
      words.onWordTap({ isWord: true, text: "hola" });
      expect(words.selectedWord.value).toBe(null);
    });
  });

  describe("onWordKnown / onWordUnknown", () => {
    beforeEach(() => {
      window.getSelection = vi.fn(() => ({ toString: () => "" }));
    });

    it("updates mastery for an existing word when marked known", async () => {
      lookupWordIds.mockResolvedValue([42]);
      const words = setup();
      words.onWordTap({ isWord: true, text: "hola", context: "Hola mundo" });

      await words.onWordKnown();

      expect(updateWordMastery).toHaveBeenCalledWith("user-1", 42, 2, "news_reading");
      expect(words.wordsKnownSet.value.has("hola")).toBe(true);
      expect(words.selectedWord.value).toBe(null);
    });

    it("discovers a new word and raises its mastery when marked known", async () => {
      lookupWordIds.mockResolvedValue([]);
      const words = setup();
      words.onWordTap({ isWord: true, text: "nuevo", context: "un nuevo" });

      await words.onWordKnown();

      expect(addDiscoveredWord).toHaveBeenCalledWith("user-1", "nuevo", "es", "un nuevo");
      expect(updateWordMastery).toHaveBeenCalledWith("user-1", "new-id", 2, "news_reading");
    });

    it("does not raise mastery for a newly discovered unknown word", async () => {
      lookupWordIds.mockResolvedValue([]);
      const words = setup();
      words.onWordTap({ isWord: true, text: "nuevo", context: "un nuevo" });

      await words.onWordUnknown();

      expect(addDiscoveredWord).toHaveBeenCalledTimes(1);
      expect(updateWordMastery).not.toHaveBeenCalled();
      expect(words.wordsUnknownSet.value.has("nuevo")).toBe(true);
    });

    it("swallows errors thrown while updating mastery", async () => {
      lookupWordIds.mockRejectedValue(new Error("network"));
      const words = setup();
      words.onWordTap({ isWord: true, text: "hola", context: "" });
      await expect(words.onWordKnown()).resolves.toBeUndefined();
      expect(words.selectedWord.value).toBe(null);
    });

    it("does nothing when no word is selected", async () => {
      const words = setup();
      await words.onWordKnown();
      expect(lookupWordIds).not.toHaveBeenCalled();
    });
  });
});
