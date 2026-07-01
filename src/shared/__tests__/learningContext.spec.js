import { describe, it, expect, vi, beforeEach } from "vitest";
import { setActivePinia, createPinia } from "pinia";
import {
  loadLearningContext,
  useLearningContext,
  DEFAULT_CEFR,
  DEFAULT_TARGET_LANG,
} from "../learningContext.js";

vi.mock("@/shared/api.js", () => ({
  getCurrentUser: vi.fn(),
  getLearningGoals: vi.fn(),
}));

vi.mock("@/stores/targetLang.js", () => ({
  useTargetLangStore: vi.fn(),
}));

import { getCurrentUser, getLearningGoals } from "@/shared/api.js";
import { useTargetLangStore } from "@/stores/targetLang.js";

function makeTargetLangStore({ code = null, loaded = false, loadResult = "es" } = {}) {
  return {
    code,
    loaded,
    load: vi.fn().mockResolvedValue(loadResult),
  };
}

describe("loadLearningContext", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
  });

  it("loads user, target lang, goals, and picks matching CEFR", async () => {
    const store = makeTargetLangStore({ code: "es", loaded: true });
    useTargetLangStore.mockReturnValue(store);
    getCurrentUser.mockResolvedValue({ id: "u1", native_language: "zh" });
    getLearningGoals.mockResolvedValue([
      { id: 1, target_language: "en", cefr_level: "B1" },
      { id: 2, target_language: "es", cefr_level: "A2" },
    ]);

    const ctx = await loadLearningContext();

    expect(ctx.user.id).toBe("u1");
    expect(ctx.targetLang).toBe("es");
    expect(ctx.nativeLang).toBe("zh");
    expect(ctx.currentGoal).toEqual({ id: 2, target_language: "es", cefr_level: "A2" });
    expect(ctx.cefr).toBe("A2");
    expect(store.load).not.toHaveBeenCalled();
  });

  it("falls back to store.load and default target lang", async () => {
    const store = makeTargetLangStore({ loadResult: null });
    useTargetLangStore.mockReturnValue(store);
    getCurrentUser.mockResolvedValue({ id: "u1" });
    getLearningGoals.mockResolvedValue([]);

    const ctx = await loadLearningContext();

    expect(store.load).toHaveBeenCalledTimes(1);
    expect(ctx.targetLang).toBe(DEFAULT_TARGET_LANG);
    expect(ctx.nativeLang).toBe("zh");
    expect(ctx.cefr).toBe(DEFAULT_CEFR);
  });

  it("honors cefrFallback when no matching goal exists", async () => {
    const store = makeTargetLangStore({ code: "es", loaded: true });
    useTargetLangStore.mockReturnValue(store);
    getCurrentUser.mockResolvedValue({ id: "u1", native_language: "en" });
    getLearningGoals.mockResolvedValue([{ id: 1, target_language: "en", cefr_level: "B1" }]);

    const ctx = await loadLearningContext({ cefrFallback: "B2" });

    expect(ctx.currentGoal).toBeNull();
    expect(ctx.cefr).toBe("B2");
  });

  it("can fall back to the first goal for profile-style loading", async () => {
    const store = makeTargetLangStore({ code: "es", loaded: true });
    useTargetLangStore.mockReturnValue(store);
    getCurrentUser.mockResolvedValue({ id: "u1", native_language: "zh" });
    getLearningGoals.mockResolvedValue([{ id: 1, target_language: "en", cefr_level: "B1" }]);

    const ctx = await loadLearningContext({ fallbackToFirstGoal: true });

    expect(ctx.currentGoal).toEqual({ id: 1, target_language: "en", cefr_level: "B1" });
    expect(ctx.cefr).toBe("B1");
  });

  it("skips goal loading when loadGoals is false", async () => {
    const store = makeTargetLangStore({ code: "fr", loaded: true });
    useTargetLangStore.mockReturnValue(store);
    getCurrentUser.mockResolvedValue({ id: "u1", native_language: "zh" });

    const ctx = await loadLearningContext({ loadGoals: false });

    expect(getLearningGoals).not.toHaveBeenCalled();
    expect(ctx.goals).toEqual([]);
    expect(ctx.currentGoal).toBeNull();
    expect(ctx.cefr).toBe(DEFAULT_CEFR);
  });
});

describe("useLearningContext", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
  });

  it("populates reactive state via load()", async () => {
    const store = makeTargetLangStore({ code: "es", loaded: true });
    useTargetLangStore.mockReturnValue(store);
    getCurrentUser.mockResolvedValue({ id: "u1", native_language: "zh" });
    getLearningGoals.mockResolvedValue([{ id: 3, target_language: "es", cefr_level: "A2" }]);

    const ctx = useLearningContext();
    await ctx.load();

    expect(ctx.user.value.id).toBe("u1");
    expect(ctx.targetLang.value).toBe("es");
    expect(ctx.nativeLang.value).toBe("zh");
    expect(ctx.goals.value).toHaveLength(1);
    expect(ctx.currentGoal.value.cefr_level).toBe("A2");
    expect(ctx.cefr.value).toBe("A2");
    expect(ctx.loading.value).toBe(false);
    expect(ctx.error.value).toBe("");
  });

  it("records errors from load()", async () => {
    const store = makeTargetLangStore({ code: "es", loaded: true });
    useTargetLangStore.mockReturnValue(store);
    getCurrentUser.mockRejectedValue(new Error("offline"));

    const ctx = useLearningContext();
    await expect(ctx.load()).rejects.toThrow("offline");

    expect(ctx.error.value).toBe("offline");
    expect(ctx.loading.value).toBe(false);
  });
});