import { describe, it, expect, beforeEach } from "vitest";
import {
  getReadingBookmark,
  setReadingBookmark,
  clearReadingBookmark,
  toggleReadingBookmark,
} from "../readingBookmark.js";

describe("readingBookmark", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("stores and retrieves reading bookmark for an imported article", () => {
    expect(getReadingBookmark(101, true)).toBeNull();
    const saved = setReadingBookmark(101, { pidx: 5, time: 142.5 }, true);
    expect(saved.pidx).toBe(5);
    expect(saved.time).toBe(142.5);

    const retrieved = getReadingBookmark(101, true);
    expect(retrieved).not.toBeNull();
    expect(retrieved.pidx).toBe(5);
    expect(retrieved.time).toBe(142.5);
  });

  it("toggles bookmark: removes when already matching, sets when different", () => {
    // 1st toggle: sets bookmark
    const res1 = toggleReadingBookmark(101, { pidx: 3, time: 45 }, true);
    expect(res1.saved).toBe(true);
    expect(res1.bookmark.pidx).toBe(3);
    expect(getReadingBookmark(101, true)?.pidx).toBe(3);

    // 2nd toggle at the same paragraph: clears bookmark
    const res2 = toggleReadingBookmark(101, { pidx: 3, time: 45 }, true);
    expect(res2.saved).toBe(false);
    expect(res2.bookmark).toBeNull();
    expect(getReadingBookmark(101, true)).toBeNull();

    // 3rd toggle at a different paragraph: sets new bookmark
    const res3 = toggleReadingBookmark(101, { pidx: 7, time: 90 }, true);
    expect(res3.saved).toBe(true);
    expect(res3.bookmark.pidx).toBe(7);
    expect(getReadingBookmark(101, true)?.pidx).toBe(7);
  });

  it("clearReadingBookmark removes the stored entry", () => {
    setReadingBookmark(202, { pidx: 2, time: 20 }, true);
    expect(getReadingBookmark(202, true)).not.toBeNull();
    clearReadingBookmark(202, true);
    expect(getReadingBookmark(202, true)).toBeNull();
  });
});
