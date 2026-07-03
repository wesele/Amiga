import { describe, it, expect, vi } from "vitest";
import {
  clampParagraphIndex,
  extractReadableParagraphs,
  findParagraphIndexInViewport,
  scrollToParagraph,
  shouldPauseListenAlong,
  stripMarkdownBold,
} from "../articleListenAlong.js";

describe("stripMarkdownBold", () => {
  it("removes bold markers", () => {
    expect(stripMarkdownBold("The **tipos** rose.")).toBe("The tipos rose.");
  });
});

describe("extractReadableParagraphs", () => {
  it("splits on blank lines and strips markdown", () => {
    const body = "First **bold** para.\n\nSecond para.";
    expect(extractReadableParagraphs(body)).toEqual([
      "First bold para.",
      "Second para.",
    ]);
  });

  it("returns empty for empty input", () => {
    expect(extractReadableParagraphs("")).toEqual([]);
  });
});

describe("clampParagraphIndex", () => {
  it("clamps out-of-range values", () => {
    expect(clampParagraphIndex(-1, 5)).toBe(0);
    expect(clampParagraphIndex(3, 5)).toBe(3);
    expect(clampParagraphIndex(9, 5)).toBe(4);
    expect(clampParagraphIndex(0, 0)).toBe(0);
  });
});

describe("shouldPauseListenAlong", () => {
  it("returns false when nothing blocks playback", () => {
    expect(shouldPauseListenAlong({})).toBe(false);
  });

  it("returns true when micro-review is open", () => {
    expect(shouldPauseListenAlong({ microReviewOpen: true })).toBe(true);
  });

  it("returns true when word popup or selection is active", () => {
    expect(shouldPauseListenAlong({ wordPopupOpen: true })).toBe(true);
    expect(shouldPauseListenAlong({ selectionActive: true })).toBe(true);
  });

  it("returns true when comprehension overlay is open", () => {
    expect(shouldPauseListenAlong({ overlayOpen: true })).toBe(true);
  });
});

describe("scrollToParagraph", () => {
  it("returns false when elements are missing", () => {
    expect(scrollToParagraph(null, null)).toBe(false);
  });

  it("scrolls the container toward the paragraph", () => {
    const articleBodyEl = {
      scrollTop: 0,
      getBoundingClientRect: () => ({ top: 0, height: 400 }),
      scrollTo: vi.fn(),
    };
    const paragraphEl = {
      getBoundingClientRect: () => ({ top: 200, height: 40 }),
    };
    expect(scrollToParagraph(articleBodyEl, paragraphEl)).toBe(true);
    expect(articleBodyEl.scrollTo).toHaveBeenCalledWith({
      top: 20,
      behavior: "smooth",
    });
  });
});

describe("findParagraphIndexInViewport", () => {
  it("returns 0 when body is missing", () => {
    expect(findParagraphIndexInViewport(null)).toBe(0);
  });

  it("picks the paragraph closest to viewport center", () => {
    const articleBodyEl = {
      getBoundingClientRect: () => ({ top: 0, height: 400 }),
      querySelectorAll: () => [
        { getBoundingClientRect: () => ({ top: 10, height: 30 }) },
        { getBoundingClientRect: () => ({ top: 180, height: 30 }) },
        { getBoundingClientRect: () => ({ top: 360, height: 30 }) },
      ],
    };
    expect(findParagraphIndexInViewport(articleBodyEl)).toBe(1);
  });
});