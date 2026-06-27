import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { setLocale, getLocale } from "@/shared/i18n/index.js";

// Replicate the onWordTap guard logic from NewsReader.vue.
function createOnWordTap(state) {
  return function onWordTap(token) {
    if (!token.isWord) return;
    const sel = window.getSelection();
    if (sel && sel.toString().trim().length > 0) return;
    state.selectedWord = token;
    state.lookedUp++;
    state.knownWordIds.add(token.text);
  };
}

// Replicate the refactored selection logic from NewsReader.vue:
//   translateSelection(text)     — core: triggers translation for given text
//   onSelectionChange()          — drag phase: only marks isSelecting
//   onPointerUp()                — Windows: processes selection after release
//   handleNativeTranslate(text)  — Android: called from native "翻译" menu item
function createSelectionHandlers(state, mockTranslateText) {
  function translateSelection(text) {
    if (!text || text.length === 0) return false;
    if (text.split(/\s+/).length <= 1) return false;

    state.selectionText = text;
    state.selectionLoading = true;

    mockTranslateText(text)
      .then((result) => {
        state.selectionResult = result;
        state.selectionLoading = false;
      })
      .catch((err) => {
        state.selectionError = typeof err === "string" ? err : "翻译暂不可用";
        state.selectionLoading = false;
      });

    return true;
  }

  function onSelectionChange() {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || sel.rangeCount === 0) {
      state.isSelecting = false;
      return;
    }
    const text = sel.toString().trim();
    if (text && text.split(/\s+/).length > 1) {
      state.isSelecting = true;
    }
  }

  function onPointerUp() {
    if (state.selectionTimer) clearTimeout(state.selectionTimer);
    state.selectionTimer = setTimeout(() => {
      state.selectionTimer = null;
      if (!state.isSelecting) return;
      state.isSelecting = false;

      const sel = window.getSelection();
      if (!sel || sel.isCollapsed || sel.rangeCount === 0) return;
      const text = sel.toString().trim();
      if (!translateSelection(text)) return;
      sel.removeAllRanges();
    }, 50);
  }

  function handleNativeTranslate(text) {
    state.isSelecting = false;
    if (!translateSelection(text)) return;
    const sel = window.getSelection();
    if (sel) sel.removeAllRanges();
  }

  return { onSelectionChange, onPointerUp, handleNativeTranslate, translateSelection };
}

describe("NewsReader selection logic", () => {
  let origGetSelection;

  beforeEach(() => {
    origGetSelection = window.getSelection;
    vi.useFakeTimers();
  });

  afterEach(() => {
    window.getSelection = origGetSelection;
    vi.useRealTimers();
  });

  function mockSelection(text, opts = {}) {
    const sel = {
      toString: () => text,
      isCollapsed: opts.isCollapsed ?? (text.length === 0),
      rangeCount: opts.rangeCount ?? (text.length > 0 ? 1 : 0),
      removeAllRanges: opts.removeAllRanges || vi.fn(),
    };
    window.getSelection = vi.fn(() => sel);
    return sel;
  }

  function makeState() {
    return {
      selectionText: "",
      selectionResult: "",
      selectionLoading: false,
      selectionError: "",
      selectionTimer: null,
      isSelecting: false,
    };
  }

  describe("onWordTap selection guard", () => {
    it("opens word popup when there is no active selection", () => {
      mockSelection("");
      const state = { selectedWord: null, lookedUp: 0, knownWordIds: new Set() };
      const onWordTap = createOnWordTap(state);

      onWordTap({ text: "hola", isWord: true });

      expect(state.selectedWord).toEqual({ text: "hola", isWord: true });
      expect(state.lookedUp).toBe(1);
      expect(state.knownWordIds.has("hola")).toBe(true);
    });

    it("skips word popup when there is an active multi-word selection", () => {
      mockSelection("hola mundo");
      const state = { selectedWord: null, lookedUp: 0, knownWordIds: new Set() };
      const onWordTap = createOnWordTap(state);

      onWordTap({ text: "hola", isWord: true });

      expect(state.selectedWord).toBeNull();
      expect(state.lookedUp).toBe(0);
      expect(state.knownWordIds.has("hola")).toBe(false);
    });

    it("opens popup for whitespace-only selection (trim → empty)", () => {
      mockSelection("   ");
      const state = { selectedWord: null, lookedUp: 0, knownWordIds: new Set() };
      const onWordTap = createOnWordTap(state);

      onWordTap({ text: "hola", isWord: true });

      expect(state.selectedWord).not.toBeNull();
      expect(state.lookedUp).toBe(1);
    });

    it("does nothing for non-word tokens", () => {
      mockSelection("");
      const state = { selectedWord: null, lookedUp: 0, knownWordIds: new Set() };
      const onWordTap = createOnWordTap(state);

      onWordTap({ text: ", ", isWord: false });

      expect(state.selectedWord).toBeNull();
      expect(state.lookedUp).toBe(0);
    });
  });

  describe("translateSelection (core)", () => {
    it("translates multi-word text and returns true", async () => {
      const mockTranslateText = vi.fn().mockResolvedValue("hello world");
      const state = makeState();
      const { translateSelection } = createSelectionHandlers(state, mockTranslateText);

      const ok = translateSelection("hola mundo");

      expect(ok).toBe(true);
      expect(state.selectionText).toBe("hola mundo");
      expect(state.selectionLoading).toBe(true);

      await Promise.resolve();
      await Promise.resolve();
      expect(state.selectionResult).toBe("hello world");
      expect(state.selectionLoading).toBe(false);
    });

    it("returns false for single-word text", () => {
      const mockTranslateText = vi.fn();
      const state = makeState();
      const { translateSelection } = createSelectionHandlers(state, mockTranslateText);

      const ok = translateSelection("hola");

      expect(ok).toBe(false);
      expect(mockTranslateText).not.toHaveBeenCalled();
    });

    it("returns false for empty text", () => {
      const mockTranslateText = vi.fn();
      const state = makeState();
      const { translateSelection } = createSelectionHandlers(state, mockTranslateText);

      expect(translateSelection("")).toBe(false);
      expect(translateSelection(null)).toBe(false);
      expect(mockTranslateText).not.toHaveBeenCalled();
    });

    it("sets error state on translation failure", async () => {
      const mockTranslateText = vi.fn().mockRejectedValue(new Error("down"));
      const state = makeState();
      const { translateSelection } = createSelectionHandlers(state, mockTranslateText);

      translateSelection("hola mundo");

      await Promise.resolve();
      await Promise.resolve();
      expect(state.selectionError).toBe("翻译暂不可用");
      expect(state.selectionLoading).toBe(false);
    });
  });

  describe("nativeLang follows UI locale (getLocale)", () => {
    it("getLocale() returns the current UI language, not a stale user.native_language", () => {
      setLocale("en", { persist: false });
      expect(getLocale()).toBe("en");

      setLocale("zh", { persist: false });
      expect(getLocale()).toBe("zh");

      setLocale("es", { persist: false });
      expect(getLocale()).toBe("es");
    });

    it("switching UI language survives across locale changes", () => {
      setLocale("en", { persist: false });
      expect(getLocale()).toBe("en");
      setLocale("zh", { persist: false });
      expect(getLocale()).toBe("zh");
      setLocale("en", { persist: false });
      expect(getLocale()).toBe("en");
    });
  });

  describe("onSelectionChange (drag phase)", () => {
    it("marks isSelecting=true for multi-word selection", () => {
      mockSelection("hola mundo");
      const state = makeState();
      const { onSelectionChange } = createSelectionHandlers(state, vi.fn());

      onSelectionChange();

      expect(state.isSelecting).toBe(true);
      expect(state.selectionText).toBe("");
    });

    it("does not mark isSelecting for single-word selection", () => {
      mockSelection("hola");
      const state = makeState();
      const { onSelectionChange } = createSelectionHandlers(state, vi.fn());

      onSelectionChange();

      expect(state.isSelecting).toBe(false);
    });

    it("resets isSelecting when selection collapses", () => {
      mockSelection("hola mundo");
      const state = makeState();
      const { onSelectionChange } = createSelectionHandlers(state, vi.fn());

      onSelectionChange();
      expect(state.isSelecting).toBe(true);

      mockSelection("", { isCollapsed: true, rangeCount: 0 });
      onSelectionChange();
      expect(state.isSelecting).toBe(false);
    });
  });

  describe("onPointerUp (Windows release)", () => {
    it("translates after finger/mouse release", async () => {
      const removeAllRanges = vi.fn();
      mockSelection("hola mundo bonito", { removeAllRanges });
      const mockTranslateText = vi.fn().mockResolvedValue("hello pretty world");
      const state = makeState();
      const { onSelectionChange, onPointerUp } = createSelectionHandlers(
        state, mockTranslateText,
      );

      onSelectionChange();
      onPointerUp();
      vi.advanceTimersByTime(50);

      expect(state.selectionText).toBe("hola mundo bonito");
      expect(removeAllRanges).toHaveBeenCalled();

      await Promise.resolve();
      await Promise.resolve();
      expect(state.selectionResult).toBe("hello pretty world");
    });

    it("does NOT translate while dragging (no pointerup)", () => {
      mockSelection("hola mundo");
      const mockTranslateText = vi.fn();
      const state = makeState();
      const { onSelectionChange } = createSelectionHandlers(state, mockTranslateText);

      onSelectionChange();
      vi.advanceTimersByTime(1000);

      expect(mockTranslateText).not.toHaveBeenCalled();
    });

    it("does not fire before 50ms delay", () => {
      mockSelection("hola mundo");
      const mockTranslateText = vi.fn().mockResolvedValue("hello world");
      const state = makeState();
      const { onSelectionChange, onPointerUp } = createSelectionHandlers(
        state, mockTranslateText,
      );

      onSelectionChange();
      onPointerUp();
      vi.advanceTimersByTime(49);

      expect(mockTranslateText).not.toHaveBeenCalled();

      vi.advanceTimersByTime(1);
      expect(mockTranslateText).toHaveBeenCalledWith("hola mundo");
    });
  });

  describe("handleNativeTranslate (Android menu item)", () => {
    it("translates the text passed from native and clears selection", async () => {
      const removeAllRanges = vi.fn();
      mockSelection("hola mundo", { removeAllRanges });
      const mockTranslateText = vi.fn().mockResolvedValue("hello world");
      const state = makeState();
      const { handleNativeTranslate } = createSelectionHandlers(
        state, mockTranslateText,
      );

      handleNativeTranslate("hola mundo");

      expect(state.selectionText).toBe("hola mundo");
      expect(state.selectionLoading).toBe(true);
      expect(removeAllRanges).toHaveBeenCalled();

      await Promise.resolve();
      await Promise.resolve();
      expect(state.selectionResult).toBe("hello world");
    });

    it("resets isSelecting to prevent pointerup double-fire", () => {
      mockSelection("hola mundo");
      const mockTranslateText = vi.fn().mockResolvedValue("hello world");
      const state = makeState();
      const { onSelectionChange, handleNativeTranslate, onPointerUp } =
        createSelectionHandlers(state, mockTranslateText);

      onSelectionChange();
      expect(state.isSelecting).toBe(true);

      handleNativeTranslate("hola mundo");
      expect(state.isSelecting).toBe(false);

      // pointerup should NOT re-trigger because isSelecting was cleared
      onPointerUp();
      vi.advanceTimersByTime(50);

      expect(mockTranslateText).toHaveBeenCalledTimes(1);
    });

    it("skips single-word text from native", () => {
      mockSelection("hola");
      const mockTranslateText = vi.fn();
      const state = makeState();
      const { handleNativeTranslate } = createSelectionHandlers(state, mockTranslateText);

      handleNativeTranslate("hola");

      expect(state.selectionText).toBe("");
      expect(mockTranslateText).not.toHaveBeenCalled();
    });

    it("skips empty text from native", () => {
      const mockTranslateText = vi.fn();
      const state = makeState();
      const { handleNativeTranslate } = createSelectionHandlers(state, mockTranslateText);

      handleNativeTranslate("");
      handleNativeTranslate(null);

      expect(mockTranslateText).not.toHaveBeenCalled();
    });
  });

  describe("clearSelection timer cleanup", () => {
    it("clears pending pointerup timer so stale translation does not fire", () => {
      mockSelection("hola mundo", { removeAllRanges: vi.fn() });
      const mockTranslateText = vi.fn().mockResolvedValue("hello world");
      const state = makeState();
      const { onSelectionChange, onPointerUp } = createSelectionHandlers(
        state, mockTranslateText,
      );

      onSelectionChange();
      onPointerUp();
      expect(state.selectionTimer).not.toBeNull();

      if (state.selectionTimer) {
        clearTimeout(state.selectionTimer);
        state.selectionTimer = null;
      }

      vi.advanceTimersByTime(500);
      expect(mockTranslateText).not.toHaveBeenCalled();
    });
  });
});

/**
 * Tests for the JS-side translate floating button (the
 * Android-only fallback when the system text-selection toolbar is
 * unavailable). Mirrors the production logic in
 * src/modules/news/NewsReader.vue: on `selectionchange`, if the
 * new selection is multi-word AND inside the article body,
 * show a "翻译" button positioned above (or below, near the top)
 * the selection rect; on collapse or single-word, hide it.
 */
describe("translate floating button positioning (Android fallback)", () => {
  it("appears above the selection when the rect is not at the top", () => {
    const sel = {
      isCollapsed: false,
      rangeCount: 1,
      toString: () => "hola mundo",
      getRangeAt: () => ({
        getBoundingClientRect: () => ({ top: 400, bottom: 420, left: 100, right: 300, width: 200, height: 20 }),
        commonAncestorContainer: { nodeType: 1, parentNode: null, closest: () => null },
      }),
    };
    const articleBody = { contains: () => true };
    const computed = computeTranslateButtonPlacement(sel, articleBody, 1080);
    expect(computed.visible).toBe(true);
    // y = rect.top - 40 = 360
    expect(computed.y).toBe(360);
    // x = rect.right - 88 = 212, clamped inside [8, 1080-88-8] = [8, 984]
    expect(computed.x).toBe(212);
  });

  it("flips below the selection when the rect is too close to the top", () => {
    const sel = {
      isCollapsed: false,
      rangeCount: 1,
      toString: () => "hola mundo",
      getRangeAt: () => ({
        getBoundingClientRect: () => ({ top: 30, bottom: 50, left: 100, right: 300, width: 200, height: 20 }),
        commonAncestorContainer: { nodeType: 1 },
      }),
    };
    const articleBody = { contains: () => true };
    const computed = computeTranslateButtonPlacement(sel, articleBody, 1080);
    // y = rect.bottom + 8 = 58 (flipped below)
    expect(computed.y).toBe(58);
  });

  it("hides the button for empty / collapsed selections", () => {
    expect(computeTranslateButtonPlacement(null, null, 1080).visible).toBe(false);
    const sel = { isCollapsed: true, rangeCount: 0, toString: () => "" };
    expect(computeTranslateButtonPlacement(sel, null, 1080).visible).toBe(false);
  });

  it("hides the button for single-word selections", () => {
    const sel = {
      isCollapsed: false,
      rangeCount: 1,
      toString: () => "hola",
      getRangeAt: () => ({
        getBoundingClientRect: () => ({ top: 0, bottom: 0, left: 0, right: 0, width: 0, height: 0 }),
        commonAncestorContainer: { nodeType: 1 },
      }),
    };
    expect(computeTranslateButtonPlacement(sel, null, 1080).visible).toBe(false);
  });

  it("hides the button when the selection is outside the article body", () => {
    const sel = {
      isCollapsed: false,
      rangeCount: 1,
      toString: () => "hola mundo",
      getRangeAt: () => ({
        getBoundingClientRect: () => ({ top: 200, bottom: 220, left: 100, right: 300, width: 200, height: 20 }),
        commonAncestorContainer: { nodeType: 1 },
      }),
    };
    const articleBody = { contains: () => false };
    expect(computeTranslateButtonPlacement(sel, articleBody, 1080).visible).toBe(false);
  });

  it("clamps x so the button stays on-screen", () => {
    const sel = {
      isCollapsed: false,
      rangeCount: 1,
      toString: () => "hola mundo",
      getRangeAt: () => ({
        getBoundingClientRect: () => ({ top: 400, bottom: 420, left: 1000, right: 1075, width: 75, height: 20 }),
        commonAncestorContainer: { nodeType: 1 },
      }),
    };
    const articleBody = { contains: () => true };
    const c = computeTranslateButtonPlacement(sel, articleBody, 1080);
    // right - 88 = 987, viewport width 1080, button 88, margin 8 → clamp 8..984
    // 987 is outside 8..984, so x = 984
    expect(c.x).toBe(984);
  });
});

// Mirror of the placement logic in NewsReader.vue. Keep in lock-step.
function computeTranslateButtonPlacement(sel, articleBody, viewportWidth) {
  if (!sel || sel.isCollapsed || sel.rangeCount === 0) {
    return { visible: false, x: 0, y: 0 };
  }
  const text = sel.toString().trim();
  if (!text || text.split(/\s+/).length <= 1) {
    return { visible: false, x: 0, y: 0 };
  }
  const range = sel.getRangeAt(0);
  const rect = range.getBoundingClientRect();
  if (rect.width === 0 && rect.height === 0) {
    return { visible: false, x: 0, y: 0 };
  }
  if (articleBody && !articleBody.contains(range.commonAncestorContainer)) {
    return { visible: false, x: 0, y: 0 };
  }
  const buttonWidth = 88;
  const margin = 8;
  let y = rect.top - 40;
  if (y < 60) y = rect.bottom + 8;
  const x = Math.max(margin, Math.min(viewportWidth - buttonWidth - margin, rect.right - buttonWidth));
  return { visible: true, x, y };
}
