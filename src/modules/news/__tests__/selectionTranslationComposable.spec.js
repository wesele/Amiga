import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  computeTranslateButtonPlacement,
  isTranslatableSelectionText,
  useSelectionTranslation,
} from "../selectionTranslation.js";

describe("selectionTranslation module", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("accepts only multi-word selection text", () => {
    expect(isTranslatableSelectionText("hola mundo")).toBe(true);
    expect(isTranslatableSelectionText("hola")).toBe(false);
    expect(isTranslatableSelectionText("")).toBe(false);
  });

  it("computes the floating translate button placement below normal selections", () => {
    const selection = makeSelection("hola mundo", {
      top: 100,
      bottom: 120,
      right: 300,
      width: 200,
      height: 20,
    });
    const placement = computeTranslateButtonPlacement({
      selection,
      articleBody: { contains: () => true },
      viewportWidth: 480,
      viewportHeight: 800,
    });

    expect(placement).toEqual({ visible: true, x: 212, y: 128 });
  });

  it("flips above when the button would exceed the viewport bottom", () => {
    const selection = makeSelection("hola mundo", {
      top: 760,
      bottom: 780,
      right: 300,
      width: 200,
      height: 20,
    });
    const placement = computeTranslateButtonPlacement({
      selection,
      articleBody: { contains: () => true },
      viewportWidth: 480,
      viewportHeight: 800,
    });

    expect(placement.y).toBe(720);
  });

  it("translates selected text and exposes loading/result state", async () => {
    const translateText = vi.fn().mockResolvedValue("hello world");
    const selection = useSelectionTranslation({
      translateText,
      getTargetLang: () => "es",
      getNativeLang: () => "zh",
      t: () => "翻译暂不可用",
    });

    expect(selection.translateSelection("hola mundo")).toBe(true);
    expect(selection.selectionLoading.value).toBe(true);

    await Promise.resolve();
    await Promise.resolve();

    expect(translateText).toHaveBeenCalledWith("hola mundo", "es", "zh");
    expect(selection.selectionResult.value).toBe("hello world");
    expect(selection.selectionLoading.value).toBe(false);
  });

  it("delays pointerup translation until the drag selection is complete", async () => {
    const removeAllRanges = vi.fn();
    const targetWindow = {
      innerWidth: 480,
      innerHeight: 800,
      getSelection: vi.fn(() => makeSelection("hola mundo", {
        top: 100,
        bottom: 120,
        right: 300,
        width: 200,
        height: 20,
        removeAllRanges,
      })),
    };
    const translateText = vi.fn().mockResolvedValue("hello world");
    const selection = useSelectionTranslation({
      translateText,
      getTargetLang: () => "es",
      getNativeLang: () => "zh",
      t: () => "翻译暂不可用",
      windowRef: targetWindow,
      documentRef: { querySelector: () => ({ contains: () => true }) },
    });

    selection.onSelectionChange();
    selection.onPointerUp();
    vi.advanceTimersByTime(49);
    expect(translateText).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    await Promise.resolve();
    expect(translateText).toHaveBeenCalledWith("hola mundo", "es", "zh");
    expect(removeAllRanges).toHaveBeenCalled();
  });
});

function makeSelection(text, rect) {
  return {
    isCollapsed: false,
    rangeCount: 1,
    toString: () => text,
    getRangeAt: () => ({
      commonAncestorContainer: {},
      getBoundingClientRect: () => rect,
    }),
    removeAllRanges: rect.removeAllRanges || vi.fn(),
  };
}
