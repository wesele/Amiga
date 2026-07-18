import { describe, expect, it, vi } from "vitest";
import {
  findNextTvFocus,
  findScrollableAncestor,
  scrollTvContent,
} from "../tvRemoteNavigation.js";
import { isTvScrollKey, scrollDeltaForKey } from "@/shared/tvPolicy.js";

function elementAt(left, top, width = 100, height = 60) {
  const element = document.createElement("button");
  element.getBoundingClientRect = () => ({
    left,
    top,
    width,
    height,
    right: left + width,
    bottom: top + height,
  });
  return element;
}

describe("TV remote navigation", () => {
  it("selects the nearest candidate in the requested direction", () => {
    const current = elementAt(200, 200);
    const left = elementAt(40, 200);
    const right = elementAt(360, 200);
    const diagonal = elementAt(320, 360);
    const candidates = [current, left, right, diagonal];

    expect(findNextTvFocus(current, "ArrowLeft", candidates)).toBe(left);
    expect(findNextTvFocus(current, "ArrowRight", candidates)).toBe(right);
    expect(findNextTvFocus(current, "ArrowDown", candidates)).toBe(diagonal);
  });

  it("recognizes PageUp/PageDown as scroll keys with page-sized deltas", () => {
    expect(isTvScrollKey("PageDown")).toBe(true);
    expect(scrollDeltaForKey("PageDown", 480)).toBe(480);
    expect(scrollDeltaForKey("PageUp", 480)).toBe(-480);
  });

  it("finds a scrollable ancestor that can accept the delta", () => {
    const outer = document.createElement("div");
    const inner = document.createElement("div");
    Object.defineProperty(inner, "scrollHeight", { value: 800, configurable: true });
    Object.defineProperty(inner, "clientHeight", { value: 200, configurable: true });
    Object.defineProperty(inner, "scrollTop", {
      value: 0,
      writable: true,
      configurable: true,
    });
    inner.style.overflowY = "auto";
    // jsdom getComputedStyle reads inline styles for overflow.
    outer.appendChild(inner);
    document.body.appendChild(outer);

    const child = document.createElement("button");
    inner.appendChild(child);

    const found = findScrollableAncestor(child, 100, document);
    expect(found).toBe(inner);

    outer.remove();
  });

  it("scrolls content via scrollTvContent using scrollBy/scrollTop", () => {
    const scroller = document.createElement("div");
    scroller.className = "app-content";
    Object.defineProperty(scroller, "scrollHeight", { value: 2000, configurable: true });
    Object.defineProperty(scroller, "clientHeight", { value: 400, configurable: true });
    let top = 0;
    Object.defineProperty(scroller, "scrollTop", {
      get: () => top,
      set: (v) => { top = v; },
      configurable: true,
    });
    scroller.scrollBy = vi.fn(({ top: delta }) => {
      top += delta;
    });
    scroller.style.overflowY = "auto";
    document.body.appendChild(scroller);

    const ok = scrollTvContent(200, { activeElement: scroller, documentRef: document });
    expect(ok).toBe(true);
    expect(top).toBeGreaterThan(0);

    scroller.remove();
  });
});
