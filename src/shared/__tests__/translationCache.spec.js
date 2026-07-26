import { describe, it, expect, beforeEach } from "vitest";
import {
  buildTranslationCacheKey,
  getCachedTranslation,
  setCachedTranslation,
  invalidateTranslationCache,
  clearTranslationCache,
} from "../translationCache.js";

describe("translationCache", () => {
  beforeEach(() => {
    clearTranslationCache();
  });

  it("builds keys that normalize case and whitespace and include languages", () => {
    expect(buildTranslationCacheKey("word", "  Hola  ", "ES", "ZH")).toBe("word|es|zh|hola");
    expect(buildTranslationCacheKey("text", "Buenos   días", "es", "zh")).toBe(
      "text|es|zh|buenos días",
    );
  });

  it("isolates cache entries by language pair", () => {
    const esZh = buildTranslationCacheKey("word", "hola", "es", "zh");
    const esEn = buildTranslationCacheKey("word", "hola", "es", "en");
    setCachedTranslation(esZh, { mode: "word", value: { translation: "你好" } });
    setCachedTranslation(esEn, { mode: "word", value: { translation: "hello" } });

    expect(getCachedTranslation(esZh).value.translation).toBe("你好");
    expect(getCachedTranslation(esEn).value.translation).toBe("hello");
  });

  it("invalidates a single key", () => {
    const key = buildTranslationCacheKey("word", "hola", "es", "zh");
    setCachedTranslation(key, { mode: "word", value: { translation: "你好" } });
    invalidateTranslationCache(key);
    expect(getCachedTranslation(key)).toBeUndefined();
  });
});
