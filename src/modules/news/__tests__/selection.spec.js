import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

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
