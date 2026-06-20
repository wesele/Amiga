import { setActivePinia, createPinia } from "pinia";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { useTargetLangStore, TARGET_LANG_CHANGED } from "../targetLang.js";
import { eventBus } from "@/shared/eventBus.js";

vi.mock("@/shared/api.js", () => ({
  getTargetLanguage: vi.fn(),
  setTargetLanguage: vi.fn(),
}));

import { getTargetLanguage, setTargetLanguage } from "@/shared/api.js";

describe("useTargetLangStore", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
  });

  it("starts uninitialized", () => {
    const store = useTargetLangStore();
    expect(store.code).toBe(null);
    expect(store.loaded).toBe(false);
  });

  describe("load()", () => {
    it("hydrates from backend", async () => {
      getTargetLanguage.mockResolvedValueOnce("zh");
      const store = useTargetLangStore();
      await store.load();
      expect(store.code).toBe("zh");
      expect(store.loaded).toBe(true);
    });

    it("falls back to 'es' on error", async () => {
      getTargetLanguage.mockRejectedValueOnce(new Error("offline"));
      const store = useTargetLangStore();
      await store.load();
      expect(store.code).toBe("es");
      expect(store.loaded).toBe(true);
    });

    it("falls back to 'es' when backend returns null", async () => {
      getTargetLanguage.mockResolvedValueOnce(null);
      const store = useTargetLangStore();
      await store.load();
      expect(store.code).toBe("es");
    });

    it("is idempotent — second load does not re-fetch", async () => {
      getTargetLanguage.mockResolvedValueOnce("en");
      const store = useTargetLangStore();
      await store.load();
      await store.load();
      expect(getTargetLanguage).toHaveBeenCalledTimes(1);
    });
  });

  describe("set()", () => {
    it("persists and emits event", async () => {
      getTargetLanguage.mockResolvedValueOnce("es");
      setTargetLanguage.mockResolvedValueOnce(undefined);
      const handler = vi.fn();
      eventBus.on(TARGET_LANG_CHANGED, handler);

      const store = useTargetLangStore();
      await store.load();
      await store.set("zh");

      expect(setTargetLanguage).toHaveBeenCalledWith("zh");
      expect(store.code).toBe("zh");
      expect(handler).toHaveBeenCalledWith("zh");
    });

    it("does not emit when the value is unchanged", async () => {
      getTargetLanguage.mockResolvedValueOnce("es");
      setTargetLanguage.mockResolvedValueOnce(undefined);
      const handler = vi.fn();
      eventBus.on(TARGET_LANG_CHANGED, handler);

      const store = useTargetLangStore();
      await store.load();
      await store.set("es");

      expect(setTargetLanguage).not.toHaveBeenCalled();
      expect(handler).not.toHaveBeenCalled();
    });

    it("rejects falsy codes", async () => {
      setTargetLanguage.mockResolvedValueOnce(undefined);
      const store = useTargetLangStore();
      await store.set("");
      await store.set(null);
      expect(setTargetLanguage).not.toHaveBeenCalled();
    });
  });

  describe("reset()", () => {
    it("clears cached state", async () => {
      getTargetLanguage.mockResolvedValueOnce("en");
      const store = useTargetLangStore();
      await store.load();
      expect(store.code).toBe("en");
      store.reset();
      expect(store.code).toBe(null);
      expect(store.loaded).toBe(false);
    });
  });
});
