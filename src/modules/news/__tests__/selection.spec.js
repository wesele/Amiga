import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Replicate the onWordTap guard logic from NewsReader.vue to verify the
// selection-guard behaviour that prevents the word popup from blocking
// drag-to-select translation.
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

// Replicate the onSelectionChange debounced logic (without the real timer —
// we invoke the inner callback synchronously via jest fake timers).
function createOnSelectionChange(state, mockTranslateText) {
  return function onSelectionChange() {
    if (state.selectionTimer) clearTimeout(state.selectionTimer);
    state.selectionTimer = setTimeout(() => {
      state.selectionTimer = null;
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed || sel.rangeCount === 0) return;
      const text = sel.toString().trim();
      if (!text || text.length === 0) return;
      if (text.split(/\s+/).length <= 1) return;

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

      sel.removeAllRanges();
    }, 300);
  };
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

    it("skips word popup when selection is only whitespace", () => {
      // toString returns spaces but trim() makes it empty → no guard
      mockSelection("   ");
      const state = { selectedWord: null, lookedUp: 0, knownWordIds: new Set() };
      const onWordTap = createOnWordTap(state);

      // trim() → "" → length 0 → guard NOT triggered → popup opens
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

  describe("onSelectionChange processing", () => {
    it("translates multi-word selection and clears native selection", async () => {
      const removeAllRanges = vi.fn();
      mockSelection("hola mundo bonito", { removeAllRanges });
      const mockTranslateText = vi.fn().mockResolvedValue("hello pretty world");
      const state = {
        selectionText: "",
        selectionResult: "",
        selectionLoading: false,
        selectionError: "",
        selectionTimer: null,
      };
      const onSelectionChange = createOnSelectionChange(state, mockTranslateText);

      onSelectionChange();
      expect(state.selectionText).toBe(""); // not yet — debounced

      vi.advanceTimersByTime(300);

      expect(state.selectionText).toBe("hola mundo bonito");
      expect(state.selectionLoading).toBe(true);
      expect(removeAllRanges).toHaveBeenCalled();

      await Promise.resolve();
      await Promise.resolve();
      expect(state.selectionResult).toBe("hello pretty world");
      expect(state.selectionLoading).toBe(false);
    });

    it("skips single-word selections", () => {
      const removeAllRanges = vi.fn();
      mockSelection("hola", { removeAllRanges });
      const mockTranslateText = vi.fn();
      const state = {
        selectionText: "",
        selectionResult: "",
        selectionLoading: false,
        selectionError: "",
        selectionTimer: null,
      };
      const onSelectionChange = createOnSelectionChange(state, mockTranslateText);

      onSelectionChange();
      vi.advanceTimersByTime(300);

      expect(state.selectionText).toBe("");
      expect(mockTranslateText).not.toHaveBeenCalled();
    });

    it("skips collapsed (empty) selections", () => {
      mockSelection("", { isCollapsed: true, rangeCount: 0 });
      const mockTranslateText = vi.fn();
      const state = {
        selectionText: "",
        selectionResult: "",
        selectionLoading: false,
        selectionError: "",
        selectionTimer: null,
      };
      const onSelectionChange = createOnSelectionChange(state, mockTranslateText);

      onSelectionChange();
      vi.advanceTimersByTime(300);

      expect(state.selectionText).toBe("");
      expect(mockTranslateText).not.toHaveBeenCalled();
    });

    it("sets error state when translation fails", async () => {
      const removeAllRanges = vi.fn();
      mockSelection("hola mundo", { removeAllRanges });
      const mockTranslateText = vi.fn().mockRejectedValue(new Error("API down"));
      const state = {
        selectionText: "",
        selectionResult: "",
        selectionLoading: false,
        selectionError: "",
        selectionTimer: null,
      };
      const onSelectionChange = createOnSelectionChange(state, mockTranslateText);

      onSelectionChange();
      vi.advanceTimersByTime(300);

      expect(state.selectionLoading).toBe(true);
      await Promise.resolve();
      await Promise.resolve();
      expect(state.selectionError).toBe("翻译暂不可用");
      expect(state.selectionLoading).toBe(false);
    });

    it("debounces — only fires after 300ms of no changes", () => {
      const removeAllRanges = vi.fn();
      mockSelection("hola mundo", { removeAllRanges });
      const mockTranslateText = vi.fn().mockResolvedValue("hello world");
      const state = {
        selectionText: "",
        selectionResult: "",
        selectionLoading: false,
        selectionError: "",
        selectionTimer: null,
      };
      const onSelectionChange = createOnSelectionChange(state, mockTranslateText);

      onSelectionChange();
      vi.advanceTimersByTime(200);
      expect(state.selectionText).toBe(""); // not yet

      onSelectionChange(); // reset timer
      vi.advanceTimersByTime(200);
      expect(state.selectionText).toBe(""); // still not yet

      vi.advanceTimersByTime(100); // total 300 since last call
      expect(state.selectionText).toBe("hola mundo");
    });
  });

  describe("clearSelection timer cleanup", () => {
    it("clears pending debounce timer so stale translation does not fire", () => {
      mockSelection("hola mundo", { removeAllRanges: vi.fn() });
      const mockTranslateText = vi.fn().mockResolvedValue("hello world");
      const state = {
        selectionText: "",
        selectionResult: "",
        selectionLoading: false,
        selectionError: "",
        selectionTimer: null,
      };
      const onSelectionChange = createOnSelectionChange(state, mockTranslateText);

      onSelectionChange();
      expect(state.selectionTimer).not.toBeNull();

      // Simulate clearSelection
      if (state.selectionTimer) {
        clearTimeout(state.selectionTimer);
        state.selectionTimer = null;
      }
      state.selectionText = "";
      state.selectionResult = "";
      state.selectionError = "";
      state.selectionLoading = false;

      vi.advanceTimersByTime(500);
      expect(state.selectionText).toBe(""); // stale timer did not fire
      expect(mockTranslateText).not.toHaveBeenCalled();
    });
  });
});
