import { describe, expect, it } from "vitest";
import {
  currentSectionDomId,
  isElementVisibleInScrollParent,
  pathRouteWithCurrentFocus,
  shouldShowJumpToCurrent,
} from "../pathMapScroll.js";

describe("currentSectionDomId", () => {
  it("returns a stable id from section id", () => {
    expect(currentSectionDomId({ id: "zh-es/U02-GRAMMAR" })).toBe(
      "path-node-zh-es/U02-GRAMMAR",
    );
  });

  it("returns null when section or id is missing", () => {
    expect(currentSectionDomId(null)).toBeNull();
    expect(currentSectionDomId({})).toBeNull();
  });
});

describe("shouldShowJumpToCurrent", () => {
  it("shows when curriculum is active, has current, and node is off-screen", () => {
    expect(
      shouldShowJumpToCurrent({
        hasCurrent: true,
        currentVisible: false,
        curriculumActive: true,
      }),
    ).toBe(true);
  });

  it("hides when current is visible", () => {
    expect(
      shouldShowJumpToCurrent({
        hasCurrent: true,
        currentVisible: true,
        curriculumActive: true,
      }),
    ).toBe(false);
  });

  it("hides when curriculum is inactive or no current section", () => {
    expect(
      shouldShowJumpToCurrent({
        hasCurrent: false,
        currentVisible: false,
        curriculumActive: true,
      }),
    ).toBe(false);
    expect(
      shouldShowJumpToCurrent({
        hasCurrent: true,
        currentVisible: false,
        curriculumActive: false,
      }),
    ).toBe(false);
  });
});

describe("isElementVisibleInScrollParent", () => {
  function makeRects({ elTop, elHeight, parentTop, parentHeight }) {
    const el = {
      getBoundingClientRect: () => ({
        top: elTop,
        bottom: elTop + elHeight,
        height: elHeight,
      }),
    };
    const parent = {
      getBoundingClientRect: () => ({
        top: parentTop,
        bottom: parentTop + parentHeight,
        height: parentHeight,
      }),
    };
    return { el, parent };
  }

  it("returns false when element or parent is missing", () => {
    expect(isElementVisibleInScrollParent(null, {})).toBe(false);
    expect(isElementVisibleInScrollParent({}, null)).toBe(false);
  });

  it("returns true when enough of the element is inside the parent", () => {
    const { el, parent } = makeRects({
      elTop: 100,
      elHeight: 100,
      parentTop: 0,
      parentHeight: 200,
    });
    expect(isElementVisibleInScrollParent(el, parent, { threshold: 0.35 })).toBe(true);
  });

  it("returns false when element is mostly outside the parent", () => {
    const { el, parent } = makeRects({
      elTop: 250,
      elHeight: 100,
      parentTop: 0,
      parentHeight: 200,
    });
    expect(isElementVisibleInScrollParent(el, parent, { threshold: 0.35 })).toBe(false);
  });

  it("treats partial visibility at the threshold boundary", () => {
    const { el, parent } = makeRects({
      elTop: 165,
      elHeight: 100,
      parentTop: 0,
      parentHeight: 200,
    });
    expect(isElementVisibleInScrollParent(el, parent, { threshold: 0.35 })).toBe(true);
    expect(isElementVisibleInScrollParent(el, parent, { threshold: 0.4 })).toBe(false);
  });
});

describe("pathRouteWithCurrentFocus", () => {
  it("returns path route with focus query", () => {
    expect(pathRouteWithCurrentFocus()).toEqual({
      name: "path",
      query: { focus: "current" },
    });
  });
});